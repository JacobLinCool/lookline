import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { and, cardSessions, collectionMembers, collections, eq, personas } from '@lookline/db'
import { MAX_CANDIDATES_PER_SESSION, candidatesOf } from '@lookline/engine'
import { Container, PageHeader, Tag } from '@/components/ui'
import { EditionCandidates } from '@/components/cards/edition-candidates'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'

export async function generateMetadata(): Promise<Metadata> {
  return { title: '挑一張多人卡 · Lookline' }
}

/** Same four-candidate mechanism as a personal card; the difference is what settling produces. */
export default async function IssueEditionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>
}) {
  const user = await requireUser('/collections')
  const { db } = getDb()
  const { id, sessionId } = await params

  const [session] = await db
    .select()
    .from(cardSessions)
    .where(and(eq(cardSessions.id, sessionId), eq(cardSessions.ownerUserId, user.id)))
    .limit(1)
  if (!session) notFound()

  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1)
  if (!collection) notFound()

  const members = await db
    .select({ personaName: personas.displayName })
    .from(collectionMembers)
    .innerJoin(personas, eq(personas.id, collectionMembers.personaId))
    .where(eq(collectionMembers.collectionId, id))

  const made = await candidatesOf(db, sessionId)

  return (
    <Container className="flex flex-col gap-6 py-8">
      <PageHeader
        title="挑一張多人卡"
        description={`${collection.title} · 定稿後會發行 ${members.length} 份，每位 persona 各 1 份`}
      />
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <Tag key={m.personaName}>{m.personaName}</Tag>
        ))}
      </div>
      <EditionCandidates
        collectionId={id}
        sessionId={sessionId}
        candidates={made.map((c) => ({ id: c.id, position: c.position }))}
        max={MAX_CANDIDATES_PER_SESSION}
        editionSize={members.length}
        settled={session.state !== 'open'}
      />
    </Container>
  )
}
