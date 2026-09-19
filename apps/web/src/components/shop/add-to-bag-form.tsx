import { InstantForm } from '@/components/latency/instant-form'
import { ShoppingBag } from 'lucide-react'
import type { Article } from '@lookline/db'
import { Button, Field, Segmented, Select } from '@/components/ui'
import { addToBagAction } from '@/server/actions/bag'

/**
 * Size + quantity → `addToBagAction` (fields `articleId`, `size`, `qty`, `redirect`).
 * Redirects back to the product page with `?added=1` so a Notice can confirm.
 */
export interface BagAttribution {
  /** Look the visitor came from (`?look=`), attributed as `sourceLookId` at checkout. */
  sourceLook?: string | null
  /** Ask the visitor came from (`?ask=`), attributed as `sourceAskId` at checkout. */
  sourceAsk?: string | null
  /** Intent turn the visitor came from (`?from=`), attributed as `intentSessionId`. */
  intentSession?: string | null
}

export function AddToBagForm({
  product,
  attribution,
}: {
  product: Article
  attribution?: BagAttribution
}) {
  const soldOut = product.stock <= 0
  const hasSizes = product.sizes.length > 0 && product.sizeSystem !== 'one-size'
  const maxQty = Math.max(1, Math.min(10, product.stock))
  return (
    <div className="flex flex-col gap-3">
      <InstantForm
        action={addToBagAction}
        name="add-to-bag"
        confirmation="Added to your bag"
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="articleId" value={product.id} />
        <input type="hidden" name="redirect" value={`/p/${product.id}?added=1`} />
        {attribution?.sourceLook ? (
          <input type="hidden" name="sourceLook" value={attribution.sourceLook} />
        ) : null}
        {attribution?.sourceAsk ? (
          <input type="hidden" name="sourceAsk" value={attribution.sourceAsk} />
        ) : null}
        {attribution?.intentSession ? (
          <input type="hidden" name="intentSession" value={attribution.intentSession} />
        ) : null}
        {hasSizes ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink" id="size-label">
              Size
            </span>
            <Segmented
              name="size"
              options={product.sizes.map((s) => ({ value: s, label: s }))}
              defaultValue={product.sizes[0]}
              disabled={soldOut}
            />
          </div>
        ) : (
          <>
            <input type="hidden" name="size" value={product.sizes[0] ?? ''} />
            <p className="text-[13px] text-muted">One size</p>
          </>
        )}
        <div className="flex items-end gap-3">
          <Field label="Qty" htmlFor="qty" className="w-20">
            <Select
              id="qty"
              name="qty"
              defaultValue="1"
              disabled={soldOut}
              options={Array.from({ length: maxQty }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }))}
            />
          </Field>
          <Button
            type="submit"
            size="lg"
            className="flex-1"
            icon={<ShoppingBag />}
            disabled={soldOut}
          >
            {soldOut ? 'Sold out' : 'Add to bag'}
          </Button>
        </div>
      </InstantForm>
      <Button href={`/asks/new?articles=${product.id}`} variant="link" size="sm">
        Ask a friend which one
      </Button>
    </div>
  )
}
