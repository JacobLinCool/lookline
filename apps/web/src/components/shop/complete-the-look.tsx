import { InstantForm } from '@/components/latency/instant-form'
import { completeTheLook, type Outfit, type RankedItem } from '@lookline/engine'
import { Button, FactorBreakdown, ProductCard, Rail, RailItem, Tag } from '@/components/ui'
import { addOutfitToBagAction } from '@/server/actions/bag'
import { getDb } from '@/server/db'
import { displayName } from '@/lib/product-name'
import { formatTwd, humanize } from '@/server/format'
import { OUTFIT_ROLE_LABELS } from './constants'
import { callEngine } from './engine'

function roleLabel(item: RankedItem): string {
  return item.role
    ? (OUTFIT_ROLE_LABELS[item.role] ?? humanize(item.role))
    : humanize(item.product.subcategory)
}

/** "With sweater and boots" — the other pieces in the outfit, by kind. */
function withLine(outfit: Outfit, anchorId: string): string {
  const others = outfit.items
    .filter((item) => item.product.id !== anchorId)
    .map((item) => humanize(item.product.subcategory).toLowerCase())
  if (others.length === 0) return 'On its own'
  const list =
    others.length === 1
      ? others[0]!
      : `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}`
  return `With ${list}`
}

function OutfitRail({
  outfit,
  anchorId,
  engineView,
}: {
  outfit: Outfit
  anchorId: string
  engineView: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <Rail title={withLine(outfit, anchorId)} itemWidth="sm">
        {outfit.items.map((item) => (
          <RailItem key={item.product.id} width="sm">
            <ProductCard
              product={{
                id: item.product.id,
                name: displayName(item.product.name, item.brandName),
                price: item.product.price,
                brandName: item.brandName,
              }}
              href={`/p/${item.product.id}`}
              tag={item.product.id === anchorId ? 'This piece' : roleLabel(item)}
            />
          </RailItem>
        ))}
      </Rail>
      <InstantForm
        action={addOutfitToBagAction}
        name="add-outfit"
        confirmation="Outfit added to your bag"
        className="flex flex-wrap items-center gap-3"
      >
        {outfit.items.map((item) => (
          <input key={item.product.id} type="hidden" name="articleId" value={item.product.id} />
        ))}
        <input type="hidden" name="redirect" value={`/p/${anchorId}`} />
        <Tag size="md">Total {formatTwd(outfit.total)}</Tag>
        <Button type="submit" variant="secondary" size="sm">
          Add all {outfit.items.length} to bag
        </Button>
      </InstantForm>
      {engineView ? (
        <div className="rounded-md bg-mist p-4">
          <FactorBreakdown explanation={outfit.explanation} scoreLabel="Outfit" />
        </div>
      ) : null}
    </div>
  )
}

/** Outfits built around this product: real pieces, a total, one button. Factors only in Engine view. */
export async function CompleteTheLook({
  articleId,
  userId,
  engineView = false,
}: {
  articleId: string
  userId: string | null
  engineView?: boolean
}) {
  const result = await callEngine('completeTheLook', () =>
    completeTheLook(getDb().db, articleId, { userId: userId ?? undefined, count: 2 }),
  )
  return (
    <section className="hairline flex flex-col gap-8 pt-8">
      <h2 className="text-[20px] md:text-[22px]">Wear it with</h2>
      {!result.ok ? (
        <p className="text-[13px] text-muted">Outfit suggestions are unavailable right now.</p>
      ) : result.value.length === 0 ? (
        <p className="text-[13px] text-muted">No outfit found for this piece yet.</p>
      ) : (
        result.value.map((outfit) => (
          <OutfitRail
            key={outfit.id}
            outfit={outfit}
            anchorId={articleId}
            engineView={engineView}
          />
        ))
      )}
    </section>
  )
}
