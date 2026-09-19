'use server'

import { after } from 'next/server'
import type { ActionResult } from '@/components/latency/instant-form'
import { redirect } from 'next/navigation'
import { answerAsk, createAsk, STYLE_PRESETS } from '@lookline/engine'
import {
  attempt,
  ensureInteraction,
  loadAskByToken,
  loadProductsByIds,
  loadUser,
  loadUserByHandle,
} from '@/components/social/data'
import { createGuest, getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { createLookDraft } from '@/server/look-generation'

/**
 * Ask — "Which one fits me better?" / "Style me".
 *
 * createAskAction   `<form>` on /asks/new. Fields: `kind` (choose | style_me), `question`,
 *                   `articleId` (repeated, 2–4 for choose), `lookId?`, `toUserId?`, `toHandle?`,
 *                   `budget?`, `occasion?`, `returnTo?`. Redirects to /asks/<id>.
 * answerAskAction   `<form>` on /a/[token] for kind choose. Fields: `token`, `choiceArticleId`,
 *                   `comment?`, `displayName?` (creates a guest when signed out).
 * answerStyleMeAction `<form>` on /a/[token] for kind style_me. Fields: `token`, `articleId`
 *                   (repeated, 1–4), `comment?`, `stylePreset?`, `displayName?`.
 *
 * The engine's createAsk / answerAsk own the rows; the ASK / ADVISE / STYLE interactions are
 * ensured here as well (deduplicated by actor + type + ask) so the graph is right whether or not
 * the engine writes them — see REQUESTS.md.
 */

const MAX_MESSAGE = 160

function text(value: FormDataEntryValue | null, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function ints(values: FormDataEntryValue[]): number[] {
  return [
    ...new Set(
      values.map((v) => Number(v)).filter((n): n is number => Number.isInteger(n) && n > 0),
    ),
  ]
}

function optionalInt(value: FormDataEntryValue | null): number | null {
  const s = text(value, 12)
  if (!s) return null
  const n = Number(s.replace(/[^\d]/g, ''))
  return Number.isInteger(n) && n > 0 ? n : null
}

function withParams(path: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

function shortMessage(error: string): string {
  return error.slice(0, MAX_MESSAGE)
}

async function resolveActor(formData: FormData): Promise<{ id: string; displayName: string }> {
  const user = await getSessionUser()
  if (user) return { id: user.id, displayName: user.displayName }
  const displayName = text(formData.get('displayName'), 40)
  if (!displayName) throw new Error('name')
  const guest = await createGuest(displayName)
  return { id: guest.id, displayName: guest.displayName }
}

export async function createAskAction(formData: FormData): Promise<ActionResult> {
  const kind = text(formData.get('kind'), 16) === 'style_me' ? 'style_me' : 'choose'
  const articleIds = ints(formData.getAll('articleId'))
  const lookId = text(formData.get('lookId'), 64) || null

  const user = await getSessionUser()
  if (!user) return { ok: false, message: 'Sign in to send this question.' }

  const question =
    text(formData.get('question'), 280) ||
    (kind === 'choose' ? 'Which one fits me better?' : 'Style me for the occasion below.')
  const budget = optionalInt(formData.get('budget'))
  const occasion = text(formData.get('occasion'), 80) || null

  if (kind === 'choose') {
    if (articleIds.length < 2 || articleIds.length > 4) {
      return { ok: false, message: 'Choose between two and four available pieces.' }
    }
    const found = await loadProductsByIds(articleIds)
    if (found.length !== articleIds.length)
      return { ok: false, message: 'Choose between two and four available pieces.' }
  }

  let targetUserId: string | null = text(formData.get('toUserId'), 64) || null
  const toHandle = text(formData.get('toHandle'), 40)
  if (!targetUserId && toHandle) {
    const target = await loadUserByHandle(toHandle)
    if (!target) return { ok: false, message: 'That person could not be found.' }
    targetUserId = target.id
  } else if (targetUserId) {
    const target = await loadUser(targetUserId)
    if (!target) targetUserId = null
  }
  if (targetUserId === user.id) targetUserId = null

  const created = await attempt(() =>
    createAsk(getDb().db, {
      askerId: user.id,
      kind,
      question,
      optionArticleIds: kind === 'choose' ? articleIds : [],
      lookId,
      targetUserId,
      budget: kind === 'style_me' ? budget : null,
      occasion: kind === 'style_me' ? occasion : null,
    }),
  )
  if (!created.ok) {
    return { ok: false, message: 'Your question could not be saved. Please retry.' }
  }

  return { ok: true, next: `/asks/${created.value.id}` }
}

export async function answerAskAction(formData: FormData): Promise<ActionResult> {
  const token = text(formData.get('token'), 128)
  if (!token) return { ok: false, message: 'This question is unavailable.' }
  const back = `/a/${encodeURIComponent(token)}`

  const bundle = await loadAskByToken(token)
  if (!bundle) return { ok: false, message: 'This question is unavailable.' }
  const { ask, asker, options } = bundle
  if (ask.kind !== 'choose')
    return { ok: false, message: 'Choose a styling response for this question.' }

  const choiceArticleId = optionalInt(formData.get('choiceArticleId'))
  if (!choiceArticleId || !options.some((p) => p.id === choiceArticleId)) {
    return { ok: false, message: 'Choose one of the available pieces.' }
  }
  const comment = text(formData.get('comment'), 500) || null

  let actor: { id: string; displayName: string }
  try {
    actor = await resolveActor(formData)
  } catch {
    return { ok: false, message: 'Enter your name to answer.' }
  }
  if (actor.id === asker.id) return { ok: true, next: `/asks/${ask.id}` }

  const answered = await attempt(() =>
    answerAsk(
      getDb().db,
      {
        askId: ask.id,
        responderUserId: actor.id,
        responderName: actor.displayName,
        choiceArticleId,
        comment,
      },
      { deferFeedback: after },
    ),
  )
  if (!answered.ok) {
    return { ok: false, message: 'Your answer could not be saved. Please retry.' }
  }

  return { ok: true, next: withParams(back, { answered: answered.value.id }) }
}

export async function answerStyleMeAction(formData: FormData): Promise<void> {
  const token = text(formData.get('token'), 128)
  if (!token) redirect('/')
  const back = `/a/${encodeURIComponent(token)}`

  const bundle = await loadAskByToken(token)
  if (!bundle) redirect(back)
  const { ask, asker } = bundle
  if (ask.kind !== 'style_me') redirect(back)

  const articleIds = ints(formData.getAll('articleId')).slice(0, 4)
  const picks = await loadProductsByIds(articleIds)
  if (picks.length === 0) redirect(withParams(back, { error: 'picks' }))
  const comment = text(formData.get('comment'), 500) || null
  const requestedPreset = text(formData.get('stylePreset'), 64)
  const stylePreset =
    STYLE_PRESETS.find((p) => p.slug === requestedPreset)?.slug ??
    STYLE_PRESETS[0]?.slug ??
    (requestedPreset || 'editorial')

  let actor: { id: string; displayName: string }
  try {
    actor = await resolveActor(formData)
  } catch {
    redirect(withParams(back, { error: 'name' }))
  }
  if (actor.id === asker.id) redirect(`/asks/${ask.id}`)

  // The "Styled by Alice for Jacob" moment: a link-visible Look owned by the asker.
  const styled = await attempt(() =>
    createLookDraft({
      ownerId: asker.id,
      articleIds: picks.map((p) => p.id),
      stylePreset,
      kind: 'edition',
      title: `Styled by ${actor.displayName} for ${asker.displayName}`,
      occasion: ask.occasion,
      prompt: ask.question,
      visibility: 'link',
    }),
  )
  const styledLookId = styled.ok ? styled.value.id : null
  const pickSummary = picks.map((p) => `${p.brandName} ${p.name}`).join(' · ')
  const fullComment = styledLookId
    ? comment
    : [comment, `Picks: ${pickSummary}`].filter(Boolean).join('\n')

  const answered = await attempt(() =>
    answerAsk(getDb().db, {
      askId: ask.id,
      responderUserId: actor.id,
      responderName: actor.displayName,
      styledLookId,
      comment: fullComment,
    }),
  )
  if (!answered.ok) {
    redirect(withParams(back, { error: 'engine', message: shortMessage(answered.error) }))
  }

  await ensureInteraction(getDb().db, {
    actorUserId: actor.id,
    type: 'STYLE',
    targetUserId: asker.id,
    askId: ask.id,
    lookId: styledLookId,
    payload: { responseId: answered.value.id, articleIds: picks.map((p) => p.id), source: 'web' },
  })

  redirect(
    withParams(back, {
      answered: answered.value.id,
      lookError: styled.ok ? null : shortMessage(styled.error),
    }),
  )
}
