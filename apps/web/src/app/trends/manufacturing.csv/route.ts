import { getTrendDashboard } from '@lookline/engine'
import { getDb } from '@/server/db'

export const dynamic = 'force-dynamic'

const COLUMNS = [
  'rank',
  'aesthetic',
  'category_group',
  'subcategory',
  'color_family',
  'signal',
  'momentum',
  'confidence',
  'projected_demand',
  'rationale',
  'computed_at',
] as const

function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** `GET /trends/manufacturing.csv` — the 開款 / 備料 table as a spreadsheet-ready file. */
export async function GET(): Promise<Response> {
  try {
    const dashboard = await getTrendDashboard(getDb().db, { days: 60 })
    const lines = [COLUMNS.join(',')]
    for (const rec of dashboard.manufacturing.toSorted((a, b) => a.rank - b.rank)) {
      lines.push(
        [
          rec.rank,
          rec.aesthetic,
          rec.categoryGroup,
          rec.subcategory,
          rec.colorFamily,
          rec.evidence['signal'],
          rec.momentum.toFixed(1),
          rec.confidence.toFixed(3),
          rec.projectedDemand,
          rec.rationale,
          rec.computedAt.toISOString(),
        ]
          .map(cell)
          .join(','),
      )
    }
    return new Response(`\uFEFF${lines.join('\n')}\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="lookline-manufacturing.csv"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(`Manufacturing recommendations are unavailable: ${message}\n`, {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
}
