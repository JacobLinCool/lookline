/**
 * Smoke run of `evaluatePreferenceLoop` on the default config (200 users × 30 rounds × 5,000
 * products × k = 10, seed 20260918). Prints the summary, a few rounds of the series and the wall
 * time; exits 1 when the pre-registered criterion fails or the run exceeds 10 s.
 *
 *   pnpm --filter @lookline/engine exec tsx scripts/evaluate-smoke.ts [--seed 1] [--users 40] [--rounds 12]
 *   [--catalog 2000] [--k 10] [--noise 0.05] [--json]
 */
import { DEFAULT_EVAL_CONFIG, evaluatePreferenceLoop } from '../src/preference/evaluate'
import type { EvalConfig } from '../src/types'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const num = (name: string, fallback: number): number => {
  const raw = arg(name)
  const value = raw === undefined ? Number.NaN : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

const config: EvalConfig = {
  seed: num('seed', DEFAULT_EVAL_CONFIG.seed),
  users: num('users', DEFAULT_EVAL_CONFIG.users),
  rounds: num('rounds', DEFAULT_EVAL_CONFIG.rounds),
  catalogSize: num('catalog', DEFAULT_EVAL_CONFIG.catalogSize),
  k: num('k', DEFAULT_EVAL_CONFIG.k),
  noise: num('noise', DEFAULT_EVAL_CONFIG.noise ?? 0.05),
  name: arg('name') ?? DEFAULT_EVAL_CONFIG.name,
}

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`

const started = performance.now()
const result = evaluatePreferenceLoop(config)
const durationMs = Math.round(performance.now() - started)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...result, durationMs }))
} else {
  const s = result.summary
  console.log(`evaluatePreferenceLoop ${JSON.stringify(config)}`)
  console.log(
    `catalog: ${s['catalogSize']} products (${s['catalogSource'] === 1 ? 'generateProduct' : 'synthetic fallback'}), ${s['users']} users, ${s['rounds']} rounds, k=${s['k']}`,
  )
  console.log(`wall time: ${durationMs} ms`)
  console.log('')
  console.log('final round          hitRate@k   ndcg@k   cumReward')
  const row = (label: string, hit: number, ndcg: number, reward: number): void =>
    console.log(
      `${label.padEnd(20)} ${pct(hit).padStart(9)} ${ndcg.toFixed(3).padStart(8)} ${reward.toFixed(2).padStart(11)}`,
    )
  row('static (baseline)', s.baselineHitRate, s.baselineNdcg, s['baselineCumulativeReward'] ?? 0)
  row(
    'learned (balanced)',
    s['prefOnlyHitRate'] ?? 0,
    s['prefOnlyNdcg'] ?? 0,
    result.series.at(-1)?.['prefOnlyCumulativeReward'] ?? 0,
  )
  row('full (LinUCB)', s.finalHitRate, s.finalNdcg, s['finalCumulativeReward'] ?? 0)
  row(
    'placebo',
    s['placeboHitRate'] ?? 0,
    s['placeboNdcg'] ?? 0,
    result.series.at(-1)?.['placeboCumulativeReward'] ?? 0,
  )
  row(
    'oracle',
    s['oracleHitRate'] ?? 0,
    s['oracleNdcg'] ?? 0,
    result.series.at(-1)?.['oracleCumulativeReward'] ?? 0,
  )
  console.log('')
  console.log(
    `lift: hitRate +${(100 * s.liftHitRate).toFixed(1)} pts, ndcg +${s.liftNdcg.toFixed(3)}; cosineToTruth ${(s['initialCosine'] ?? 0).toFixed(3)} → ${s.finalCosine.toFixed(3)}; rounds to beat baseline: ${s.roundsToBeatBaseline}`,
  )
  console.log(
    `events per user-round (full): clicks ${s['meanClicksPerRound']}, saves ${s['meanSavesPerRound']}, purchases ${s['meanPurchasesPerRound']}, dismisses ${s['meanDismissesPerRound']}`,
  )
  const arms = Object.entries(s)
    .filter(([k]) => k.startsWith('finalArmShare_'))
    .map(([k, v]) => `${k.replace('finalArmShare_', '')} ${pct(v)}`)
    .join(', ')
  console.log(`final arm shares: ${arms}`)
  console.log('')
  console.log('round  hitRate  baseline  ndcg   baseNdcg  cosine')
  for (const r of result.series) {
    if (r.round !== 1 && r.round % 5 !== 0 && r.round !== result.series.length) continue
    console.log(
      `${String(r.round).padStart(5)}  ${pct(r.hitRate).padStart(7)}  ${pct(r.baselineHitRate).padStart(8)}  ${r.ndcg.toFixed(3)}  ${r.baselineNdcg.toFixed(3).padStart(8)}  ${r.cosineToTruth.toFixed(3)}`,
    )
  }
  console.log('')
  console.log(
    `criterion: hitRate ${s['criterionHitRate']} oracle ${s['criterionOracle']} placebo ${s['criterionPlacebo']} cosine ${s['criterionCosine']} → ${s['criterionPassed'] === 1 ? 'PASS' : 'FAIL'}`,
  )
}

if (result.summary['criterionPassed'] !== 1 || durationMs > 10_000) process.exitCode = 1
