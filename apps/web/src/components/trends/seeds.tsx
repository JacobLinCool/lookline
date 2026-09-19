import type { Influencer } from '@lookline/engine'
import { Avatar } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatTwd } from '@/server/format'
import { BODY_ROW, STICKY_COL, TABLE, THEAD_ROW } from './momentum-table'

/**
 * People whose Looks travel. Internal merchandising signal only — the product never ranks people
 * publicly, so the influence score itself is not printed.
 */
export function Seeds({ influencers, limit = 10 }: { influencers: Influencer[]; limit?: number }) {
  const shown = influencers.slice(0, limit)
  if (shown.length === 0) {
    return <p className="text-[13px] text-muted">No Look has been remixed or bought from yet.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className={cn(TABLE, 'min-w-[36rem]')}>
        <thead>
          <tr className={THEAD_ROW}>
            <th className={STICKY_COL}>Person</th>
            <th className="text-right">Cluster</th>
            <th className="text-right">Remixes caused</th>
            <th className="text-right">Downstream purchases</th>
            <th className="text-right">Downstream GMV</th>
            <th className="text-right">Clusters reached</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(
            ({ user, remixesCaused, downstreamPurchases, downstreamGmv, clustersReached }) => (
              <tr key={user.id} className={BODY_ROW}>
                <th scope="row" className={cn(STICKY_COL, 'text-left font-medium')}>
                  <span className="flex items-center gap-3">
                    <Avatar seed={user.avatarSeed} name={user.displayName} size="sm" />
                    <span className="flex flex-col leading-tight">
                      <span className="whitespace-nowrap">{user.displayName}</span>
                      <span className="text-[12px] font-normal text-muted">@{user.handle}</span>
                    </span>
                  </span>
                </th>
                <td className="tabular text-right text-muted">
                  {user.tasteCluster !== null ? user.tasteCluster : '–'}
                </td>
                <td className="tabular text-right">{remixesCaused}</td>
                <td className="tabular text-right">{downstreamPurchases}</td>
                <td className="tabular text-right">{formatTwd(downstreamGmv)}</td>
                <td className="tabular text-right">{clustersReached}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
