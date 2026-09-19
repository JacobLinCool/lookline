import { InstantForm } from '@/components/latency/instant-form'
import type { Product } from '@lookline/db'
import { Button, ProductCard, Rail, RailItem, Select } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { addToBagAction } from '@/server/actions/bag'
import { humanize } from '@/server/format'

export interface LookStripProduct {
  product: Product & { brandName: string }
  role: string | null
}

/**
 * The pieces hanging under a Look: a rail of product cards, each with its role as the one tag and
 * an "Add to bag" form that remembers the Look as the purchase source (`addToBagAction`).
 */
export async function LookProductStrip({
  lookId,
  items,
  redirectTo,
}: {
  lookId: string
  items: LookStripProduct[]
  redirectTo?: string
}) {
  const { t } = await getI18n()
  if (items.length === 0) {
    return <p className="text-[13px] text-muted">{t.looks.strip.empty}</p>
  }
  // `top-2`, `bottom-3`: the same slot filled twice keeps one label.
  const roleLabel = (role: string) => t.looks.roles[role.replace(/-\d+$/, '')] ?? humanize(role)
  return (
    <Rail itemWidth="md">
      {items.map(({ product, role }) => (
        <RailItem key={product.id} width="md">
          <ProductCard
            product={product}
            tag={role ? roleLabel(role) : undefined}
            footer={
              <InstantForm
                action={addToBagAction}
                name="add-from-look"
                confirmation={t.looks.strip.added}
                className="flex flex-col gap-1.5"
              >
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="sourceLook" value={lookId} />
                {redirectTo ? <input type="hidden" name="redirect" value={redirectTo} /> : null}
                <div className="flex items-center gap-1.5">
                  {product.sizeSystem !== 'one-size' && product.sizes.length > 0 ? (
                    // `cn` appends rather than merges, so a `w-20` on the Select loses to its
                    // base `w-full`; the wrapper sets the width the Select fills instead.
                    <div className="w-20 shrink-0">
                      <Select
                        name="size"
                        aria-label={t.looks.strip.sizeFor(product.name)}
                        defaultValue={product.sizes[0]}
                        options={product.sizes.map((s) => ({ value: s, label: s }))}
                      />
                    </div>
                  ) : null}
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    disabled={product.stock <= 0}
                  >
                    {product.stock > 0 ? t.looks.strip.addToBag : t.looks.strip.soldOut}
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
