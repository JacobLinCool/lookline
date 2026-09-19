'use server'

import { redirect } from 'next/navigation'
import { STYLE_PRESETS } from '@lookline/engine'
import {
  attempt,
  loadLookById,
  loadLookByToken,
  loadUser,
  loadUserLooks,
  OCCASION_OPTIONS,
} from '@/components/social/data'
import { getSessionUser, safeNextPath } from '@/server/auth'
import { createLookDraft } from '@/server/look-generation'

/**
 * Together — two or more people's Looks become one shared edition for an occasion.
 *
 * createTogetherAction `<form>` on /looks/[id]/together. Fields: `sourceLookId` (the viewer's
 * contribution), `participantId` (repeated, people from the network), `look-<userId>?` (which of
 * that person's Looks to use; defaults to their latest), `token?` (a friend's /l/<token> link or
 * bare token), `occasion` (travel | wedding | festival | date | graduation | party | seasonal),
 * `note?` (free text), `stylePreset?`, `title?`. Products are the union of every participant's
 * Look, deduplicated by product id. The engine's createLook records TOGETHER interactions.
 */

const MAX_MESSAGE = 160

function text(value: FormDataEntryValue | null, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function withParams(path: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

function parseToken(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/\/l\/([^/?#]+)/)
  return decodeURIComponent(match?.[1] ?? trimmed)
}

export async function createTogetherAction(formData: FormData): Promise<void> {
  const sourceLookId = text(formData.get('sourceLookId'), 64)
  if (!sourceLookId) redirect('/')
  const page = `/looks/${encodeURIComponent(sourceLookId)}/together`

  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(page))}`)

  const source = await loadLookById(sourceLookId)
  if (!source) redirect('/')

  const occasionValue = text(formData.get('occasion'), 40)
  const occasion = OCCASION_OPTIONS.find((o) => o.value === occasionValue)
  if (!occasion) redirect(withParams(page, { error: 'occasion' }))
  const note = text(formData.get('note'), 280) || null

  // Contributions: the source Look, each selected person's chosen (or latest) Look, and an
  // optional friend's Look reached by share token.
  const contributions: Array<{
    userId: string
    displayName: string
    lookId: string
    articleIds: string[]
  }> = [
    {
      userId: source.owner.id,
      displayName: source.owner.displayName,
      lookId: source.look.id,
      articleIds: source.articles.map((p) => p.id),
    },
  ]

  const participantIds = [
    ...new Set(
      formData
        .getAll('participantId')
        .map((v) => text(v, 64))
        .filter((id) => id && id !== source.owner.id),
    ),
  ]
  for (const participantId of participantIds) {
    const person = await loadUser(participantId)
    if (!person) continue
    const wanted = text(formData.get(`look-${participantId}`), 64)
    const theirLooks = await loadUserLooks(participantId, 12)
    const chosen = theirLooks.find((l) => l.id === wanted) ?? theirLooks[0]
    if (!chosen) redirect(withParams(page, { error: 'no-look', who: person.displayName }))
    const bundle = await loadLookById(chosen.id)
    if (!bundle) continue
    contributions.push({
      userId: person.id,
      displayName: person.displayName,
      lookId: bundle.look.id,
      articleIds: bundle.articles.map((p) => p.id),
    })
  }

  const tokenInput = text(formData.get('token'), 400)
  if (tokenInput) {
    const bundle = await loadLookByToken(parseToken(tokenInput))
    if (!bundle) redirect(withParams(page, { error: 'token' }))
    if (!contributions.some((c) => c.userId === bundle.owner.id)) {
      contributions.push({
        userId: bundle.owner.id,
        displayName: bundle.owner.displayName,
        lookId: bundle.look.id,
        articleIds: bundle.articles.map((p) => p.id),
      })
    }
  }

  if (contributions.length < 2) redirect(withParams(page, { error: 'participants' }))

  const articleIds = [...new Set(contributions.flatMap((c) => c.articleIds))]
  if (articleIds.length === 0) redirect(withParams(page, { error: 'articles' }))

  const requestedPreset = text(formData.get('stylePreset'), 64)
  const stylePreset =
    STYLE_PRESETS.find((p) => p.slug === requestedPreset)?.slug ??
    (requestedPreset || source.look.stylePreset)

  const names = contributions.map((c) => c.displayName)
  const title =
    text(formData.get('title'), 120) ||
    `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} · ${occasion.label}`

  const created = await attempt(() =>
    createLookDraft({
      ownerId: user.id,
      articleIds,
      stylePreset,
      kind: 'together',
      participantIds: [...new Set([user.id, ...contributions.map((c) => c.userId)])],
      occasion: occasion.value,
      prompt: note,
      title,
      parentLookId: source.look.id,
      visibility: 'link',
    }),
  )
  if (!created.ok) {
    redirect(withParams(page, { error: 'look', message: created.error.slice(0, MAX_MESSAGE) }))
  }

  redirect(`/looks/${created.value.id}`)
}
