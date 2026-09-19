import Link from 'next/link'
import { cosineSimilarity } from '@lookline/catalog'
import type { Product } from '@lookline/db'
import { getPreferenceProfile, type Explanation, type ExplanationFactor } from '@lookline/engine'
import { FactorBreakdown, Tag } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import type { Messages } from '@/i18n/messages'
import { getI18n } from '@/i18n/server'
import { aestheticLabel, colorFamilyLabel } from '@/i18n/taxonomy'
import { getDb } from '@/server/db'
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
  product: Product,
  profile: Awaited<ReturnType<typeof getPreferenceProfile>>,
  similarity: number,
  t: Messages,
  locale: Locale,
): Explanation {
  const topSlugs = profile.topAesthetics.map((a) => a.slug)
  const shared = product.aesthetics.filter((a) => topSlugs.includes(a))
  const denominator = Math.max(1, Math.min(product.aesthetics.length, Math.max(1, topSlugs.length)))
  const aestheticOverlap = clamp01(shared.length / denominator)
  const colourMatch = profile.topColorFamilies.find((c) => c.family === product.colorFamily)
  const attributeValue = clamp01(0.7 * aestheticOverlap + 0.3 * (colourMatch ? 1 : 0))
  const trendValue = clamp01(product.trendScore)
  const evidence = t.shop.fit.evidence

  const factors: ExplanationFactor[] = [
    factor(
      'user_preference',
      0.6,
      clamp01(similarity),
      similarity >= 0.7 ? evidence.close : similarity >= 0.4 ? evidence.partly : evidence.different,
    ),
    factor(
      'attribute_match',
      0.25,
      attributeValue,
      evidence.join([
        shared.length > 0
          ? evidence.shares(t.shop.list(shared.map((slug) => aestheticLabel(locale, slug))))
          : evidence.sharesNothing,
        colourMatch
          ? t.shop.fit.colourIsYours(colorFamilyLabel(locale, product.colorFamily))
          : evidence.colourOutside,
      ]),
    ),
    factor(
      'trend_momentum',
      0.15,
      trendValue,
      trendValue > 0 ? evidence.trend(trendValue.toFixed(2)) : evidence.noTrend,
    ),
  ]
  const lead =
    similarity >= 0.7
      ? t.shop.fit.close
      : similarity >= 0.4
        ? t.shop.fit.partly
        : t.shop.fit.different
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
  product: Product
  userId: string | null
  engineView?: boolean
}) {
  const { t, locale } = await getI18n()
  if (!userId) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/p/${product.id}`)}`}
        className="w-fit text-[13px] text-muted underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink"
      >
        {t.shop.fit.signIn}
      </Link>
    )
  }

  const profile = await callEngine('getPreferenceProfile', () =>
    getPreferenceProfile(getDb().db, userId),
  )
  if (!profile.ok) return null
  if (!profile.value.vector) {
    return <p className="text-[13px] text-muted">{t.shop.fit.empty}</p>
  }

  const similarity = await callEngine('cosineSimilarity', async () =>
    cosineSimilarity(product.styleVector, profile.value.vector ?? []),
  )
  if (!similarity.ok) return null

  const explanation = buildExplanation(product, profile.value, similarity.value, t, locale)
  const shared = product.aesthetics.filter((a) =>
    profile.value.topAesthetics.some((top) => top.slug === a),
  )
  const colourMatch = profile.value.topColorFamilies.some((c) => c.family === product.colorFamily)
  const line = [
    explanation.summary,
    colourMatch ? t.shop.fit.colourIsYours(colorFamilyLabel(locale, product.colorFamily)) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted">{line}</p>
      {shared.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {shared.slice(0, 3).map((slug) => (
            <Tag key={slug} href={`/shop?aesthetics=${encodeURIComponent(slug)}`}>
              {aestheticLabel(locale, slug)}
            </Tag>
          ))}
        </div>
      ) : null}
      {engineView ? (
        <div className="mt-1 rounded-md bg-mist p-4">
          <FactorBreakdown
            explanation={explanation}
            scoreLabel={t.shop.fit.score}
            locale={locale}
          />
        </div>
      ) : null}
    </div>
  )
}
