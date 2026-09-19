import type { PreferenceAesthetic, PreferenceProfile } from '@lookline/engine'
import { Tag } from '@/components/ui'
import { cn } from '@/lib/cn'
import { humanize } from '@/server/format'
import { num, pct } from '@/components/trends/format'
import { COLOR_FAMILY_SWATCH } from '@/components/trends/palette'

const AXIS_POLES: Record<string, [string, string]> = {
  formality: ['casual', 'formal'],
  warmth: ['cool', 'warm'],
  boldness: ['quiet', 'bold'],
  structure: ['soft', 'structured'],
  'price-tier': ['budget', 'luxury'],
  coverage: ['bare', 'covered'],
  texture: ['smooth', 'textured'],
  trendiness: ['classic', 'trend-led'],
}

function AestheticRows({ items }: { items: PreferenceAesthetic[] }) {
  if (items.length === 0) return <p className="text-[13px] text-muted">None yet</p>
  return (
    <ul className="flex flex-col gap-4">
      {items.map((a) => (
        <li key={a.slug} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-medium">{a.name || humanize(a.slug)}</span>
            <span className="tabular text-[12px] text-muted">
              weight {num(a.weight, 2)} · confidence {pct(a.confidence)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-xs bg-line">
            <div
              className="h-full bg-ink"
              style={{ width: `${Math.max(0, Math.min(1, a.weight)) * 100}%` }}
            />
          </div>
          {a.evidence.length > 0 ? (
            <ul className="flex flex-col gap-0.5 text-[12px] text-muted">
              {a.evidence.map((line) => (
                <li key={line} className="before:mr-1.5 before:content-['·']">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function Axes({ axes }: { axes: PreferenceProfile['axes'] }) {
  const entries = Object.entries(axes) as Array<[string, number]>
  if (entries.length === 0) return <p className="text-[13px] text-muted">No axes yet</p>
  return (
    <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {entries.map(([axis, value]) => {
        const v = Math.max(0, Math.min(1, value))
        const poles = AXIS_POLES[axis] ?? ['low', 'high']
        return (
          <li key={axis} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-medium text-ink">{humanize(axis)}</span>
              <span className="tabular text-muted">{num(v, 2)}</span>
            </div>
            <div className="relative h-1 w-full rounded-xs bg-line">
              <span
                aria-hidden
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
                style={{ left: `${v * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted">
              <span>{poles[0]}</span>
              <span>{poles[1]}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function ColourDots({ families }: { families: PreferenceProfile['topColorFamilies'] }) {
  if (families.length === 0) return null
  return (
    <span className="ml-1 flex items-center gap-1.5">
      {families.slice(0, 6).map(({ family }) => (
        <span
          key={family}
          title={humanize(family)}
          aria-label={humanize(family)}
          className={cn(
            'size-5 rounded-full border',
            family === 'white' ? 'border-line' : 'border-transparent',
          )}
          style={{ background: COLOR_FAMILY_SWATCH[family] ?? '#8d8a80' }}
        />
      ))}
    </span>
  )
}

/**
 * Your taste: a row of the styles the engine has learned plus colour dots. The learned weights,
 * confidence, axes and evidence appear only in Engine view.
 */
export function ProfileCard({
  profile,
  engineView = false,
}: {
  profile: PreferenceProfile
  engineView?: boolean
}) {
  const learning = profile.eventCount < 3
  const styles = profile.topAesthetics
  return (
    <div className="flex flex-col gap-5">
      {learning && styles.length === 0 ? (
        <p className="text-[13px] text-muted">Still learning. Save or buy a few pieces.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {styles.map((a) => (
            <Tag key={a.slug} size="md" href={`/shop?aesthetics=${encodeURIComponent(a.slug)}`}>
              {a.name || humanize(a.slug)}
            </Tag>
          ))}
          <ColourDots families={profile.topColorFamilies} />
        </div>
      )}
      {profile.giftTopAesthetics.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-muted">For people you buy for</span>
          {profile.giftTopAesthetics.map((a) => (
            <Tag key={a.slug} tone="outline">
              {a.name || humanize(a.slug)}
            </Tag>
          ))}
        </div>
      ) : null}

      {engineView ? (
        <div className="grid gap-8 rounded-md bg-mist p-5 lg:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium">Learned styles</p>
                <p className="tabular text-[12px] text-muted">{profile.eventCount} interactions</p>
              </div>
              <AestheticRows items={styles} />
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-[13px] font-medium">Axes</p>
              <Axes axes={profile.axes} />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-medium">For people you buy for</p>
            <AestheticRows items={profile.giftTopAesthetics} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
