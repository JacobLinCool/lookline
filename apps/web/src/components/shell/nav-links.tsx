'use client'

import Link from 'next/link'
import { LinkFeedback } from './link-feedback'
import { usePathname } from 'next/navigation'
import { Search, ShoppingBag, Shirt, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '@/i18n/client'
import type { Messages } from '@/i18n'
import { cn } from '@/lib/cn'

interface NavItem {
  href: string
  label: string
  icon: ReactNode
  /** Path prefixes that count as "inside" this section. */
  match: string[]
}

const navItems = (t: Messages): NavItem[] => [
  { href: '/', label: t.nav.find, icon: <Sparkles />, match: ['/'] },
  { href: '/shop', label: t.nav.shop, icon: <Search />, match: ['/shop', '/p/'] },
  { href: '/studio', label: t.nav.studio, icon: <Sparkles />, match: ['/studio', '/cards/'] },
  { href: '/me', label: t.nav.wardrobe, icon: <Shirt />, match: ['/me', '/collections/'] },
]

function isActive(pathname: string, item: NavItem): boolean {
  return item.match.some((m) => (m === '/' ? pathname === '/' : pathname.startsWith(m)))
}

/** Desktop top-bar links. */
export function NavLinks() {
  const pathname = usePathname()
  const { t } = useI18n()
  return (
    <ul className="hidden items-center gap-1 md:flex">
      {navItems(t).map((item) => {
        const active = isActive(pathname, item)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative inline-flex h-9 items-center rounded-sm px-3 text-[14px] font-medium transition-colors active:bg-line',
                active ? 'bg-mist text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {item.label}
              <LinkFeedback />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Phone tab bar: four labelled tabs, fixed to the bottom, above the home indicator. */
export function TabBar({ bagCount = 0 }: { bagCount?: number }) {
  const pathname = usePathname()
  const { t } = useI18n()
  const tabs: NavItem[] = [
    ...navItems(t),
    { href: '/bag', label: t.nav.bag, icon: <ShoppingBag />, match: ['/bag', '/checkout'] },
  ]
  return (
    <nav
      data-mobile-tabbar
      aria-label={t.nav.primary}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab)
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                data-bag-target={tab.href === '/bag' ? '' : undefined}
                className={cn(
                  'relative flex h-[var(--shell-bar-height)] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:bg-line [&_svg]:size-5',
                  active ? 'text-ink' : 'text-muted',
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <LinkFeedback />
                {tab.href === '/bag' && bagCount > 0 ? (
                  <span className="tabular absolute top-2 left-1/2 ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold leading-none text-paper">
                    {bagCount > 99 ? '99+' : bagCount}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
