/**
 * `pnpm --filter @lookline/sim evaluate` — run `evaluatePreferenceLoop` (Engine 03) with the
 * default config plus CLI overrides, store the result in `evaluation_runs` and print the table.
 *
 *   --seed 20260918 --users 200 --rounds 30 --catalog-size 5000 --k 10 --noise 0.05 --name engine03-default
 */
import { randomUUID } from 'node:crypto'
import { evaluationRuns } from '@lookline/db'
import { createLocalDb, loadEnv } from '@lookline/db/node'
import { DEFAULT_EVAL_CONFIG, evaluatePreferenceLoop, type EvalConfig } from '@lookline/engine'

loadEnv()

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function num(name: string, fallback: number): number {
  const raw = arg(name)
  if (raw === undefined) return fallback
  const v = Number(raw)
  if (!Number.isFinite(v)) throw new Error(`--${name} must be a number`)
  return v
}

const config: EvalConfig = {
  seed: num('seed', DEFAULT_EVAL_CONFIG.seed),
  users: num('users', DEFAULT_EVAL_CONFIG.users),
  rounds: num('rounds', DEFAULT_EVAL_CONFIG.rounds),
  catalogSize: num('catalog-size', DEFAULT_EVAL_CONFIG.catalogSize),
  k: num('k', DEFAULT_EVAL_CONFIG.k),
  noise: num('noise', DEFAULT_EVAL_CONFIG.noise ?? 0.05),
  name: arg('name') ?? DEFAULT_EVAL_CONFIG.name ?? 'engine03-default',
}

const fmt = (x: number | undefined): string => (x === undefined ? '-' : x.toFixed(3))

async function main(): Promise<void> {
  console.log(`evaluatePreferenceLoop ${JSON.stringify(config)}`)
  const t0 = performance.now()
  const result = evaluatePreferenceLoop(config)
  const ms = Math.round(performance.now() - t0)

  const rows = [1, 5, 10, 20, 30, config.rounds]
    .filter((r, i, a) => r <= config.rounds && a.indexOf(r) === i)
    .map((r) => result.series[r - 1])
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
  console.log(
    '\nround  hit@k  ndcg   cos    | base-hit base-ndcg | prefOnly-ndcg placebo-ndcg oracle-ndcg',
  )
  for (const r of rows) {
    console.log(
      `${String(r.round).padStart(5)}  ${fmt(r.hitRate)}  ${fmt(r.ndcg)}  ${fmt(r.cosineToTruth)}  | ${fmt(r.baselineHitRate)}    ${fmt(r.baselineNdcg)}     | ${fmt(r['prefOnlyNdcg'])}         ${fmt(r['placeboNdcg'])}        ${fmt(r['oracleNdcg'])}`,
    )
  }
  const s = result.summary
  console.log('\nsummary')
  for (const key of [
    'finalHitRate',
    'finalNdcg',
    'finalCosine',
    'baselineHitRate',
    'baselineNdcg',
    'liftHitRate',
    'liftNdcg',
    'roundsToBeatBaseline',
    'placeboNdcg',
    'oracleNdcg',
    'criterionPassed',
  ]) {
    if (s[key] !== undefined) console.log(`  ${key.padEnd(22)} ${fmt(s[key])}`)
  }
  console.log(`  ${'durationMs'.padEnd(22)} ${ms}`)

  const handle = createLocalDb()
  try {
    const id = `ev_${randomUUID()}`
    await handle.db.insert(evaluationRuns).values({
      id,
      name: config.name ?? 'engine03-default',
      config: { ...result.config, durationMs: ms },
      summary: result.summary,
      series: result.series,
    })
    console.log(`\nstored evaluation_runs.id = ${id}`)
  } finally {
    await handle.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
