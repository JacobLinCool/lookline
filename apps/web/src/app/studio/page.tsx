import type { Metadata } from 'next'
import { ShoppingBag, Sparkles } from 'lucide-react'
import { eq, inArray, articles as articlesTable, personas } from '@lookline/db'
import { MAX_PIECES_PER_CARD, availableArticles, creditBalance } from '@lookline/engine'
import { Button, Container, EmptyState, Notice, PageHeader } from '@/components/ui'
import {
  StudioPicker,
  type PickerArticle,
  type PickerPersona,
} from '@/components/cards/studio-picker'
import { expireStaleSessions } from '@/server/actions/studio'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'

export async function generateMetadata(): Promise<Metadata> {
  return { title: '製卡工作室', robots: { index: false } }
}

const ERRORS: Record<string, string> = {
  persona: '那位 persona 不是你管理的。',
  empty: '至少挑一件衣服。',
  unauthorised: '挑的衣服不在你的衣櫃裡，也沒有朋友借給你。',
  credits: '額度不足。每件滿 NT$320 的購買會給 3 次。',
  session: '找不到那個製卡階段。',
  'too-many': `一張卡最多放 ${MAX_PIECES_PER_CARD} 件。`,
}

/**
 * Step one of making a card: who it is of, and what they wear. Both are fixed when the session
 * opens, so the card can only ever show clothes this account really had the right to use.
 */
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string; error?: string }>
}) {
  const user = await requireUser('/studio')
  // No scheduler here, so arriving at the studio is what retires sessions that ran out of time
  // and hands their credits back.
  await expireStaleSessions(user.id).catch(() => {})
  const { db } = getDb()
  const params = await searchParams

  const [mine, wardrobe, credits] = await Promise.all([
    db.select().from(personas).where(eq(personas.ownerUserId, user.id)),
    availableArticles(db, user.id),
    creditBalance(db, user.id),
  ])

  const ids = [...new Set(wardrobe.map((w) => w.articleId))]
  const rows = ids.length
    ? await db
        .select({
          id: articlesTable.id,
          name: articlesTable.name,
          colorFamily: articlesTable.colorFamily,
          categoryGroup: articlesTable.categoryGroup,
          imagePath: articlesTable.imagePath,
        })
        .from(articlesTable)
        .where(inArray(articlesTable.id, ids))
    : []
  const byId = new Map(rows.map((r) => [r.id, r]))

  const pickable: PickerArticle[] = wardrobe
    .filter((w) => byId.has(w.articleId))
    .map((w) => ({
      articleId: w.articleId,
      name: byId.get(w.articleId)!.name,
      categoryGroup: byId.get(w.articleId)!.categoryGroup,
      source: w.source,
      // 440 of the catalogue's articles were never photographed; passing the path through is what
      // keeps those tiles on the tonal ground instead of asking for an image that 404s.
      imagePath: byId.get(w.articleId)!.imagePath,
    }))

  const people: PickerPersona[] = mine.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    kind: p.kind,
    avatarSeed: p.avatarSeed,
  }))

  return (
    <Container className="flex flex-col gap-6 py-8">
      <PageHeader
        title="製卡工作室"
        description="挑一位主角和幾件你衣櫃裡的衣服，用 1 次額度生成最多 4 張候選，選最喜歡的一張正式發行。"
        actions={
          <span className="text-[13px] text-muted">
            額度 <span className="tabular text-[15px] font-semibold text-ink">{credits}</span>
          </span>
        }
      />

      {params.error ? (
        <Notice tone="warning">{ERRORS[params.error] ?? '請再試一次。'}</Notice>
      ) : null}

      {people.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="先建立一位 persona"
          description="小卡需要一位主角 —— 你自己、家人，或一個虛擬形象。"
          action={<Button href="/me/personas">建立 persona</Button>}
        />
      ) : pickable.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag />}
          title="衣櫃還是空的"
          description="買過的每一件都會進衣櫃，之後就能穿在小卡上。"
          action={<Button href="/shop">去選購</Button>}
        />
      ) : (
        <StudioPicker
          personas={people}
          articles={pickable}
          credits={credits}
          selectedPersona={params.persona ?? people[0]?.id ?? ''}
        />
      )}
    </Container>
  )
}
