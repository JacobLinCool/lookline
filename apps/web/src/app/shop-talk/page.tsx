import type { Metadata } from 'next'
import { searchProducts } from '@lookline/engine'
import { callEngine } from '@/components/shop/engine'
import { parseProductSearch, type RawSearchParams } from '@/components/shop/query'
import { ShopTalkWorkspace } from '@/components/shop-talk/workspace'
import { Container } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { getDb } from '@/server/db'
import { getSessionUser } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.shopTalk.title }
}

export default async function ShopTalkPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const search = parseProductSearch(await searchParams)
  const { t } = await getI18n()
  const [result, user] = await Promise.all([
    callEngine('searchProducts', () => searchProducts(getDb().db, search)),
    getSessionUser(),
  ])
  return (
    <Container size="wide">
      <ShopTalkWorkspace
        initialSearch={search}
        initialResult={result.ok ? result.value : null}
        initialError={result.ok ? null : t.shop.loadError}
        signedIn={Boolean(user)}
        available={Boolean(process.env.GEMINI_API_KEY && process.env.TYPESAFE_API_KEY)}
      />
    </Container>
  )
}
