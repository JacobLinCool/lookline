import type { Metadata } from 'next'
import { getTrendDashboard, type TrendDashboard } from '@lookline/engine'
import { Button, Container, Notice, PageHeader, Section, Tag } from '@/components/ui'
import { Clusters } from '@/components/trends/clusters'
import { EmergingCards } from '@/components/trends/emerging-cards'
import { callEngine } from '@/components/trends/engine-guard'
import { longDate, num, pct } from '@/components/trends/format'
import { HeatTable } from '@/components/trends/heat-table'
import { ManufacturingTable } from '@/components/trends/manufacturing-table'
import { MomentumChart } from '@/components/trends/momentum-chart'
import { MomentumTable } from '@/components/trends/momentum-table'
import { Propagation } from '@/components/trends/propagation'
import { Seeds } from '@/components/trends/seeds'
import { StatGrid, StatTile } from '@/components/trends/stat-tile'
import type { Messages } from '@/i18n/messages'
import { getI18n } from '@/i18n/server'
import { aestheticLabel } from '@/i18n/taxonomy'
import { getDb } from '@/server/db'
import { formatCompact, formatTwd } from '@/server/format'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.trends.title }
}

const WINDOW_DAYS = 60

/** The headline figures a merchandiser reads first; only defining hints survive. */
function Headline({ headline, t }: { headline: TrendDashboard['headline']; t: Messages }) {
  const h = t.trends.headline
  return (
    <StatGrid>
      <StatTile label={h.looks} value={formatCompact(headline.looks)} />
      <StatTile label={h.remixes} value={formatCompact(headline.remixes)} />
      <StatTile label={h.asks} value={formatCompact(headline.asks)} />
      <StatTile label={h.togethers} value={formatCompact(headline.togethers)} />
      <StatTile label={h.shares} value={formatCompact(headline.shares)} />
      <StatTile
        label={h.purchasesFromLooks}
        value={formatCompact(headline.purchasesFromLooks)}
        hint={h.purchasesFromLooksHint(
          formatCompact(headline.purchases),
          pct(headline.purchases > 0 ? headline.purchasesFromLooks / headline.purchases : 0),
        )}
        accent
      />
      <StatTile
        label={h.gmvFromLooks}
        value={formatTwd(headline.gmvFromLooks)}
        hint={h.gmvFromLooksHint}
      />
      <StatTile label={h.activePeople} value={formatCompact(headline.activePeople)} />
      <StatTile
        label={h.crossClusterRemixes}
        value={pct(headline.crossClusterShare)}
        hint={h.crossClusterRemixesHint}
      />
      <StatTile
        label={h.lineageDepth}
        value={num(headline.avgLineageDepth, 1)}
        hint={h.lineageDepthHint}
      />
    </StatGrid>
  )
}

export default async function TrendsPage() {
  const { db } = getDb()
  const [{ t, locale }, dashboard] = await Promise.all([
    getI18n(),
    callEngine('getTrendDashboard', () => getTrendDashboard(db, { days: WINDOW_DAYS })),
  ])
  const d = dashboard.ok ? dashboard.value : null
  const topAesthetics = d
    ? d.aesthetics.toSorted((a, b) => b.momentum - a.momentum).slice(0, 6)
    : []

  return (
    <Container size="wide" className="pb-24">
      <PageHeader
        title={t.trends.title}
        description={
          d
            ? t.trends.window.range(
                longDate(d.window.from, locale),
                longDate(d.window.to, locale),
                longDate(d.generatedAt, locale),
              )
            : t.trends.window.lastDays(WINDOW_DAYS)
        }
        actions={
          <>
            <Tag tone="outline" size="md">
              {t.trends.forMakalot}
            </Tag>
            <Button href="/trends/manufacturing.csv" variant="secondary" size="sm">
              {t.trends.exportCsv}
            </Button>
          </>
        }
      />

      {!dashboard.ok ? (
        <Notice tone="warning" title={t.trends.unavailable.title} className="mb-8">
          {t.trends.unavailable.body}
        </Notice>
      ) : null}

      {d && (
        <>
          <div className="pb-4">
            <Headline headline={d.headline} t={t} />
          </div>

          <Section title={t.trends.sections.momentum}>
            <div className="flex flex-col gap-8">
              <MomentumChart
                series={topAesthetics.map((s) => ({
                  key: s.key,
                  label: aestheticLabel(locale, s.key),
                  momentum: s.momentum,
                  emerging: s.emerging,
                  points: s.series,
                }))}
              />
              <MomentumTable rows={d.aesthetics} limit={16} />
            </div>
          </Section>

          <Section title={t.trends.sections.emerging}>
            <EmergingCards rows={d.emerging} />
          </Section>

          <Section title={t.trends.sections.byDimension}>
            <div className="grid gap-x-8 gap-y-8 lg:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-[14px]">{t.trends.sections.categories}</h3>
                <MomentumTable rows={d.categories} compact limit={12} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-[14px]">{t.trends.sections.colours}</h3>
                <MomentumTable rows={d.colors} compact limit={12} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-[14px]">{t.trends.sections.silhouettes}</h3>
                <MomentumTable rows={d.silhouettes} compact limit={12} />
              </div>
            </div>
          </Section>

          <Section title={t.trends.sections.heat}>
            <HeatTable rows={d.aestheticCategory} />
          </Section>

          <Section
            title={t.trends.sections.propagation}
            description={t.trends.sections.propagationNote}
          >
            <Propagation lineages={d.topLineages} />
          </Section>

          <Section title={t.trends.sections.seeds}>
            <Seeds influencers={d.influencers} />
          </Section>

          <Section title={t.trends.sections.clusters}>
            <Clusters clusters={d.clusters} />
          </Section>

          <Section title={t.trends.sections.manufacturing}>
            <ManufacturingTable rows={d.manufacturing} />
          </Section>
        </>
      )}
    </Container>
  )
}
