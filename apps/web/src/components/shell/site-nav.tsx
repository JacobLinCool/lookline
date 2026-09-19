import Link from 'next/link'
import { LogIn, ShoppingBag } from 'lucide-react'
import { Avatar, Badge, Button, Container } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { getSessionUser } from '@/server/auth'
import { bagCount } from '@/server/bag'
import { NavLinks } from './nav-links'
import { Wordmark } from './wordmark'

/** Sticky top bar: wordmark, three places to go, the bag, the person. Server component. */
export async function SiteNav() {
  const [user, count, { t }] = await Promise.all([getSessionUser(), bagCount(), getI18n()])
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-sm">
      <Container className="flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Wordmark />
          <nav aria-label={t.nav.primary} className="hidden md:block">
            <NavLinks />
          </nav>
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          <Link
            href="/bag"
            aria-label={t.nav.bagWithCount(count)}
            data-bag-target
            className="relative hidden h-9 items-center gap-2 rounded-sm px-2.5 text-[14px] font-medium text-ink hover:bg-mist md:inline-flex"
          >
            <ShoppingBag className="size-[18px]" />
            <span>{t.nav.bag}</span>
            <Badge count={count} />
          </Link>

          {user ? (
            <Link
              href="/me"
              className="flex items-center gap-2 rounded-sm py-1 pr-2 pl-1 hover:bg-mist"
              aria-label={t.nav.profileOf(user.displayName)}
            >
              <Avatar seed={user.avatarSeed} name={user.displayName} size="xs" />
              <span className="hidden max-w-32 truncate text-[14px] md:inline">
                {user.displayName}
              </span>
            </Link>
          ) : (
            <Button href="/login" variant="secondary" size="sm" icon={<LogIn />}>
              {t.common.signIn}
            </Button>
          )}
        </div>
      </Container>
    </header>
  )
}
