'use client'

import type { Outfit } from '@lookline/engine'
import { InstantForm } from '@/components/latency/instant-form'
import { Button, FactorBreakdown, ProductCard, Rail, RailItem, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/client'
import { facetLabel } from '@/i18n/taxonomy'
import { GENERIC_FACTORS, reasonLine } from '@/lib/reason'
import { addOutfitToBagAction } from '@/server/actions/bag'
import { formatTwd } from '@/server/format'
import { askHref, intentHref, productHref, type IntentQuery } from './urls'
import { previewHref } from '@/components/looks/preview-url'

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
  const { t, locale } = useI18n()
  const copy = t.home.outfits
  const roleLabel = (role: string) => copy.roles[role] ?? facetLabel(locale, role)
  const articleIds = outfit.items.map((item) => item.product.id)
  const budget = outfit.budget ?? budgetMax ?? null
  const over = budget !== null && outfit.total > budget
  const back = intentHref({ ...query, added: outfit.id })
  const roles = outfit.items
    .map((item) => (item.role ? roleLabel(item.role) : null))
    .filter((role): role is string => role !== null)
  const title = roles.length > 0 ? [...new Set(roles)].join(' + ') : copy.one
  const notable = reasonLine(outfit.explanation, locale, 1, GENERIC_FACTORS)

  return (
    <div className="flex flex-col gap-4">
      <Rail
        title={title}
        description={notable || undefined}
        itemWidth="md"
        actions={
          <Tag tone={over ? 'accent' : 'neutral'} size="md">
            {budget !== null
              ? copy.totalOfBudget(formatTwd(outfit.total), formatTwd(budget))
              : formatTwd(outfit.total)}
          </Tag>
        }
      >
        {outfit.items.map((item, position) => (
          <RailItem key={item.product.id} width="md">
            <ProductCard
              product={{
                id: item.product.id,
                imagePath: item.product.imagePath,
                name: item.product.name,
                price: item.product.price,
                brandName: item.brandName,
              }}
              href={productHref(item.product.id, sessionId, position + 1)}
              tag={item.role ? roleLabel(item.role) : undefined}
            />
          </RailItem>
        ))}
      </Rail>

      <div className="flex flex-wrap items-center gap-2">
        <InstantForm
          action={addOutfitToBagAction}
          name="add-outfit"
          confirmation={copy.added}
          className="contents"
        >
          {articleIds.map((id) => (
            <input key={id} type="hidden" name="articleId" value={id} />
          ))}
          <input type="hidden" name="intentSession" value={sessionId} />
          <input type="hidden" name="redirect" value={back} />
          <Button type="submit" variant="secondary" size="sm">
            {copy.addAll}
          </Button>
        </InstantForm>
        <Button href={askHref(articleIds, sessionId)} variant="ghost" size="sm">
          {copy.askFriend}
        </Button>
        <Button href={previewHref({ articleIds })} variant="ghost" size="sm">
          {t.previews.actions.previewLook}
        </Button>
      </div>

      {engineView ? (
        <div className="rounded-md bg-mist p-4">
          <FactorBreakdown explanation={outfit.explanation} scoreLabel={copy.one} locale={locale} />
        </div>
      ) : null}
    </div>
  )
}
