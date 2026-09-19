import { Tag } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { aestheticLabel, colorFamilyLabel } from '@/i18n/taxonomy'
import { cn } from '@/lib/cn'

/** Colour-family → swatch hex, for palettes stored as family names rather than hex codes. */
const FAMILY_HEX: Record<string, string> = {
  black: '#171717',
  white: '#f4f2ec',
  grey: '#8d8a80',
  neutral: '#c9bda6',
  brown: '#6b4a2f',
  red: '#a3262c',
  pink: '#d99aa6',
  'yellow-orange': '#d9a13c',
  green: '#4f6b45',
  blue: '#33507a',
  purple: '#6a4a7a',
  'multi-metallic': '#b8a36a',
}

function swatchHex(value: string): string {
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value
  return FAMILY_HEX[value.toLowerCase()] ?? '#9a968d'
}

export interface KeptStyleProps {
  aesthetics: readonly string[]
  palette: readonly string[]
  /** Short inline prefix; the translated "Keeps" by default. */
  label?: string
  className?: string
}

/** "Keeps · Quiet luxury · Minimalist · ● ● ●" — what a remix preserves from its source. */
export async function KeptStyle({ aesthetics, palette, label, className }: KeptStyleProps) {
  if (aesthetics.length === 0 && palette.length === 0) return null
  const { t, locale } = await getI18n()
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="mr-1 text-[12px] text-muted">{label ?? t.social.keptStyle.keeps}</span>
      {aesthetics.slice(0, 4).map((slug) => (
        <Tag key={slug}>{aestheticLabel(locale, slug)}</Tag>
      ))}
      {palette.length > 0 ? (
        <span className="ml-1 flex items-center gap-1">
          {palette.slice(0, 5).map((value, i) => (
            <span
              key={`${value}-${i}`}
              title={value.startsWith('#') ? value : colorFamilyLabel(locale, value)}
              className="size-4 rounded-full border border-line"
              style={{ background: swatchHex(value) }}
            />
          ))}
        </span>
      ) : null}
    </div>
  )
}
