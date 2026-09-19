/*
 * THESIS: The Look is the interface. Every page opens on a garment or a Look; text is a tag, never
 *   a paragraph. Refused: the eyebrow / serif title / grey description scaffold and the exposure of
 *   engine internals on consumer pages.
 * OWN-WORLD: The Rack — white wall (#f7f6f3), one 1px steel rail, white paper tags, ink controls,
 *   tag red (#c8321e) as the single alert colour. Bricolage Grotesque signage, Inter operation.
 * STORY: Say it → real pieces → own it → a Look → friends pick it up → buy again.
 * FIRST VIEWPORT: one oversized input over a rail of real Looks; on every other page the largest
 *   element is an image and the one ink button is the next step in the chain.
 * FORM: candidate 4 of the grounded list (the clothing rack), seed key f928b4d9.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
 *   verdict, and DESIGN.md.
 */
import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/shell/site-footer'
import { SiteNav } from '@/components/shell/site-nav'
import { TabBar } from '@/components/shell/nav-links'
import { LOCALE_TAGS } from '@/i18n'
import { LocaleProvider } from '@/i18n/client'
import { getI18n } from '@/i18n/server'
import { bagCount } from '@/server/bag'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
  axes: ['opsz'],
})

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return {
    title: { default: 'Lookline', template: '%s · Lookline' },
    description: t.ui.siteDescription,
    applicationName: 'Lookline',
  }
}

export const viewport: Viewport = {
  themeColor: '#f7f6f3',
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [count, { locale }] = await Promise.all([bagCount(), getI18n()])
  return (
    <html lang={LOCALE_TAGS[locale]} className={`${inter.variable} ${bricolage.variable}`}>
      <body className="flex min-h-dvh flex-col bg-paper font-sans text-ink">
        <LocaleProvider locale={locale}>
          <SiteNav />
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
          <SiteFooter />
          <TabBar bagCount={count} />
        </LocaleProvider>
      </body>
    </html>
  )
}
