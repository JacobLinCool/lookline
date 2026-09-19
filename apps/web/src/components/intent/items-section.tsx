import { EmptyState, Notice, Section } from '@/components/ui'
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
  const { result } = recommendation
  return (
    <Section title="Pieces for you">
      {!result.ok ? (
        <Notice tone="warning" title="Pieces could not be loaded." />
      ) : result.items.length === 0 ? (
        <EmptyState
          title="Nothing matched everything you asked for."
          description="Loosen the budget or drop a must-have."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {result.items.map((item, index) => (
            <li key={item.product.id}>
              <RankedItemCard
                product={{
                  id: item.product.id,
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
