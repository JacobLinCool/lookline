import { articles, desc, eq, feedbackEvents, type Database } from '@lookline/db'
import { rewardFor } from '../preference/rewards'

/** The current ontology is categorical. Use actual self-directed feedback, not retired vector axes. */
export async function discoveryDimensions(db: Database, userId: string) {
  const events = await db
    .select({
      articleId: articles.id,
      aesthetics: articles.aesthetics,
      color: articles.colorFamily,
      kind: feedbackEvents.kind,
      forOthers: feedbackEvents.forOthers,
      context: feedbackEvents.context,
      at: feedbackEvents.createdAt,
    })
    .from(feedbackEvents)
    .innerJoin(articles, eq(articles.id, feedbackEvents.articleId))
    .where(eq(feedbackEvents.userId, userId))
    .orderBy(desc(feedbackEvents.createdAt), desc(feedbackEvents.id))
    .limit(200)
  const seen = new Set<string>()
  const scores = new Map<string, { kind: 'aesthetic' | 'color'; value: string; weight: number }>()
  let evidence = 0
  for (const event of events) {
    const reward = rewardFor(event)
    const self = reward.targets.find((target) => target.target === 'self')
    if (!self || seen.has(event.articleId) || event.kind === 'impression') continue
    seen.add(event.articleId)
    if (reward.reward <= 0) continue
    evidence++
    const weight =
      reward.reward *
      self.scale *
      Math.exp(-Math.max(0, Date.now() - event.at.getTime()) / (30 * 86_400_000))
    for (const dimension of [
      ...event.aesthetics.map((value) => ({ kind: 'aesthetic' as const, value })),
      ...(event.color ? [{ kind: 'color' as const, value: event.color }] : []),
    ]) {
      const key = `${dimension.kind}:${dimension.value}`
      scores.set(key, { ...dimension, weight: (scores.get(key)?.weight ?? 0) + weight })
    }
  }
  if (evidence < 3) return []
  return [...scores.values()]
    .filter((score) => score.weight > 0.05)
    .toSorted((a, b) => b.weight - a.weight || a.value.localeCompare(b.value))
    .map(({ kind, value }) => ({ kind, value }))
}
