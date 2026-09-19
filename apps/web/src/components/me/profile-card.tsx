import type { PreferenceAesthetic, PreferenceProfile } from '@lookline/engine'
import { Tag } from '@/components/ui'
import { cn } from '@/lib/cn'
import { aestheticLabel, colorFamilyLabel } from '@/i18n/taxonomy'
import { getI18n } from '@/i18n/server'
import { humanize } from '@/server/format'
import { num, pct } from '@/components/trends/format'
import { COLOR_FAMILY_SWATCH } from '@/components/trends/palette'

async function AestheticRows({ items }: { items: PreferenceAesthetic[] }) {
  const { t, locale } = await getI18n()
  if (items.length === 0) return <p className="text-[13px] text-muted">{t.me.taste.noneYet}</p>
  return (
    <ul className="flex flex-col gap-4">
      {items.map((a) => (
        <li key={a.slug} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-medium">{aestheticLabel(locale, a.slug)}</span>
            <span className="tabular text-[12px] text-muted">
              {t.me.taste.weightConfidence(num(a.weight, 2), pct(a.confidence))}
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

async function Axes({ axes }: { axes: PreferenceProfile['axes'] }) {
  const { t } = await getI18n()
  const entries = Object.entries(axes) as Array<[string, number]>
  if (entries.length === 0) return <p className="text-[13px] text-muted">{t.me.taste.noAxes}</p>
  return (
    <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {entries.map(([axis, value]) => {
        const v = Math.max(0, Math.min(1, value))
        const poles = t.me.taste.axisPoles[axis] ?? t.me.taste.axisPolesFallback
        return (
          <li key={axis} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-medium text-ink">
                {t.me.taste.axisNames[axis] ?? humanize(axis)}
              </span>
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

async function ColourDots({ families }: { families: PreferenceProfile['topColorFamilies'] }) {
  const { locale } = await getI18n()
  if (families.length === 0) return null
  return (
    <span className="ml-1 flex items-center gap-1.5">
      {families.slice(0, 6).map(({ family }) => (
        <span
          key={family}
          title={colorFamilyLabel(locale, family)}
          aria-label={colorFamilyLabel(locale, family)}
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
export async function ProfileCard({
  profile,
  engineView = false,
}: {
  profile: PreferenceProfile
  engineView?: boolean
}) {
  const { t, locale } = await getI18n()
  const learning = profile.eventCount < 3
  const styles = profile.topAesthetics
  return (
    <div className="flex flex-col gap-5">
      {learning && styles.length === 0 ? (
        <p className="text-[13px] text-muted">{t.me.taste.stillLearning}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {styles.map((a) => (
            <Tag key={a.slug} size="md" href={`/shop?aesthetics=${encodeURIComponent(a.slug)}`}>
              {aestheticLabel(locale, a.slug)}
            </Tag>
          ))}
          <ColourDots families={profile.topColorFamilies} />
        </div>
      )}
      {profile.giftTopAesthetics.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-muted">{t.me.taste.forOthers}</span>
          {profile.giftTopAesthetics.map((a) => (
            <Tag key={a.slug} tone="outline">
              {aestheticLabel(locale, a.slug)}
            </Tag>
          ))}
        </div>
      ) : null}

      {engineView ? (
        <div className="grid gap-8 rounded-md bg-mist p-5 lg:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium">{t.me.taste.learnedStyles}</p>
                <p className="tabular text-[12px] text-muted">
                  {t.me.taste.interactions(profile.eventCount)}
                </p>
              </div>
              <AestheticRows items={styles} />
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-[13px] font-medium">{t.me.taste.axes}</p>
              <Axes axes={profile.axes} />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-medium">{t.me.taste.forOthers}</p>
            <AestheticRows items={profile.giftTopAesthetics} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
