import Link from 'next/link'
import { cosineSimilarity } from '@lookline/catalog'
import type { Article } from '@lookline/db'
import { getPreferenceProfile, type Explanation, type ExplanationFactor } from '@lookline/engine'
import { FactorBreakdown, Tag } from '@/components/ui'
import { getDb } from '@/server/db'
import { humanize } from '@/server/format'
import { COLOR_FAMILY_LABELS } from './constants'
import { callEngine } from './engine'

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

const factor = (
  name: ExplanationFactor['factor'],
  weight: number,
  value: number,
  evidence: string,
): ExplanationFactor => ({
  factor: name,
  weight,
  value,
  contribution: Number((weight * value).toFixed(4)),
  evidence,
})

/**
 * Builds a three-factor explanation from the learned profile and the product. Contributions are
 * weight × value, so the score shown by FactorBreakdown is exactly their sum.
 */
function buildExplanation(
  product: Article,
  profile: Awaited<ReturnType<typeof getPreferenceProfile>>,
  similarity: number,
): Explanation {
  // The catalogue tags no aesthetics, so preference overlap rests on colour alone until a
  // semantic pass gives the articles style tags to compare against.
  const aestheticOverlap = 0
  const colourMatch = profile.topColorFamilies.find((c) => c.family === product.colorFamily)
  const attributeValue = clamp01(0.7 * aestheticOverlap + 0.3 * (colourMatch ? 1 : 0))
  const trendValue = clamp01(product.trendScore)

  const factors: ExplanationFactor[] = [
    factor(
      'user_preference',
      0.6,
      clamp01(similarity),
      similarity >= 0.7
        ? 'Close to the pieces you usually choose'
        : similarity >= 0.4
          ? 'Shares some of your usual style preferences'
          : 'Different from the pieces you usually choose',
    ),
    factor(
      'attribute_match',
      0.25,
      attributeValue,
      [
        colourMatch
          ? `${COLOR_FAMILY_LABELS[product.colorFamily as keyof typeof COLOR_FAMILY_LABELS] ?? humanize(product.colorFamily)} is one of your colours`
          : 'colour outside your usual palette',
      ].join('; '),
    ),
    factor(
      'trend_momentum',
      0.15,
      trendValue,
      trendValue > 0
        ? `network trend score ${trendValue.toFixed(2)} from Looks, remixes and asks`
        : 'no trend momentum recorded for this piece yet',
    ),
  ]
  const lead =
    similarity >= 0.7
      ? 'Close to your taste'
      : similarity >= 0.4
        ? 'Partly your taste'
        : 'A change from what you usually pick'
  return { summary: lead, factors }
}

/**
 * One line under the price: how this piece sits with what the shopper usually chooses, plus up
 * to three shared styles as tags. The factor breakdown appears only in Engine view.
 */
export async function WhyThisSuitsYou({
  product,
  userId,
  engineView = false,
}: {
  product: Article
  userId: string | null
  engineView?: boolean
}) {
  if (!userId) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/p/${product.id}`)}`}
        className="w-fit text-[13px] text-muted underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink"
      >
        Sign in to see your fit
      </Link>
    )
  }

  const profile = await callEngine('getPreferenceProfile', () =>
    getPreferenceProfile(getDb().db, userId),
  )
  if (!profile.ok) return null
  if (!profile.value.vector) {
    return <p className="text-[13px] text-muted">Save a few pieces to see your fit.</p>
  }

  const similarity = await callEngine('cosineSimilarity', async () =>
    cosineSimilarity(product.styleVector, profile.value.vector ?? []),
  )
  if (!similarity.ok) return null

  const explanation = buildExplanation(product, profile.value, similarity.value)
  const shared: string[] = []
  const colourMatch = profile.value.topColorFamilies.some((c) => c.family === product.colorFamily)
  const colourLabel =
    COLOR_FAMILY_LABELS[product.colorFamily as keyof typeof COLOR_FAMILY_LABELS] ??
    humanize(product.colorFamily)
  const line = [explanation.summary, colourMatch ? `${colourLabel} is one of your colours` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted">{line}</p>
      {shared.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {shared.slice(0, 3).map((slug) => (
            <Tag key={slug} href={`/shop?aesthetics=${encodeURIComponent(slug)}`}>
              {profile.value.topAesthetics.find((t) => t.slug === slug)?.name ?? humanize(slug)}
            </Tag>
          ))}
        </div>
      ) : null}
      {engineView ? (
        <div className="mt-1 rounded-md bg-mist p-4">
          <FactorBreakdown explanation={explanation} scoreLabel="Fit" />
        </div>
      ) : null}
    </div>
  )
}
