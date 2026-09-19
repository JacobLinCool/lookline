import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq, looks, users } from '@lookline/db'
import { getLineage } from '@lookline/engine'
import { Button, Container, LookCard, Notice } from '@/components/ui'
import { callEngine } from '@/components/trends/engine-guard'
import { LineageStatsPanel, LineageTreeView } from '@/components/trends/lineage-tree'
import { getI18n } from '@/i18n/server'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { isEngineView } from '@/server/engine-view'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.looks.lineage.title }
}

export default async function LineagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = getDb()
  const [row, viewer, engineView, { t }] = await Promise.all([
    db
      .select({ look: looks, owner: users })
      .from(looks)
      .innerJoin(users, eq(looks.ownerId, users.id))
      .where(eq(looks.id, id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getSessionUser(),
    isEngineView(),
    getI18n(),
  ])
  if (!row) notFound()
  const { look, owner } = row
  // Same rule as the Look page: a private Look is only visible to its owner.
  if (look.visibility === 'private' && viewer?.id !== look.ownerId) notFound()

  const lineage = await callEngine('getLineage', () => getLineage(db, look.id))
  const tree = lineage.ok ? lineage.value : null

  return (
    <Container className="pb-16">
      <div className="flex flex-col gap-4 pt-8 pb-6 md:flex-row md:items-end md:justify-between md:pt-10">
        <h1 className="display text-[30px] md:text-[36px]">{t.looks.lineage.title}</h1>
        <Button href={`/looks/${look.id}`} variant="secondary" size="sm">
          {t.looks.lineage.back}
        </Button>
      </div>

      {tree?.path && tree.path.length > 1 ? (
        <nav aria-label={t.looks.lineage.path} className="mb-6">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]">
            {tree.path.map((step, i) => (
              <li key={step.id} className="flex items-center gap-2">
                {i > 0 ? (
                  <span className="text-muted" aria-hidden>
                    →
                  </span>
                ) : null}
                {step.id === look.id ? (
                  <span className="font-medium">{step.title}</span>
                ) : (
                  <Link
                    href={`/looks/${step.id}/lineage`}
                    className="text-muted underline decoration-line underline-offset-4 hover:text-ink"
                  >
                    {step.title}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {tree ? (
        <div
          className={
            engineView
              ? 'grid gap-8 lg:grid-cols-[14rem_1fr_16rem]'
              : 'grid gap-8 lg:grid-cols-[14rem_1fr]'
          }
        >
          <div className="max-w-56">
            <LookCard look={tree.root.look} owner={tree.root.owner} priority />
          </div>
          <LineageTreeView tree={tree} currentId={look.id} />
          {engineView ? (
            <div className="rounded-md bg-mist p-4">
              <LineageStatsPanel stats={tree.stats} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
          <div className="max-w-56">
            <LookCard look={look} owner={owner} priority />
          </div>
          {!lineage.ok ? <Notice tone="warning">{t.looks.lineage.unavailable}</Notice> : null}
        </div>
      )}
    </Container>
  )
}
