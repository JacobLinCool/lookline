import type { Outfit } from '@lookline/engine'
import { InstantForm } from '@/components/latency/instant-form'
import { OUTFIT_ROLE_LABELS } from '@/components/shop/constants'
import { Button, FactorBreakdown, ProductCard, Rail, RailItem, Tag } from '@/components/ui'
import { GENERIC_FACTORS, reasonLine } from '@/lib/reason'
import { addOutfitToBagAction } from '@/server/actions/bag'
import { formatTwd, humanize } from '@/server/format'
import { askHref, intentHref, productHref, type IntentQuery } from './urls'

export interface OutfitRailProps {
  outfit: Outfit
  sessionId: string
  query: IntentQuery
  /** Fallback ceiling when the outfit carries none (`intent.budget.max`). */
  budgetMax?: number | null
  engineView?: boolean
}

/**
 * One assembled outfit as a rail: its pieces with their role on a tag, the total against the
 * budget, one plain reason, and two actions. The factor breakdown appears only in Engine view.
 */
export function OutfitRail({
  outfit,
  sessionId,
  query,
  budgetMax,
  engineView = false,
}: OutfitRailProps) {
  const productIds = outfit.items.map((item) => item.product.id)
  const budget = outfit.budget ?? budgetMax ?? null
  const over = budget !== null && outfit.total > budget
  const back = intentHref({ ...query, added: outfit.id })
  const roles = outfit.items
    .map((item) => (item.role ? (OUTFIT_ROLE_LABELS[item.role] ?? humanize(item.role)) : null))
    .filter((role): role is string => role !== null)
  const title = roles.length > 0 ? [...new Set(roles)].join(' + ') : 'Outfit'
  const notable = reasonLine(outfit.explanation, 1, GENERIC_FACTORS)

  return (
    <div className="flex flex-col gap-4">
      <Rail
        title={title}
        description={notable || undefined}
        itemWidth="md"
        actions={
          <Tag tone={over ? 'accent' : 'neutral'} size="md">
            {budget !== null
              ? `${formatTwd(outfit.total)} of ${formatTwd(budget)}`
              : formatTwd(outfit.total)}
          </Tag>
        }
      >
        {outfit.items.map((item, position) => (
          <RailItem key={item.product.id} width="md">
            <ProductCard
              product={{
                id: item.product.id,
                name: item.product.name,
                price: item.product.price,
                brandName: item.brandName,
              }}
              href={productHref(item.product.id, sessionId, position + 1)}
              tag={item.role ? (OUTFIT_ROLE_LABELS[item.role] ?? humanize(item.role)) : undefined}
            />
          </RailItem>
        ))}
      </Rail>

      <div className="flex flex-wrap items-center gap-2">
        <InstantForm
          action={addOutfitToBagAction}
          name="add-outfit"
          confirmation="Added to your bag"
          className="contents"
        >
          {productIds.map((id) => (
            <input key={id} type="hidden" name="productId" value={id} />
          ))}
          <input type="hidden" name="intentSession" value={sessionId} />
          <input type="hidden" name="redirect" value={back} />
          <Button type="submit" variant="secondary" size="sm">
            Add all to bag
          </Button>
        </InstantForm>
        <Button href={askHref(productIds, sessionId)} variant="ghost" size="sm">
          Ask a friend
        </Button>
      </div>

      {engineView ? (
        <div className="rounded-md bg-mist p-4">
          <FactorBreakdown explanation={outfit.explanation} scoreLabel="Outfit" />
        </div>
      ) : null}
    </div>
  )
}
