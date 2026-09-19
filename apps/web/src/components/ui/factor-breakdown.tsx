import type { Explanation, ExplanationFactor, FactorName } from '@lookline/engine'
import { DEFAULT_LOCALE, type Locale } from '@/i18n'
import { CATALOGS } from '@/i18n/messages'
import { cn } from '@/lib/cn'

/** Muted editorial hues, one per factor, stable across the app. */
export const FACTOR_COLORS: Record<FactorName, string> = {
  style_similarity: '#141311',
  attribute_match: '#3f3b36',
  budget_fit: '#6d6a62',
  user_preference: '#7a1f2b',
  social_signal: '#b5443d',
  trend_momentum: '#a4823f',
  brand_affinity: '#5f6b4a',
  popularity_prior: '#8d8a80',
  diversity: '#4d5f73',
  compatibility: '#7b5c6c',
}

const FALLBACK_COLOR = '#9a968d'

export function factorLabel(name: string, locale: Locale = DEFAULT_LOCALE): string {
  return CATALOGS[locale].ui.factors[name] ?? name.replace(/_/g, ' ')
}

export function factorColor(name: string): string {
  return (FACTOR_COLORS as Record<string, string>)[name] ?? FALLBACK_COLOR
}

/** `+0.21` / `−0.05` with a real minus sign. */
export function formatContribution(value: number, digits = 2): string {
  const sign = value < 0 ? '−' : '+'
  return `${sign}${Math.abs(value).toFixed(digits)}`
}

export interface FactorBreakdownProps {
  explanation: Explanation
  /** Hide the legend and evidence; keep the bar and summary. */
  compact?: boolean
  /** Show `factor.evidence` under each legend row (default true). */
  showEvidence?: boolean
  /** Label next to the total, e.g. "Score"; defaults to the locale's word for it. */
  scoreLabel?: string
  /** The reader's language; factor names and the score label follow it. */
  locale?: Locale
  className?: string
}

/**
 * Explainable-ranking breakdown. Positive contributions stack to the right of a zero mark;
 * negative ones (penalties) stack to the left with a striped fill. Segment widths are shares
 * of Σ|contribution| so the bar always fills its width. The total equals the item score.
 */
export function FactorBreakdown({
  explanation,
  compact = false,
  showEvidence = true,
  scoreLabel,
  locale = DEFAULT_LOCALE,
  className,
}: FactorBreakdownProps) {
  const label = (name: string) => factorLabel(name, locale)
  const score = scoreLabel ?? CATALOGS[locale].ui.score
  const factors = explanation.factors.filter((f) => Number.isFinite(f.contribution))
  const positives = factors
    .filter((f) => f.contribution > 0)
    .toSorted((a, b) => b.contribution - a.contribution)
  const negatives = factors
    .filter((f) => f.contribution < 0)
    .toSorted((a, b) => a.contribution - b.contribution)
  const magnitude = factors.reduce((sum, f) => sum + Math.abs(f.contribution), 0)
  const total = factors.reduce((sum, f) => sum + f.contribution, 0)
  const negativeShare =
    magnitude > 0 ? negatives.reduce((s, f) => s + Math.abs(f.contribution), 0) / magnitude : 0

  const segment = (f: ExplanationFactor, negative: boolean) => {
    const width = magnitude > 0 ? (Math.abs(f.contribution) / magnitude) * 100 : 0
    const color = factorColor(f.factor)
    return (
      <span
        key={`${negative ? 'n' : 'p'}-${f.factor}`}
        title={`${label(f.factor)} ${formatContribution(f.contribution)}`}
        className="h-full min-w-px"
        style={{
          width: `${width}%`,
          background: negative
            ? `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)`
            : color,
        }}
      />
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[13px] text-ink">{explanation.prose ?? explanation.summary}</p>
        <p className="tabular shrink-0 text-[12px] text-muted">
          {score} <span className="font-medium text-ink">{total.toFixed(2)}</span>
        </p>
      </div>

      <div className="relative">
        <div className="flex h-2 w-full overflow-hidden rounded-xs bg-mist">
          {negatives.map((f) => segment(f, true))}
          {positives.map((f) => segment(f, false))}
        </div>
        {negatives.length > 0 ? (
          <span
            aria-hidden
            className="absolute -top-1 h-4 w-px bg-ink"
            style={{ left: `${negativeShare * 100}%` }}
          />
        ) : null}
      </div>

      {!compact && factors.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {[...positives, ...negatives].map((f) => {
            const negative = f.contribution < 0
            const color = factorColor(f.factor)
            return (
              <li
                key={`${negative ? 'n' : 'p'}-${f.factor}`}
                className="grid grid-cols-[12px_1fr_auto] items-baseline gap-x-3 gap-y-0.5"
              >
                <span
                  aria-hidden
                  className="size-3 self-center rounded-xs"
                  style={{
                    background: negative
                      ? `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 4px)`
                      : color,
                  }}
                />
                <span className="text-[13px]">{label(f.factor)}</span>
                <span className={cn('tabular text-[13px]', negative ? 'text-accent' : 'text-ink')}>
                  {formatContribution(f.contribution)}
                </span>
                {showEvidence && f.evidence ? (
                  <span className="col-start-2 col-end-4 text-[12px] leading-snug text-muted">
                    {f.evidence}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {factors.length === 0 ? (
        <p className="text-[12px] text-muted">{CATALOGS[locale].ui.noFactors}</p>
      ) : null}
    </div>
  )
}
