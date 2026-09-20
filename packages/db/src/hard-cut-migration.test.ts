import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sql = [
  '0017_romantic_wolfsbane.sql',
  '0018_feedback_swap.sql',
  '0019_feedback_and_previews.sql',
  '0020_card_hard_cut.sql',
]
  .map((name) =>
    readFileSync(fileURLToPath(new URL(`../drizzle/${name}`, import.meta.url)), 'utf8'),
  )
  .join('\n')

describe('Card hard-cut migration', () => {
  it('drops every retired social graph table', () => {
    for (const table of [
      'looks',
      'look_articles',
      'look_participants',
      'interactions',
      'relationships',
      'lineage_stats',
    ]) {
      expect(sql).toContain(`DROP TABLE \`${table}\``)
    }
  })

  it('preserves canonical rows without translating retired provenance', () => {
    expect(sql).toMatch(/SELECT "id", "owner_id", NULL, "title"/)
    expect(sql).toMatch(/SELECT "id", "user_id", "article_id", NULL, "intent_session_id"/)
    expect(sql).toContain(
      "WHERE \"kind\" IN ('impression', 'click', 'save', 'dismiss', 'add_to_bag', 'purchase')",
    )
  })

  it('backfills art direction to the all-auto contract', () => {
    expect(sql.match(/\{"focus":"auto","pose":"auto","scene":"auto","note":null\}/g)).toHaveLength(
      2,
    )
  })
})
