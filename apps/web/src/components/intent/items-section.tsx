'use client'

import { EmptyState, Notice, Section } from '@/components/ui'
import { useI18n } from '@/i18n/client'
import type { Recommendation, Understanding } from '@/server/intent'
import { RankedItemCard } from './ranked-item-card'
import { productHref } from './urls'

export interface ItemsSectionProps {
  understanding: Understanding
  recommendation: Recommendation
  signedIn: boolean
  engineView?: boolean
}

/** The ranked pieces as a grid; one reason per card, controls over the artwork. */
export function ItemsSection({
  understanding,
  recommendation,
  signedIn,
  engineView = false,
}: ItemsSectionProps) {
  const { t } = useI18n()
  const { result } = recommendation
  return (
    <Section title={t.home.items.title}>
      {!result.ok ? (
        <Notice tone="warning" title={t.home.items.failed} />
      ) : result.items.length === 0 ? (
        <EmptyState title={t.home.items.emptyTitle} description={t.home.items.emptyDescription} />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {result.items.map((item, index) => (
            <li key={item.product.id}>
              <RankedItemCard
                product={{
                  id: item.product.id,
                  imagePath: item.product.imagePath,
                  name: item.product.name,
                  price: item.product.price,
                  brandName: item.brandName,
                  colorName: item.product.colorName,
                }}
                href={productHref(item.product.id, understanding.sessionId, index + 1)}
                score={item.score}
                explanation={item.explanation}
                position={index + 1}
                sessionId={understanding.sessionId}
                signedIn={signedIn}
                engineView={engineView}
                priority={index < 4}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
