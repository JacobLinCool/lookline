import Link from 'next/link'
import { Container } from '@/components/ui'
import { logoutAction } from '@/server/actions/auth'
import { toggleEngineViewAction } from '@/server/actions/engine-view'
import { getSessionUser } from '@/server/auth'
import { isEngineView } from '@/server/engine-view'

const link = 'text-[13px] text-muted transition-colors hover:text-ink'

/** Quiet footer: the team's and the judges' doors live here, not in the primary navigation. */
export async function SiteFooter() {
  const [engine, user] = await Promise.all([isEngineView(), getSessionUser()])
  return (
    <footer className="mt-16 border-t border-line">
      <Container className="flex flex-col gap-5 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <span className="display text-[16px] font-bold tracking-[-0.03em]">Lookline</span>
          <span className="text-[12px] text-muted">
            Meichu Hackathon 2026 × Makalot · Prototype
          </span>
        </div>
        <nav aria-label="Secondary" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/trends" className={link}>
            Trends for Makalot
          </Link>
          <Link href="/together" className={link}>
            Prototype tour
          </Link>
          <Link href="/admin" className={link}>
            Engine lab
          </Link>
          <form action={toggleEngineViewAction} className="contents">
            <input type="hidden" name="on" value={engine ? '0' : '1'} />
            <button type="submit" className={link} aria-pressed={engine}>
              Engine view · {engine ? 'on' : 'off'}
            </button>
          </form>
          {user ? (
            <form action={logoutAction} className="contents">
              <button type="submit" className={link}>
                Sign out
              </button>
            </form>
          ) : null}
        </nav>
      </Container>
    </footer>
  )
}
