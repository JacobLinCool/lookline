import { LOCALE_NAMES, LOCALES, type Locale } from '@/i18n'
import { setLocaleAction } from '@/server/actions/locale'
import { cn } from '@/lib/cn'

/** Each language in its own language; the current one is the ink tag. */
export function LocaleSwitcher({ locale, label }: { locale: Locale; label: string }) {
  return (
    <form action={setLocaleAction} className="flex items-center gap-1" aria-label={label}>
      {LOCALES.map((value) => (
        <button
          key={value}
          type="submit"
          name="locale"
          value={value}
          lang={value}
          aria-current={value === locale ? 'true' : undefined}
          className={cn(
            'inline-flex h-7 items-center rounded-xs px-2 text-[12px] font-medium transition-colors',
            value === locale ? 'bg-ink text-paper' : 'text-muted hover:text-ink',
          )}
        >
          {LOCALE_NAMES[value]}
        </button>
      ))}
    </form>
  )
}
