import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { and, articles as articlesTable, cardSessions, eq, inArray, personas } from '@lookline/db'
import {
  MAX_CANDIDATES_PER_SESSION,
  candidatesOf,
  ownedRatioOf,
  tierForRatio,
} from '@lookline/engine'
import { Avatar, Container, Notice, PageHeader, Tag } from '@/components/ui'
import { CandidateGrid, type CandidateItem } from '@/components/cards/candidate-grid'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'

export async function generateMetadata(): Promise<Metadata> {
  return { title: '挑一張定稿 · Lookline' }
}

/**
 * Step two: generate up to four candidates and choose one. They are kept side by side and none
 * overwrites another, so the third can be the card as easily as the last.
 */
export default async function StudioSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const user = await requireUser('/studio')
  const { db } = getDb()
  const { id } = await params
  const query = await searchParams

  const [session] = await db
    .select()
    .from(cardSessions)
    .where(and(eq(cardSessions.id, id), eq(cardSessions.ownerUserId, user.id)))
    .limit(1)
  if (!session) notFound()

  const [persona] = await db
    .select()
    .from(personas)
    .where(eq(personas.id, session.personaId))
    .limit(1)

  const snapshot = session.articleSnapshot ?? []
  const ids = snapshot.map((s) => s.articleId)
  const worn = ids.length
    ? await db
        .select({ id: articlesTable.id, name: articlesTable.name })
        .from(articlesTable)
        .where(inArray(articlesTable.id, ids))
    : []
  const nameById = new Map(worn.map((w) => [w.id, w.name]))

  const made = await candidatesOf(db, id)
  const items: CandidateItem[] = made.map((c) => ({
    id: c.id,
    position: c.position,
  }))

  const ratio = ownedRatioOf(snapshot)
  const tier = tierForRatio(ratio)

  return (
    <Container className="flex flex-col gap-6 py-8">
      <PageHeader
        title="挑一張定稿"
        description={`${persona?.displayName ?? '主角'} · ${snapshot.length} 件服飾 · 等級 ${tier.labelZh}（自有 ${Math.round(ratio * 100)}%）`}
      />

      {query.error ? (
        <Notice tone="warning">
          {query.error === 'no-candidate' ? '那張候選不屬於這次製卡。' : '這個階段已經結束。'}
        </Notice>
      ) : null}

      <section className="flex flex-wrap items-center gap-2">
        {persona ? <Avatar seed={persona.avatarSeed} name={persona.displayName} size="xs" /> : null}
        {snapshot.map((s) => (
          <Tag key={s.articleId} tone={s.source === 'loan' ? 'accent' : undefined}>
            {nameById.get(s.articleId) ?? s.articleId}
            {s.source === 'loan' ? ' · 借用' : ''}
          </Tag>
        ))}
      </section>

      <CandidateGrid
        sessionId={id}
        candidates={items}
        max={MAX_CANDIDATES_PER_SESSION}
        settled={session.state !== 'open'}
      />
    </Container>
  )
}
