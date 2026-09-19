import { InstantForm } from '@/components/latency/instant-form'
import type { Article } from '@lookline/db'
import { Button, ProductCard, Rail, RailItem } from '@/components/ui'
import { addToBagAction } from '@/server/actions/bag'
import { humanize } from '@/server/format'

export interface LookStripProduct {
  product: Article & { brandName: string }
  role: string | null
}

/**
 * The pieces hanging under a Look: a rail of product cards, each with its role as the one tag and
 * an "Add to bag" form that remembers the Look as the purchase source (`addToBagAction`).
 */
export function LookProductStrip({
  lookId,
  items,
  redirectTo,
}: {
  lookId: string
  items: LookStripProduct[]
  redirectTo?: string
}) {
  if (items.length === 0) {
    return <p className="text-[13px] text-muted">No pieces attached.</p>
  }
  return (
    <Rail itemWidth="md">
      {items.map(({ product, role }) => (
        <RailItem key={product.id} width="md">
          <ProductCard
            product={product}
            tag={role ? humanize(role) : undefined}
            footer={
              <InstantForm
                action={addToBagAction}
                name="add-from-look"
                confirmation="Added to your bag"
                className="flex flex-col gap-1.5"
              >
                <input type="hidden" name="articleId" value={product.id} />
                <input type="hidden" name="sourceLook" value={lookId} />
                {redirectTo ? <input type="hidden" name="redirect" value={redirectTo} /> : null}
                <div className="flex items-center gap-1.5">
                  {/* No size picker: the catalogue records no sizes, and no inventory to sell out of. */}
                  <Button type="submit" size="sm" variant="secondary" className="flex-1">
                    Add to bag
                  </Button>
                </div>
              </InstantForm>
            }
          />
        </RailItem>
      ))}
    </Rail>
  )
}
