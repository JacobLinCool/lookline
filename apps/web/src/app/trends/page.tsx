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
import { getDb } from '@/server/db'
import { formatCompact, formatTwd } from '@/server/format'

export const metadata: Metadata = { title: 'Trends' }

const WINDOW_DAYS = 60

/** The headline figures a merchandiser reads first; only defining hints survive. */
function Headline({ headline }: { headline: TrendDashboard['headline'] }) {
  return (
    <StatGrid>
      <StatTile label="Looks created" value={formatCompact(headline.looks)} />
      <StatTile label="Remixes" value={formatCompact(headline.remixes)} />
      <StatTile label="Asks" value={formatCompact(headline.asks)} />
      <StatTile label="Together editions" value={formatCompact(headline.togethers)} />
      <StatTile label="Shares" value={formatCompact(headline.shares)} />
      <StatTile
        label="Purchases from Looks"
        value={formatCompact(headline.purchasesFromLooks)}
        hint={`of ${formatCompact(headline.purchases)} purchases (${pct(
          headline.purchases > 0 ? headline.purchasesFromLooks / headline.purchases : 0,
        )})`}
        accent
      />
      <StatTile
        label="GMV from Looks"
        value={formatTwd(headline.gmvFromLooks)}
        hint="attributed to a Look"
      />
      <StatTile label="Active people" value={formatCompact(headline.activePeople)} />
      <StatTile
        label="Cross-cluster remixes"
        value={pct(headline.crossClusterShare)}
        hint="of remixes crossed a taste cluster"
      />
      <StatTile
        label="Average lineage depth"
        value={num(headline.avgLineageDepth, 1)}
        hint="root to deepest Look"
      />
    </StatGrid>
  )
}

export default async function TrendsPage() {
  const { db } = getDb()
  const dashboard = await callEngine('getTrendDashboard', () =>
    getTrendDashboard(db, { days: WINDOW_DAYS }),
  )
  const d = dashboard.ok ? dashboard.value : null
  const topAesthetics = d
    ? d.aesthetics.toSorted((a, b) => b.momentum - a.momentum).slice(0, 6)
    : []

  return (
    <Container size="wide" className="pb-24">
      <PageHeader
        title="Trends"
        description={
          d
            ? `${longDate(d.window.from)} – ${longDate(d.window.to)} · updated ${longDate(d.generatedAt)}`
            : `Last ${WINDOW_DAYS} days`
        }
        actions={
          <>
            <Tag tone="outline" size="md">
              For Makalot
            </Tag>
            <Button href="/trends/manufacturing.csv" variant="secondary" size="sm">
              Export CSV
            </Button>
          </>
        }
      />

      {!dashboard.ok ? (
        <Notice tone="warning" title="Trend data is unavailable right now." className="mb-8">
          Start the database and reload.
        </Notice>
      ) : null}

      {d && (
        <>
          <div className="pb-4">
            <Headline headline={d.headline} />
          </div>

          <Section title="Aesthetic momentum">
            <div className="flex flex-col gap-8">
              <MomentumChart
                series={topAesthetics.map((s) => ({
                  key: s.key,
                  label: s.label,
                  momentum: s.momentum,
                  emerging: s.emerging,
                  points: s.series,
                }))}
              />
              <MomentumTable rows={d.aesthetics} limit={16} />
            </div>
          </Section>

          <Section title="Emerging now">
            <EmergingCards rows={d.emerging} />
          </Section>

          <Section title="Momentum by dimension">
            <div className="grid gap-x-8 gap-y-8 lg:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-[14px]">Categories</h3>
                <MomentumTable rows={d.categories} compact limit={12} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-[14px]">Colours</h3>
                <MomentumTable rows={d.colors} compact limit={12} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-[14px]">Silhouettes</h3>
                <MomentumTable rows={d.silhouettes} compact limit={12} />
              </div>
            </div>
          </Section>

          <Section title="Aesthetic × category">
            <HeatTable rows={d.aestheticCategory} />
          </Section>

          <Section title="Propagation" description="The Looks that travelled furthest.">
            <Propagation lineages={d.topLineages} />
          </Section>

          <Section title="People whose Looks travel">
            <Seeds influencers={d.influencers} />
          </Section>

          <Section title="Taste clusters">
            <Clusters clusters={d.clusters} />
          </Section>

          <Section title="What to develop next · 開款 / 備料">
            <ManufacturingTable rows={d.manufacturing} />
          </Section>
        </>
      )}
    </Container>
  )
}
