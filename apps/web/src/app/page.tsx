import type { Metadata } from 'next'
import { IntentWorkspace } from '@/components/intent/workspace'
import { paramList, paramString } from '@/components/intent/urls'
import { getI18n } from '@/i18n/server'
import { getSessionUser } from '@/server/auth'
import { isEngineView } from '@/server/engine-view'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.home.metaTitle }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [params, user, engineView] = await Promise.all([
    searchParams,
    getSessionUser(),
    isEngineView(),
  ])
  const query = {
    q: paramString(params.q).trim().slice(0, 500),
    clarify: paramList(params.clarify),
    previous: paramString(params.previous) || null,
  }
  return <IntentWorkspace initialQuery={query} signedIn={user !== null} engineView={engineView} />
}
