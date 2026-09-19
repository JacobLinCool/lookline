'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useI18n } from '@/i18n/client'
import { shortDay } from './format'
import { CHART } from './palette'

export interface MomentumChartSeries {
  key: string
  label: string
  momentum: number
  emerging: boolean
  points: Array<{ day: string; volume: number }>
}

export interface MomentumChartProps {
  series: MomentumChartSeries[]
}

interface TooltipPayload {
  active?: boolean
  label?: string | number
  payload?: Array<{ value?: number | string }>
}

function VolumeTooltip({ active, label, payload }: TooltipPayload) {
  const { t, locale } = useI18n()
  if (!active || !payload?.length) return null
  const value = payload[0]?.value
  return (
    <div className="rounded-sm border border-line bg-card px-2.5 py-1.5 text-[12px]">
      <p className="text-muted">{typeof label === 'string' ? shortDay(label, locale) : label}</p>
      <p className="tabular font-medium text-ink">
        {t.trends.chart.weightedEvents(Number(value ?? 0))}
      </p>
    </div>
  )
}

/**
 * Small multiples: one panel per aesthetic on its own rail line, shared y-scale so heights compare
 * across panels. Daily volume = the engine's weighted event count (views 1 … purchases 10).
 */
export function MomentumChart({ series }: MomentumChartProps) {
  const { t, locale } = useI18n()
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.volume)))
  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {series.map((s) => {
        const color = s.emerging ? CHART.accent : CHART.ink
        return (
          <figure key={s.key} className="flex min-w-0 flex-col gap-2 border-t border-line pt-3">
            <figcaption className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[14px] font-medium">{s.label}</span>
              <span className="tabular shrink-0 text-[12px] text-muted">
                {Math.round(s.momentum)}
                {s.emerging ? (
                  <span className="ml-1.5 text-accent">{t.trends.chart.emerging}</span>
                ) : null}
              </span>
            </figcaption>
            <div className="h-28 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={s.points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.line} strokeDasharray="2 4" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(day: string) => shortDay(day, locale)}
                    tick={{ fontSize: 10, fill: CHART.muted }}
                    tickLine={false}
                    axisLine={{ stroke: CHART.line }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    domain={[0, max]}
                    tick={{ fontSize: 10, fill: CHART.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)
                    }
                  />
                  <Tooltip content={<VolumeTooltip />} cursor={{ stroke: CHART.line }} />
                  <Line
                    type="monotone"
                    dataKey="volume"
                    stroke={color}
                    strokeWidth={1.75}
                    dot={false}
                    activeDot={{ r: 4, stroke: CHART.card, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>
        )
      })}
    </div>
  )
}
