/**
 * Rendering a card candidate with the image model.
 *
 * A render takes tens of seconds, so `generateCandidateAction` cannot wait for it. The attempt row
 * is written first and the render happens in `after()`; the candidate row is inserted only once
 * there is a picture, which is what keeps a failed render from occupying one of the four places.
 * `/api/studio/[id]/candidates` is what the page polls in the meantime.
 *
 * A failed provider call remains a failed attempt and never fabricates a candidate.
 */
import { after } from 'next/server'
import {
  and,
  articles as articlesTable,
  cardSessions,
  desc,
  eq,
  generationAttempts,
  inArray,
  lt,
  personas as personasTable,
  type Article,
  type CardArtDirection,
  type CardSession,
} from '@lookline/db'
import {
  addCandidate,
  buildCardImagePrompt,
  candidatesOf,
  cardReferenceLabels,
  failAttempt,
  getLlm,
  type CardPromptSubject,
  type ReferenceImage,
} from '@lookline/engine'
import { getDb } from './db'
import { loadStoredPhoto, type ReferencePhoto } from './imagery'
import { getStorage } from './storage'

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** The whole render, including reading the references. Well inside the worker's 60 s of CPU. */
const RENDER_DEADLINE_MS = 40_000

/**
 * The most garment photographs one render attaches. A card holds up to `MAX_PIECES_PER_CARD`
 * pieces and an edition holds that many per persona, so without a cap a six-person collection
 * would attach fifty images. Anything past the cap is still described in words.
 */
const MAX_GARMENT_REFERENCES = 8
/** The most persona photographs one render attaches, for the same reason. */
const MAX_PERSON_REFERENCES = 4

type SnapshotEntry = { articleId: string; personaId?: string }

/** The subjects of this session's artwork, in the order their bands should read. */
async function subjectsOf(session: CardSession): Promise<
  Array<{
    personaId: string
    name: string
    kind: 'person' | 'avatar'
    referencePath: string | null
    articles: Article[]
  }>
> {
  const { db } = getDb()
  const snapshot: SnapshotEntry[] = session.articleSnapshot ?? []
  const articleIds = [...new Set(snapshot.map((s) => s.articleId))]
  // An edition names a persona per piece; a personal card names none and the session's own
  // persona wears everything.
  const personaIds = [...new Set(snapshot.map((s) => s.personaId).filter((p): p is string => !!p))]
  const wanted = personaIds.length > 0 ? personaIds : [session.personaId]

  const [rows, people] = await Promise.all([
    articleIds.length > 0
      ? db.select().from(articlesTable).where(inArray(articlesTable.id, articleIds))
      : Promise.resolve([]),
    db.select().from(personasTable).where(inArray(personasTable.id, wanted)),
  ])
  const articleById = new Map(rows.map((r) => [r.id, r]))
  const personaById = new Map(people.map((p) => [p.id, p]))

  return wanted.flatMap((personaId) => {
    const persona = personaById.get(personaId)
    if (!persona) return []
    const mine = snapshot.filter((s) => (personaIds.length > 0 ? s.personaId === personaId : true))
    return [
      {
        personaId,
        name: persona.displayName,
        // Decides how the prompt describes the subject: a persona marked 虛擬 is reproduced as
        // the figure in its photograph rather than rewritten into a human being.
        kind: persona.kind,
        referencePath: persona.referencePath,
        articles: mine.flatMap((s) => {
          const article = articleById.get(s.articleId)
          return article ? [article] : []
        }),
      },
    ]
  })
}

/**
 * The prompt and the reference images for one render, in the order `buildCardImagePrompt` names
 * them: every garment, in subject order, then every persona photograph, in the same order. The
 * two must agree or the labels point at the wrong pictures, so they are built together here.
 */
async function composeRequest(
  session: CardSession,
  artDirection: CardArtDirection,
  authorName: string,
  collectionTitle: string | null,
): Promise<{ prompt: string; referenceImages: ReferenceImage[] }> {
  const subjects = await subjectsOf(session)

  let garmentBudget = MAX_GARMENT_REFERENCES
  const garmentPhotos: ReferencePhoto[] = []
  const promptSubjects: CardPromptSubject[] = []
  const personPhotos: ReferencePhoto[] = []
  let personBudget = MAX_PERSON_REFERENCES

  for (const subject of subjects) {
    const loaded = await Promise.all(
      subject.articles.map(async (article, i) =>
        i < garmentBudget ? loadStoredPhoto(article.imagePath) : null,
      ),
    )
    const withImages = subject.articles.map((article, i) => ({
      ...article,
      hasImage: loaded[i] !== null,
    }))
    for (const photo of loaded) if (photo) garmentPhotos.push(photo)
    garmentBudget -= loaded.filter((p) => p !== null).length

    const person = personBudget > 0 ? await loadStoredPhoto(subject.referencePath) : null
    if (person) {
      personPhotos.push(person)
      personBudget -= 1
    }
    promptSubjects.push({
      name: subject.name,
      kind: subject.kind,
      hasPhoto: person !== null,
      articles: withImages,
    })
  }

  const prompt = buildCardImagePrompt({
    artDirection,
    subjects: promptSubjects,
    authorName,
    collectionTitle,
  })
  // The same list the prompt names its images by, so the two cannot drift apart.
  const labels = cardReferenceLabels(promptSubjects)
  return {
    prompt,
    referenceImages: [...garmentPhotos, ...personPhotos].map((image, i) => ({
      ...image,
      label: labels[i],
    })),
  }
}

/**
 * Render one candidate and record it. Runs after the response, so nothing it throws can reach the
 * visitor — a failure is written to the attempt and the page reads it from there.
 */
async function renderCandidate(input: {
  sessionId: string
  attemptId: string
  candidateId: string
  authorName: string
  collectionTitle: string | null
}): Promise<void> {
  const { db } = getDb()
  const startedAt = Date.now()
  let key: string | null = null
  try {
    const [row] = await db
      .select({ session: cardSessions, artDirection: generationAttempts.artDirection })
      .from(cardSessions)
      .innerJoin(generationAttempts, eq(generationAttempts.id, input.attemptId))
      .where(eq(cardSessions.id, input.sessionId))
      .limit(1)
    const session = row?.session
    if (!session) throw new Error('這個製卡階段已經不存在了。')
    if (session.state !== 'open') throw new Error('這個製卡階段已經結束了。')

    const { prompt, referenceImages } = await composeRequest(
      session,
      row.artDirection,
      input.authorName,
      input.collectionTitle,
    )
    const remaining = RENDER_DEADLINE_MS - (Date.now() - startedAt)
    if (remaining <= 0) throw new Error('生成逾時，額度還在，可以再試一次。')

    const result = await getLlm().generateImage({
      prompt,
      referenceImages,
      aspectRatio: '3:4',
      purpose: 'card',
      timeoutMs: remaining,
    })
    if (!result?.data.length) throw new Error('這次沒有生成出圖片，可以再試一次。')
    const ext = IMAGE_EXT[result.mimeType]
    if (!ext) throw new Error('生成服務回傳了不支援的圖片格式。')

    key = `cards/${input.candidateId}.${ext}`
    await getStorage().put(key, result.data, result.mimeType)

    const added = await addCandidate(db, {
      id: input.candidateId,
      sessionId: input.sessionId,
      attemptId: input.attemptId,
      imagePath: key,
      now: new Date(),
    })
    if (!added.ok) {
      // The session filled up or closed while the model was working. The picture belongs to
      // nothing now, so it is not left behind in the bucket.
      await getStorage()
        .delete(key)
        .catch(() => {})
      await failAttempt(db, {
        id: input.attemptId,
        error: added.reason === 'full' ? '候選已經滿了。' : '這個製卡階段已經結束了。',
        now: new Date(),
      })
    }
  } catch (error) {
    if (key) {
      await getStorage()
        .delete(key)
        .catch(() => {})
    }
    console.warn('[studio] candidate render failed', error)
    await failAttempt(db, {
      id: input.attemptId,
      error: error instanceof Error ? error.message : '生成失敗，可以再試一次。',
      now: new Date(),
    }).catch(() => {})
  }
}

/** Whether the configured provider can produce a real Card candidate. */
export function canRenderCards(): boolean {
  return Boolean(getLlm().imageModel)
}

/**
 * Schedule one candidate render. Returns as soon as the work is queued — the attempt row is
 * already `pending`, which is what the studio page shows and polls on.
 */
export function queueCandidateImage(input: {
  sessionId: string
  attemptId: string
  candidateId: string
  authorName: string
  collectionTitle: string | null
}): void {
  after(() => renderCandidate(input))
}

/**
 * A render that never reported back — the isolate died, the provider hung past its own timeout —
 * would otherwise hold one of the four places open for good and leave the page polling forever.
 * There is no scheduler here, so reading the session is what retires them.
 */
export async function expireStaleAttempts(sessionId: string): Promise<void> {
  const { db } = getDb()
  const cutoff = new Date(Date.now() - RENDER_DEADLINE_MS - 10_000)
  await db
    .update(generationAttempts)
    .set({ state: 'failed', error: '生成逾時，可以再試一次。', finishedAt: new Date() })
    .where(
      and(
        eq(generationAttempts.sessionId, sessionId),
        eq(generationAttempts.state, 'pending'),
        lt(generationAttempts.createdAt, cutoff),
      ),
    )
}

export interface StudioProgress {
  candidates: Array<{ id: string; position: number; artDirection: CardArtDirection }>
  /** Renders still running. The page shows one filling slot for each. */
  pending: number
  /** The most recent failure, once nothing is running to explain the empty slot. */
  error: string | null
}

/** What the studio page and its poll endpoint both read. */
export async function studioProgress(sessionId: string): Promise<StudioProgress> {
  const { db } = getDb()
  await expireStaleAttempts(sessionId)
  const [made, attempts] = await Promise.all([
    candidatesOf(db, sessionId),
    db
      .select({
        id: generationAttempts.id,
        state: generationAttempts.state,
        error: generationAttempts.error,
        artDirection: generationAttempts.artDirection,
        createdAt: generationAttempts.createdAt,
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.sessionId, sessionId))
      .orderBy(desc(generationAttempts.createdAt)),
  ])
  const pending = attempts.filter((a) => a.state === 'pending').length
  const failed = attempts.find((a) => a.state === 'failed' && a.error)
  const directionByAttempt = new Map(attempts.map((attempt) => [attempt.id, attempt.artDirection]))
  return {
    candidates: made.map((candidate) => ({
      id: candidate.id,
      position: candidate.position,
      artDirection: directionByAttempt.get(candidate.attemptId)!,
    })),
    pending,
    error: pending === 0 ? (failed?.error ?? null) : null,
  }
}
