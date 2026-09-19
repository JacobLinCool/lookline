import { InstantForm } from '@/components/latency/instant-form'
import { ShoppingBag } from 'lucide-react'
import type { Article } from '@lookline/db'
import { Button, Field, Segmented, Select } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { addToBagAction } from '@/server/actions/bag'

/**
 * Size + quantity → `addToBagAction` (fields `articleId`, `size`, `qty`, `redirect`).
 * Redirects back to the product page with `?added=1` so a Notice can confirm.
 */
export interface BagAttribution {
  /** Look the visitor came from (`?look=`), attributed as `sourceLookId` at checkout. */
  sourceLook?: string | null
  /** Intent turn the visitor came from (`?from=`), attributed as `intentSessionId`. */
  intentSession?: string | null
}

export async function AddToBagForm({
  product,
  attribution,
}: {
  product: Article
  attribution?: BagAttribution
}) {
  const { t } = await getI18n()
  // Nothing sells out and nothing has a size: the catalogue records neither.
  const soldOut = false
  const hasSizes = false
  const maxQty = 10
  return (
    <InstantForm
      action={addToBagAction}
      name="add-to-bag"
      confirmation={t.shop.product.added}
      className="flex flex-col gap-4"
      flyToBag={[product.id]}
    >
      <input type="hidden" name="articleId" value={product.id} />
      <input type="hidden" name="redirect" value={`/p/${product.id}?added=1`} />
      {attribution?.sourceLook ? (
        <input type="hidden" name="sourceLook" value={attribution.sourceLook} />
      ) : null}
      {attribution?.intentSession ? (
        <input type="hidden" name="intentSession" value={attribution.intentSession} />
      ) : null}
      {hasSizes ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink" id="size-label">
            {t.shop.product.size}
          </span>
          <Segmented name="size" options={[]} disabled={soldOut} />
        </div>
      ) : (
        <>
          <input type="hidden" name="size" value="" />
          <p className="text-[13px] text-muted">{t.shop.product.oneSize}</p>
        </>
      )}
      <div className="flex items-end gap-3">
        <Field label={t.shop.product.quantity} htmlFor="qty" className="w-20">
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
          {soldOut ? t.shop.product.soldOut : t.shop.product.addToBag}
        </Button>
      </div>
    </InstantForm>
  )
}
