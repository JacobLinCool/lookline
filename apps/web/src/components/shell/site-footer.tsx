import Link from 'next/link'
import { Container } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { logoutAction } from '@/server/actions/auth'
import { toggleEngineViewAction } from '@/server/actions/engine-view'
import { getSessionUser } from '@/server/auth'
import { isEngineView } from '@/server/engine-view'
import { LocaleSwitcher } from './locale-switcher'

const link = 'text-[13px] text-muted transition-colors hover:text-ink'

/** Quiet footer: the team's and the judges' doors live here, not in the primary navigation. */
export async function SiteFooter() {
  const [engine, user, { locale, t }] = await Promise.all([
    isEngineView(),
    getSessionUser(),
    getI18n(),
  ])
  return (
    <footer className="mt-16 border-t border-line">
      <Container className="flex flex-col gap-5 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <span className="display text-[16px] font-bold tracking-[-0.03em]">Lookline</span>
          <span className="text-[12px] text-muted">{t.nav.tagline}</span>
        </div>
        <nav aria-label={t.nav.secondary} className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/trends" className={link}>
            {t.nav.trends}
          </Link>
          <Link href="/admin" className={link}>
            {t.nav.lab}
          </Link>
          <form action={toggleEngineViewAction} className="contents">
            <input type="hidden" name="on" value={engine ? '0' : '1'} />
            <button type="submit" className={link} aria-pressed={engine}>
              {t.nav.engineView} · {engine ? t.common.on : t.common.off}
            </button>
          </form>
          {user ? (
            <form action={logoutAction} className="contents">
              <button type="submit" className={link}>
                {t.common.signOut}
              </button>
            </form>
          ) : null}
          <LocaleSwitcher locale={locale} label={t.nav.language} />
        </nav>
      </Container>
    </footer>
  )
}
