import { loadEnv } from '@lookline/db'
import {
  compileSearchIntent,
  type SearchIntent,
} from '../../packages/engine/src/decisions/search-intent'

loadEnv()

interface EvalCase {
  id: string
  query: string
  checks: Array<{ label: string; test: (intent: SearchIntent) => boolean }>
}

const top = (distribution: Record<string, number>): string | undefined =>
  Object.entries(distribution).toSorted((a, b) => b[1] - a[1])[0]?.[0]

const predicate = (
  intent: SearchIntent,
  attribute: string,
  value: string,
  polarity: 'positive' | 'negative',
): boolean =>
  intent.predicates.some(
    (item) => item.attribute === attribute && item.value === value && item.polarity === polarity,
  )

const cases: EvalCase[] = [
  {
    id: 'zh-alternatives-negation',
    query: '紅色或藍色都可以，但不要黑色。',
    checks: [
      {
        label: 'red is a positive alternative',
        test: (intent) => predicate(intent, 'colorFamily', 'red', 'positive'),
      },
      {
        label: 'blue is a positive alternative',
        test: (intent) => predicate(intent, 'colorFamily', 'blue', 'positive'),
      },
      {
        label: 'black is negative',
        test: (intent) => predicate(intent, 'colorFamily', 'black', 'negative'),
      },
      {
        label: 'colour positives combine with OR',
        test: (intent) => intent.categorical.colorFamily?.combination === 'one_of',
      },
      {
        label: 'unspecified garment type remains weak',
        test: (intent) => intent.typeRelevance < 0.5,
      },
    ],
  },
  {
    id: 'zh-purpose-ordinal-conflict',
    query: '我想找冬天通勤穿的，紅色或藍色，不要太厚，看起來俐落一點。',
    checks: [
      {
        label: 'winter is the leading season',
        test: (intent) => top(intent.categorical.season!.probabilities) === 'winter',
      },
      {
        label: 'work is the leading occasion',
        test: (intent) => top(intent.categorical.occasion!.probabilities) === 'work',
      },
      {
        label: 'warmth matters and is not an upper bound',
        test: (intent) =>
          intent.ordinal.warmth!.relevance >= 0.5 && intent.ordinal.warmth!.relation !== 'at_most',
      },
      {
        label: 'heavyweight is rejected independently of warmth',
        test: (intent) => predicate(intent, 'attributes.weight', 'heavyweight', 'negative'),
      },
      {
        label: 'sharp structure is represented',
        test: (intent) =>
          intent.ordinal.structure!.relevance >= 0.5 && intent.ordinal.structure!.target > 0.5,
      },
    ],
  },
  {
    id: 'zh-purpose-with-unmentioned-colour',
    query: '夏天去海邊穿。',
    checks: [
      {
        label: 'summer is the leading season',
        test: (intent) => top(intent.categorical.season!.probabilities) === 'summer',
      },
      {
        label: 'beach is the leading occasion',
        test: (intent) => top(intent.categorical.occasion!.probabilities) === 'beach',
      },
      {
        label: 'colour remains unconstrained',
        test: (intent) => intent.categorical.colorFamily!.relevance < 0.35,
      },
      {
        label: 'cooler garments are preferred',
        test: (intent) =>
          intent.ordinal.warmth!.relevance >= 0.5 && intent.ordinal.warmth!.target < 0.5,
      },
    ],
  },
  {
    id: 'zh-long-tail-and-number',
    query: '想要高腰寬褲，不要打褶，預算三千以內。',
    checks: [
      {
        label: 'wide-leg trousers are positive',
        test: (intent) =>
          predicate(intent, 'subcategory', 'wide-leg-trousers', 'positive') ||
          predicate(intent, 'fit', 'wide', 'positive'),
      },
      {
        label: 'high rise is positive',
        test: (intent) => predicate(intent, 'attributes.rise', 'high', 'positive'),
      },
      {
        label: 'pleated variants are negative',
        test: (intent) =>
          predicate(intent, 'attributes.pleats', 'single', 'negative') &&
          predicate(intent, 'attributes.pleats', 'double', 'negative'),
      },
      {
        label: 'exact TWD ceiling survives compilation',
        test: (intent) => intent.numeric.price?.max === 3000,
      },
    ],
  },
]

let passed = 0
let total = 0
const latencies: number[] = []
for (const fixture of cases) {
  try {
    const intent = await compileSearchIntent(fixture.query, { timeoutMs: 5_000 })
    latencies.push(intent.latencyMs)
    const checks = fixture.checks.map((check) => {
      const ok = check.test(intent)
      total++
      if (ok) passed++
      return { label: check.label, ok }
    })
    console.log(
      JSON.stringify({
        id: fixture.id,
        latencyMs: Math.round(intent.latencyMs),
        questionCount: intent.questionCount,
        candidateCount: intent.candidateCount,
        checks,
      }),
    )
  } catch (error) {
    total += fixture.checks.length
    console.log(
      JSON.stringify({
        id: fixture.id,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

const sorted = latencies.toSorted((a, b) => a - b)
const percentile = (p: number): number | null =>
  sorted.length === 0 ? null : Math.round(sorted[Math.ceil(sorted.length * p) - 1]!)
const summary = {
  passed,
  total,
  passRate: total === 0 ? 0 : passed / total,
  latencyMs: { p50: percentile(0.5), p95: percentile(0.95), samples: sorted.length },
}
console.log(JSON.stringify({ summary }))
if (summary.passRate < 0.8 || sorted.length !== cases.length) process.exitCode = 1
