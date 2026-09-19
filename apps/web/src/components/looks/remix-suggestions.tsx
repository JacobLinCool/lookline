import { suggestRemix } from '@lookline/engine'
import { FactorBreakdown, Notice, Section } from '@/components/ui'
import { ProductOption } from '@/components/social/product-option'
import { getI18n } from '@/i18n/server'
import { reasonLine } from '@/lib/reason'
import { getDb } from '@/server/db'

/** Pieces the engine would swap in for this person; a factor breakdown only in Engine view. */
export async function RemixSuggestions({
  lookId,
  userId,
  budget,
  originalIds,
  engineView = false,
}: {
  lookId: string
  userId: string
  budget?: number
  originalIds: number[]
  engineView?: boolean
}) {
  const [{ t, locale }, result] = await Promise.all([
    getI18n(),
    suggestRemix(getDb().db, lookId, userId, {
      budget: budget && Number.isFinite(budget) && budget > 0 ? budget : undefined,
    }).catch(() => null),
  ])
  if (!result) return <Notice tone="warning">{t.looks.remix.suggestionsUnavailable}</Notice>
  const items = result.items.filter((item) => !originalIds.includes(item.product.id))
  return (
    <Section title={t.looks.remix.swapIn} rule={false}>
      {items.length ? (
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.product.id}>
              <ProductOption
                product={{ ...item.product, brandName: item.brandName }}
                name="productId"
                footer={
                  engineView ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-[12px] text-muted">
                        {reasonLine(item.explanation, locale)}
                      </p>
                      <FactorBreakdown
                        explanation={item.explanation}
                        compact
                        scoreLabel={t.looks.remix.fit}
                        locale={locale}
                      />
                    </div>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">{t.looks.remix.noneInBudget}</p>
      )}
    </Section>
  )
}
