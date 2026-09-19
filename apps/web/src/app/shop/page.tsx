import type { Metadata } from 'next'
import { searchProducts } from '@lookline/engine'
import { callEngine } from '@/components/shop/engine'
import { parseProductSearch, type RawSearchParams } from '@/components/shop/query'
import { ShopWorkspace } from '@/components/shop/workspace'
import { Container } from '@/components/ui'
import { getDb } from '@/server/db'
import { getSessionUser } from '@/server/auth'

export const metadata: Metadata = { title: 'Shop' }

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const search = parseProductSearch(await searchParams)
  const [result, user] = await Promise.all([
    callEngine('searchProducts', () => searchProducts(getDb().db, search)),
    getSessionUser(),
  ])
  return (
    <Container size="wide" className="pb-24">
      <h1 className="sr-only">Shop</h1>
      <ShopWorkspace
        initialSearch={search}
        initialResult={result.ok ? result.value : null}
        initialError={result.ok ? null : 'Pieces could not be loaded.'}
        signedIn={Boolean(user)}
        semanticAvailable={Boolean(process.env.TYPESAFE_API_KEY)}
        voiceAvailable={Boolean(process.env.GEMINI_API_KEY)}
      />
    </Container>
  )
}
