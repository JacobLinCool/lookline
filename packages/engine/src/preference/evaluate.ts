/**
 * `evaluatePreferenceLoop(config)` — synchronous, pure and deterministic (ENGINE_SPEC §4.5).
 *
 * Synthetic users with hidden taste vectors browse an in-memory catalog for `rounds` rounds. Each
 * round every user issues one intent template, receives a slate of `k` items under one of five
 * conditions, reacts through the click model, and (where the condition allows) the preference
 * vector and the bandit learn from the rewards.
 *
 * Conditions
 * - `static`   no preference updates, `intent-strict` weights   → `baseline*` keys (contract)
 * - `learned`  §4.2 updates, fixed `balanced` weights             → `prefOnly*` keys
 * - `full`     §4.2 updates + LinUCB over the arms                → `hitRate, ndcg, …` (contract)
 * - `placebo`  §4.2 with rewards permuted across the round's events, LinUCB → `placebo*` keys
 * - `oracle`   preference := hidden taste, `taste-led` weights     → `oracle*` keys
 *
 * Pre-registered pass criterion (`PASS_CRITERION`, evaluated in `summary`):
 * 1. `finalHitRate` (full, final round) > `baselineHitRate` (static, final round);
 * 2. `oracleNdcg ≥ finalNdcg`;
 * 3. `|placeboNdcg − baselineNdcg| ≤ 0.05`;
 * 4. `finalCosine ≥ initialCosine + 0.05` (the learned vector moves toward the truth). The bar
 *    was cut to 0.03 while the 32 aesthetic dimensions were dropped for want of anything to fill
 *    them: taste had only colour and the axes left to express itself in, both of which the prior
 *    already covers, which capped how far the learned vector could travel. The vision pass fills
 *    the block, the prior deliberately starts it at zero, and the default config now gains 0.157.
 */
import { CATEGORY_GROUPS, createRng, hashSeed } from '@lookline/catalog'
import type { Department } from '@lookline/db'
import type { EvalConfig, EvalResult, EvalRound, FactorName } from '../types'
import { ARMS, armByName, type ArmName } from './arms'
import { LinUCB, contextVector, slateReward } from './bandit'
import { buildEvalCatalog, type EvalCatalogSource, type EvalProduct } from './eval-catalog'
import {
  buildPool,
  prefCosine,
  prefGeometry,
  prefNorm,
  rankPool,
  type BrandCounts,
  type CandidatePool,
  type RankUser,
} from './ranker'
import { REWARDS } from './rewards'
import {
  CLICK_MODEL,
  clickModel,
  intentVectorFor,
  makeSyntheticUsers,
  templatesFor,
  type SyntheticUser,
} from './sim-users'
import { applyEvent, createState, departmentPrior, effective, type PreferenceState } from './update'
import { BLOCK, round as roundTo } from './vector'

export type EvalCondition = 'static' | 'learned' | 'full' | 'placebo' | 'oracle'

export const EVAL_CONDITIONS: readonly EvalCondition[] = [
  'static',
  'learned',
  'full',
  'placebo',
  'oracle',
]

/** Optional knobs read from the config object when present (the contract `EvalConfig` is kept). */
export interface PreferenceEvalOptions extends EvalConfig {
  conditions?: readonly EvalCondition[]
  catalogSource?: 'auto' | EvalCatalogSource
  /** Candidates per (department, template) pool (default 300). */
  poolSize?: number
  /** Share of the pool that counts as relevant (default 0.02 → top 2%). */
  relevantShare?: number
}

export const DEFAULT_EVAL_CONFIG: EvalConfig = {
  seed: 20260918,
  users: 200,
  rounds: 30,
  catalogSize: 5000,
  k: 10,
  noise: 0.05,
  name: 'engine03-default',
}

export const PASS_CRITERION = {
  /** full.hitRate(K) − static.hitRate(K) must exceed this. */
  minHitRateLift: 0,
  /** |placebo.ndcg(K) − static.ndcg(K)| must not exceed this. */
  placeboTolerance: 0.05,
  /** full.cosineToTruth(K) − full.cosineToTruth(1) must reach this. */
  minCosineGain: 0.05,
} as const

const BASE_TIME = Date.UTC(2026, 0, 1)
const DAY_MS = 86_400_000
const DEFAULT_POOL = 300
const DEFAULT_RELEVANT_SHARE = 0.02
const CONDITION_ARM: Readonly<Record<Exclude<EvalCondition, 'full' | 'placebo'>, ArmName>> = {
  static: 'intent-strict',
  learned: 'balanced',
  oracle: 'taste-led',
}

interface Truth {
  /** rel per pool item. */
  rel: Float64Array
  /** Graded gain per pool item (0–3). */
  grade: Uint8Array
  relevant: Set<number>
  idcg: number
}

interface UserCondition {
  state: PreferenceState
  brandCounts: Map<number, BrandCounts>
  cumulativeReward: number
}

interface SlateEvent {
  item: number
  position: number
  reward: number
  kind: 'impression' | 'click' | 'save' | 'purchase' | 'dismiss'
}

function armWeights(name: ArmName): Record<FactorName, number> {
  return (armByName(name) ?? ARMS[0]!).weights
}

function groupShareByDepartment(
  articles: readonly EvalProduct[],
): Partial<Record<Department, number[]>> {
  const out: Partial<Record<Department, number[]>> = {}
  const counts = new Map<Department, number[]>()
  for (const p of articles) {
    let row = counts.get(p.department)
    if (!row) {
      row = Array.from({ length: CATEGORY_GROUPS.length }, () => 0)
      counts.set(p.department, row)
    }
    const g = CATEGORY_GROUPS.indexOf(p.categoryGroup)
    if (g >= 0) row[g] = (row[g] ?? 0) + 1
  }
  for (const [dept, row] of counts) {
    const total = row.reduce((s, x) => s + x, 0)
    out[dept] = row.map((x) => (total > 0 ? x / total : 1 / CATEGORY_GROUPS.length))
  }
  return out
}

function truthFor(
  user: SyntheticUser,
  pool: CandidatePool,
  articles: readonly EvalProduct[],
  k: number,
  relevantShare: number,
): Truth {
  const n = pool.items.length
  const rel = new Float64Array(n)
  const hNorm = prefNorm(user.hidden)
  for (let i = 0; i < n; i++) {
    const item = pool.items[i]!
    const p = articles[item.product]!
    const budgetOk =
      p.price <= user.budgetMax
        ? 1
        : Math.max(0, 1 - (p.price - user.budgetMax) / (0.5 * user.budgetMax))
    rel[i] = prefCosine(user.hidden, hNorm, item.geometry) * budgetOk
  }
  const order = Array.from({ length: n }, (_, i) => i).toSorted(
    (a, b) => (rel[b] ?? 0) - (rel[a] ?? 0) || a - b,
  )
  const grade = new Uint8Array(n)
  const cut = (q: number): number => Math.max(1, Math.round(n * (1 - q)))
  const c99 = cut(0.99)
  const c97 = cut(0.97)
  const c90 = cut(0.9)
  order.forEach((idx, rank) => {
    grade[idx] = rank < c99 ? 3 : rank < c97 ? 2 : rank < c90 ? 1 : 0
  })
  const relevantCount = Math.max(1, Math.round(n * relevantShare))
  const relevant = new Set(order.slice(0, relevantCount))
  let idcg = 0
  for (let r = 0; r < Math.min(k, n); r++)
    idcg += (2 ** (grade[order[r]!] ?? 0) - 1) / Math.log2(r + 2)
  return { rel, grade, relevant, idcg }
}

function learnEvent(
  uc: UserCondition,
  product: EvalProduct,
  reward: number,
  now: Date,
  p0: readonly number[],
): void {
  if (reward === 0) return
  applyEvent(uc.state, product.vector, reward, 1, now, p0)
  const counts = uc.brandCounts.get(product.brandId) ?? { purchases: 0, saves: 0, dismisses: 0 }
  if (reward >= REWARDS.purchase) counts.purchases += 1
  else if (reward >= REWARDS.save) counts.saves += 1
  else if (reward < 0) counts.dismisses += 1
  uc.brandCounts.set(product.brandId, counts)
}

function cosineToTruth(
  p: ArrayLike<number>,
  user: SyntheticUser,
  hGeometry: ReturnType<typeof prefGeometry>,
): number {
  return prefCosine(p, prefNorm(p), hGeometry)
}

/** Run the evaluation. Pure in `config`; never touches the database or the clock. */
export function evaluatePreferenceLoop(config: EvalConfig): EvalResult {
  const opts = config as PreferenceEvalOptions
  const conditions = new Set<EvalCondition>(opts.conditions ?? EVAL_CONDITIONS)
  conditions.add('static')
  conditions.add('full')
  const noise = Math.min(1, Math.max(0, config.noise ?? DEFAULT_EVAL_CONFIG.noise ?? 0))
  const k = Math.max(1, Math.floor(config.k))
  const poolSize = Math.max(k, opts.poolSize ?? DEFAULT_POOL)
  const relevantShare = opts.relevantShare ?? DEFAULT_RELEVANT_SHARE

  const catalog = buildEvalCatalog(config.catalogSize, config.seed)
  const articles = catalog.articles
  const popularityMax = articles.reduce((m, p) => Math.max(m, p.popularity), 0)
  const users = makeSyntheticUsers(config.users, config.seed, {
    groupShare: groupShareByDepartment(articles),
  })
  const priors = new Map<Department, number[]>()
  const priorOf = (d: Department): number[] => {
    let p = priors.get(d)
    if (!p) {
      p = departmentPrior(d)
      priors.set(d, p)
    }
    return p
  }

  // Candidate pools per (department, template) and ground truth per (user, template)
  const pools = new Map<string, CandidatePool>()
  const poolFor = (department: Department, t: number): CandidatePool => {
    const key = `${department}|${t}`
    let pool = pools.get(key)
    if (!pool) {
      const template = templatesFor(department)[t]!
      pool = buildPool(
        articles,
        department,
        template,
        intentVectorFor(template),
        popularityMax,
        poolSize,
      )
      pools.set(key, pool)
    }
    return pool
  }
  const truths = new Map<number, Truth>()
  const truthOf = (user: SyntheticUser, t: number, pool: CandidatePool): Truth => {
    const key = user.index * 64 + t
    let truth = truths.get(key)
    if (!truth) {
      truth = truthFor(user, pool, articles, k, relevantShare)
      truths.set(key, truth)
    }
    return truth
  }
  const budgetOf = (user: SyntheticUser, t: number): number => {
    const u = createRng(hashSeed(config.seed, 'budget', user.index, t)).next()
    return Math.round(user.budgetMax * (0.7 + 0.6 * u))
  }
  const hiddenGeometry = users.map((u) => prefGeometry(u.hidden))

  // Per-condition state
  const perUser = new Map<EvalCondition, UserCondition[]>()
  const bandits = new Map<EvalCondition, LinUCB>()
  for (const c of conditions) {
    perUser.set(
      c,
      users.map((u) => ({
        state: createState(priorOf(u.department)),
        brandCounts: new Map(),
        cumulativeReward: 0,
      })),
    )
    if (c === 'full' || c === 'placebo') bandits.set(c, new LinUCB())
  }

  const series: EvalRound[] = []
  const armCountsFinal = new Map<string, number>()
  const placeboQueue: Array<{
    uc: UserCondition
    product: EvalProduct
    reward: number
    p0: number[]
  }> = []
  const eventTotals: Record<SlateEvent['kind'], number> = {
    impression: 0,
    click: 0,
    save: 0,
    purchase: 0,
    dismiss: 0,
  }
  let initialCosine = 0
  const finalTop3Hits: number[] = []

  for (let round = 1; round <= config.rounds; round++) {
    const now = new Date(BASE_TIME + round * DAY_MS)
    const sums = new Map<
      EvalCondition,
      { hit: number; ndcg: number; reward: number; cosine: number }
    >()
    for (const c of conditions) sums.set(c, { hit: 0, ndcg: 0, reward: 0, cosine: 0 })
    const armCounts = new Map<string, number>()

    for (const user of users) {
      const roundRng = createRng(hashSeed(config.seed, 'round', user.index, round))
      const templates = templatesFor(user.department)
      const t = roundRng.int(0, templates.length - 1)
      const pool = poolFor(user.department, t)
      const truth = truthOf(user, t, pool)
      const budgetMax = budgetOf(user, t)
      const p0 = priorOf(user.department)
      const hGeom = hiddenGeometry[user.index]!

      for (const condition of conditions) {
        const uc = perUser.get(condition)![user.index]!
        // Preference vector seen by the ranker
        let preference: ArrayLike<number> | null = null
        let preferenceApplicable = false
        let cosine: number
        if (condition === 'static') {
          cosine = cosineToTruth(p0, user, hGeom)
        } else if (condition === 'oracle') {
          preference = user.hidden
          preferenceApplicable = true
          cosine = 1
        } else {
          const eff = effective(uc.state, now, p0)
          preference = eff.vector
          preferenceApplicable = uc.state.n >= 3
          cosine = cosineToTruth(eff.vector, user, hGeom)
        }
        // Blend weights
        let weights: Record<FactorName, number>
        let armIndex = -1
        let context: number[] | null = null
        const bandit = bandits.get(condition)
        if (bandit) {
          context = contextVector({
            eventCount: uc.state.n,
            hasBudgetMax: true,
            confidence: 0.8,
            daysSinceSignup: round,
          })
          const choice = bandit.choose(context, { eventCount: uc.state.n })
          weights = choice.weights
          armIndex = choice.index
          if (condition === 'full')
            armCounts.set(choice.name, (armCounts.get(choice.name) ?? 0) + 1)
        } else {
          weights = armWeights(CONDITION_ARM[condition as keyof typeof CONDITION_ARM])
        }
        const rankUser: RankUser = {
          preference,
          preferenceApplicable,
          budgetMax,
          brandCounts: condition === 'static' || condition === 'oracle' ? null : uc.brandCounts,
        }
        const slate = rankPool(pool, articles, weights, rankUser, k)

        // Click model
        const events: SlateEvent[] = []
        let purchased = false
        let hit = 0
        let dcg = 0
        slate.forEach((item, position) => {
          const product = articles[pool.items[item]!.product]!
          if (truth.relevant.has(item)) hit = 1
          dcg += (2 ** (truth.grade[item] ?? 0) - 1) / Math.log2(position + 2)
          const rng = createRng(hashSeed(config.seed, 'click', user.index, round, product.id))
          const d = clickModel(
            rng,
            truth.rel[item] ?? 0,
            user.pickiness,
            position,
            product.price <= CLICK_MODEL.purchaseBudgetSlack * budgetMax,
            !purchased,
            noise,
          )
          events.push({ item, position, reward: REWARDS.impression, kind: 'impression' })
          if (d.click) events.push({ item, position, reward: REWARDS.click, kind: 'click' })
          if (d.save) events.push({ item, position, reward: REWARDS.save, kind: 'save' })
          if (d.purchase) {
            purchased = true
            events.push({ item, position, reward: REWARDS.purchase, kind: 'purchase' })
          }
          if (d.dismiss) events.push({ item, position, reward: REWARDS.dismiss, kind: 'dismiss' })
        })
        const reward = events.reduce((s, e) => s + e.reward, 0)
        uc.cumulativeReward += reward
        const sum = sums.get(condition)!
        sum.hit += hit
        sum.ndcg += truth.idcg > 0 ? dcg / truth.idcg : 0
        sum.reward += uc.cumulativeReward
        sum.cosine += cosine

        if (condition === 'full') {
          for (const e of events) {
            const c = eventTotals[e.kind]
            if (c !== undefined) eventTotals[e.kind] = c + 1
          }
        }

        // Learning
        if (condition === 'learned' || condition === 'full') {
          for (const e of events)
            learnEvent(uc, articles[pool.items[e.item]!.product]!, e.reward, now, p0)
        } else if (condition === 'placebo') {
          for (const e of events)
            placeboQueue.push({
              uc,
              product: articles[pool.items[e.item]!.product]!,
              reward: e.reward,
              p0,
            })
        }
        if (bandit && context && armIndex >= 0) {
          bandit.update(
            armIndex,
            context,
            slateReward(events.filter((e) => e.kind !== 'impression')),
          )
        }
      }
    }

    // Placebo learning: the round's rewards are permuted across every user's events, so the
    // magnitude a vector learns from is independent of the item (and of the user) it came from.
    if (placeboQueue.length > 0) {
      const permuted = createRng(hashSeed(config.seed, 'placebo', round)).shuffle(
        placeboQueue.map((q) => q.reward),
      )
      placeboQueue.forEach((q, i) => learnEvent(q.uc, q.product, permuted[i] ?? 0, now, q.p0))
      placeboQueue.length = 0
    }

    const n = users.length
    const mean = (c: EvalCondition, key: 'hit' | 'ndcg' | 'reward' | 'cosine'): number => {
      const s = sums.get(c)
      return s && n > 0 ? roundTo(s[key] / n) : 0
    }
    const row: EvalRound = {
      round,
      hitRate: mean('full', 'hit'),
      ndcg: mean('full', 'ndcg'),
      cumulativeReward: mean('full', 'reward'),
      cosineToTruth: mean('full', 'cosine'),
      baselineHitRate: mean('static', 'hit'),
      baselineNdcg: mean('static', 'ndcg'),
      baselineCumulativeReward: mean('static', 'reward'),
      baselineCosine: mean('static', 'cosine'),
    }
    if (conditions.has('learned')) {
      row['prefOnlyHitRate'] = mean('learned', 'hit')
      row['prefOnlyNdcg'] = mean('learned', 'ndcg')
      row['prefOnlyCumulativeReward'] = mean('learned', 'reward')
      row['prefOnlyCosine'] = mean('learned', 'cosine')
    }
    if (conditions.has('placebo')) {
      row['placeboHitRate'] = mean('placebo', 'hit')
      row['placeboNdcg'] = mean('placebo', 'ndcg')
      row['placeboCumulativeReward'] = mean('placebo', 'reward')
      row['placeboCosine'] = mean('placebo', 'cosine')
    }
    if (conditions.has('oracle')) {
      row['oracleHitRate'] = mean('oracle', 'hit')
      row['oracleNdcg'] = mean('oracle', 'ndcg')
      row['oracleCumulativeReward'] = mean('oracle', 'reward')
    }
    for (const arm of ARMS)
      row[`armShare_${arm.name}`] = roundTo((armCounts.get(arm.name) ?? 0) / Math.max(1, n))
    series.push(row)
    if (round === 1) initialCosine = row.cosineToTruth
    if (round === config.rounds) {
      for (const arm of ARMS) armCountsFinal.set(arm.name, armCounts.get(arm.name) ?? 0)
      const fullUsers = perUser.get('full')!
      users.forEach((user, i) => {
        const eff = effective(fullUsers[i]!.state, now, priorOf(user.department))
        const top3 = Array.from({ length: BLOCK.C[1] }, (_, d) => d)
          .toSorted((a, b) => (eff.vector[b] ?? 0) - (eff.vector[a] ?? 0) || a - b)
          .slice(0, 3)
        const hidden = Array.from({ length: BLOCK.C[1] }, (_, d) => d).filter(
          (d) => (user.hidden[d] ?? 0) >= 0.7,
        )
        const hits = hidden.filter((d) => top3.includes(d)).length
        finalTop3Hits.push(hidden.length > 0 ? hits / hidden.length : 0)
      })
    }
  }

  const last = series[series.length - 1]
  const first = series[0]
  const finalHitRate = last?.hitRate ?? 0
  const finalNdcg = last?.ndcg ?? 0
  const finalCosine = last?.cosineToTruth ?? 0
  const baselineHitRate = last?.baselineHitRate ?? 0
  const baselineNdcg = last?.baselineNdcg ?? 0
  let roundsToBeatBaseline = -1
  for (let i = 0; i + 2 < series.length; i++) {
    if ([0, 1, 2].every((d) => (series[i + d]?.ndcg ?? 0) > (series[i + d]?.baselineNdcg ?? 0))) {
      roundsToBeatBaseline = series[i]!.round
      break
    }
  }
  const placeboNdcg = last?.['placeboNdcg'] ?? baselineNdcg
  const oracleNdcg = last?.['oracleNdcg'] ?? finalNdcg
  const criteria = {
    criterionHitRate: finalHitRate - baselineHitRate > PASS_CRITERION.minHitRateLift ? 1 : 0,
    criterionOracle: oracleNdcg >= finalNdcg ? 1 : 0,
    criterionPlacebo:
      Math.abs(placeboNdcg - baselineNdcg) <= PASS_CRITERION.placeboTolerance ? 1 : 0,
    criterionCosine:
      finalCosine - (first?.cosineToTruth ?? initialCosine) >= PASS_CRITERION.minCosineGain ? 1 : 0,
  }
  const summary: EvalResult['summary'] = {
    finalHitRate,
    finalNdcg,
    finalCosine,
    baselineHitRate,
    baselineNdcg,
    liftHitRate: roundTo(finalHitRate - baselineHitRate),
    liftNdcg: roundTo(finalNdcg - baselineNdcg),
    roundsToBeatBaseline,
    initialCosine: first?.cosineToTruth ?? 0,
    finalCumulativeReward: last?.cumulativeReward ?? 0,
    baselineCumulativeReward: last?.baselineCumulativeReward ?? 0,
    prefOnlyHitRate: last?.['prefOnlyHitRate'] ?? 0,
    prefOnlyNdcg: last?.['prefOnlyNdcg'] ?? 0,
    placeboHitRate: last?.['placeboHitRate'] ?? 0,
    placeboNdcg: last?.['placeboNdcg'] ?? 0,
    placeboLiftNdcg: roundTo(placeboNdcg - baselineNdcg),
    oracleHitRate: last?.['oracleHitRate'] ?? 0,
    oracleNdcg: last?.['oracleNdcg'] ?? 0,
    explicitAestheticRecall: roundTo(
      finalTop3Hits.length > 0
        ? finalTop3Hits.reduce((s, x) => s + x, 0) / finalTop3Hits.length
        : 0,
    ),
    meanClicksPerRound: roundTo(eventTotals.click / Math.max(1, users.length * series.length)),
    meanSavesPerRound: roundTo(eventTotals.save / Math.max(1, users.length * series.length)),
    meanPurchasesPerRound: roundTo(
      eventTotals.purchase / Math.max(1, users.length * series.length),
    ),
    meanDismissesPerRound: roundTo(eventTotals.dismiss / Math.max(1, users.length * series.length)),
    // Kept at 0: the harness has only the synthetic catalogue now.
    catalogSource: 0,
    catalogSize: articles.length,
    users: users.length,
    rounds: series.length,
    k,
    ...criteria,
    criterionPassed: Object.values(criteria).every((x) => x === 1) ? 1 : 0,
  }
  for (const arm of ARMS)
    summary[`finalArmShare_${arm.name}`] = roundTo(
      (armCountsFinal.get(arm.name) ?? 0) / Math.max(1, users.length),
    )
  return {
    config: { ...config, noise, name: config.name ?? DEFAULT_EVAL_CONFIG.name },
    series,
    summary,
  }
}
