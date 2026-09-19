import { EmptyState, Notice, Section } from '@/components/ui'
import type { Recommendation, Understanding } from '@/server/intent'
import { OutfitRail } from './outfit-card'
import type { IntentQuery } from './urls'

export interface OutfitsSectionProps {
  understanding: Understanding
  recommendation: Recommendation
  query: IntentQuery
  engineView?: boolean
}

/** The assembled outfits, one rail each. */
export function OutfitsSection({
  understanding,
  recommendation,
  query,
  engineView = false,
}: OutfitsSectionProps) {
  const { result } = recommendation
  const intent = understanding.parse.ok ? understanding.parse.intent : null
  const budgetMax = intent?.budget?.max ?? null

  return (
    <Section title="Outfits">
      {!result.ok ? (
        <Notice tone="warning" title="Outfits could not be loaded." />
      ) : result.outfits.length === 0 ? (
        <EmptyState
          title="No complete outfit within this budget."
          description="The pieces below still match on their own."
        />
      ) : (
        <div className="flex flex-col gap-10">
          {result.outfits.map((outfit) => (
            <OutfitRail
              key={outfit.id}
              outfit={outfit}
              sessionId={understanding.sessionId}
              query={query}
              budgetMax={budgetMax}
              engineView={engineView}
            />
          ))}
        </div>
      )}
    </Section>
  )
}
