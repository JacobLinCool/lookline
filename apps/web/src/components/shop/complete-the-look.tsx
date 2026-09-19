import { InstantForm } from '@/components/latency/instant-form'
import { completeTheLook, type Outfit, type RankedItem } from '@lookline/engine'
import { Button, FactorBreakdown, ProductCard, Rail, RailItem, Tag } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import type { Messages } from '@/i18n/messages'
import { getI18n } from '@/i18n/server'
import { facetLabel, subcategoryLabel } from '@/i18n/taxonomy'
import { addOutfitToBagAction } from '@/server/actions/bag'
import { getDb } from '@/server/db'
import { displayName } from '@/lib/product-name'
import { formatTwd } from '@/server/format'
import { callEngine } from './engine'
import { previewHref } from '@/components/looks/preview-url'

function roleLabel(item: RankedItem, t: Messages, locale: Locale): string {
  const roles: Record<string, string> = t.shop.outfitRoles
  return item.role
    ? (roles[item.role] ?? facetLabel(locale, item.role))
    : subcategoryLabel(locale, item.product.subcategory)
}

/** "With sweater and boots" — the other pieces in the outfit, by kind. */
function withLine(outfit: Outfit, anchorId: string, t: Messages, locale: Locale): string {
  const others = outfit.items
    .filter((item) => item.product.id !== anchorId)
    .map((item) => subcategoryLabel(locale, item.product.subcategory))
  return others.length === 0 ? t.shop.look.alone : t.shop.look.withPieces(others)
}

async function OutfitRail({
  outfit,
  anchorId,
  engineView,
}: {
  outfit: Outfit
  anchorId: string
  engineView: boolean
}) {
  const { t, locale } = await getI18n()
  return (
    <div className="flex flex-col gap-3">
      <Rail title={withLine(outfit, anchorId, t, locale)} itemWidth="sm">
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
              tag={
                item.product.id === anchorId ? t.shop.look.thisPiece : roleLabel(item, t, locale)
              }
            />
          </RailItem>
        ))}
      </Rail>
      <div className="flex flex-wrap items-center gap-3">
        <Tag size="md">{t.shop.look.total(formatTwd(outfit.total))}</Tag>
        <InstantForm
          action={addOutfitToBagAction}
          name="add-outfit"
          confirmation={t.shop.look.added}
          className="contents"
        >
          {outfit.items.map((item) => (
            <input key={item.product.id} type="hidden" name="articleId" value={item.product.id} />
          ))}
          <input type="hidden" name="redirect" value={`/p/${anchorId}`} />
          <Button type="submit" variant="secondary" size="sm">
            {t.shop.look.addAll(outfit.items.length)}
          </Button>
        </InstantForm>
        <Button
          href={previewHref({ articleIds: outfit.items.map((item) => item.product.id) })}
          variant="ghost"
          size="sm"
        >
          {t.previews.actions.previewLook}
        </Button>
      </div>
      {engineView ? (
        <div className="rounded-md bg-mist p-4">
          <FactorBreakdown
            explanation={outfit.explanation}
            scoreLabel={t.shop.look.score}
            locale={locale}
          />
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
  const { t } = await getI18n()
  const result = await callEngine('completeTheLook', () =>
    completeTheLook(getDb().db, articleId, { userId: userId ?? undefined, count: 2 }),
  )
  return (
    <section className="hairline flex flex-col gap-8 pt-8">
      <h2 className="text-[20px] md:text-[22px]">{t.shop.look.title}</h2>
      {!result.ok ? (
        <p className="text-[13px] text-muted">{t.shop.look.unavailable}</p>
      ) : result.value.length === 0 ? (
        <p className="text-[13px] text-muted">{t.shop.look.none}</p>
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
