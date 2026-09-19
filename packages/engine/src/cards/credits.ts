/**
 * The credit ledger (#33, #34). Balance is always the sum of the rows — nothing caches it, so a
 * partially applied batch can never leave a total that disagrees with its own history.
 *
 * Two things make this safe to retry on D1, which has no transactions:
 *
 * `operationKey` is unique. A replayed checkout, a re-opened confirmation page or a retried
 * reservation writes the same key, the index rejects the second one, and the caller reads back
 * the first result instead of counting it twice.
 *
 * Reserving is one `INSERT … SELECT … WHERE balance >= 1`. SQLite evaluates that as a single
 * statement, so two sessions racing for a last credit cannot both see it available: one inserts a
 * row, the other inserts nothing and is told it lost.
 */
import { and, creditLedger, eq, sql, type Database } from '@lookline/db'
import { CREDIT_RULE_VERSION, creditsForPurchaseLine } from './rules'

export interface GrantInput {
  ownerUserId: string
  purchaseId: string
  unitPrice: number
  quantity: number
  /** Stable across retries of the same checkout line. */
  operationKey: string
  id: string
}

export interface ReserveInput {
  ownerUserId: string
  sessionId: string
  operationKey: string
  id: string
}

/** `sum(delta)`, the only definition of how many credits an account has. */
export async function creditBalance(db: Database, ownerUserId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`coalesce(sum(${creditLedger.delta}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.ownerUserId, ownerUserId))
  return Number(rows[0]?.n ?? 0)
}

async function hasOperation(db: Database, operationKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(eq(creditLedger.operationKey, operationKey))
    .limit(1)
  return rows.length > 0
}

/**
 * Grant the credits a confirmed purchase line earns. Returns what was granted — `0` both when the
 * line does not qualify and when this key was already granted, which is what makes a retry safe.
 *
 * The check and the insert are two statements and D1 has no transaction to put around them, so
 * the unique index on `operation_key` is what actually decides: two requests racing on the same
 * key both pass the check, and the one that loses the insert reads the winner's row and reports
 * the same `0` a sequential replay would.
 */
export async function grantPurchaseCredits(db: Database, input: GrantInput): Promise<number> {
  const amount = creditsForPurchaseLine(input.unitPrice, input.quantity)
  if (amount === 0) return 0
  if (await hasOperation(db, input.operationKey)) return 0
  try {
    await db.insert(creditLedger).values({
      id: input.id,
      ownerUserId: input.ownerUserId,
      delta: amount,
      reason: 'grant',
      purchaseId: input.purchaseId,
      ruleVersion: CREDIT_RULE_VERSION,
      operationKey: input.operationKey,
    })
  } catch (error) {
    if (await hasOperation(db, input.operationKey)) return 0
    throw error
  }
  return amount
}

/**
 * Hold one credit for a session. `false` means there was nothing left to hold — the balance check
 * and the insert are the same statement, so a caller that gets `true` really did take the credit.
 * Replaying a key that already reserved returns `true` without taking a second one.
 */
export async function reserveCredit(db: Database, input: ReserveInput): Promise<boolean> {
  if (await hasOperation(db, input.operationKey)) return true
  await db.run(sql`
    insert into ${creditLedger} (id, owner_user_id, delta, reason, session_id, rule_version, operation_key)
    select ${input.id}, ${input.ownerUserId}, -1, 'reserve', ${input.sessionId}, ${CREDIT_RULE_VERSION}, ${input.operationKey}
    where (
      select coalesce(sum(delta), 0) from ${creditLedger} where owner_user_id = ${input.ownerUserId}
    ) >= 1
  `)
  // Read back rather than trusting a row count: libsql reports `rowsAffected`, D1 does not, and
  // believing it there made a successful reservation look like an empty balance.
  return hasOperation(db, input.operationKey)
}

/**
 * Spend the held credit on a finished card. Writes `0`: the balance already moved when the credit
 * was reserved, and this row is the audit line saying what it was spent on.
 */
export async function settleCredit(
  db: Database,
  input: { ownerUserId: string; sessionId: string; operationKey: string; id: string },
): Promise<boolean> {
  if (await hasOperation(db, input.operationKey)) return false
  await db.insert(creditLedger).values({
    id: input.id,
    ownerUserId: input.ownerUserId,
    delta: 0,
    reason: 'settle',
    sessionId: input.sessionId,
    ruleVersion: CREDIT_RULE_VERSION,
    operationKey: input.operationKey,
  })
  return true
}

/** Give the held credit back — only for a session that produced nothing usable. */
export async function releaseCredit(
  db: Database,
  input: { ownerUserId: string; sessionId: string; operationKey: string; id: string },
): Promise<boolean> {
  if (await hasOperation(db, input.operationKey)) return false
  await db.insert(creditLedger).values({
    id: input.id,
    ownerUserId: input.ownerUserId,
    delta: 1,
    reason: 'release',
    sessionId: input.sessionId,
    ruleVersion: CREDIT_RULE_VERSION,
    operationKey: input.operationKey,
  })
  return true
}

/** Whether this session still holds a credit (reserved, not yet settled or released). */
export async function sessionHoldsCredit(db: Database, sessionId: string): Promise<boolean> {
  const rows = await db
    .select({ reason: creditLedger.reason })
    .from(creditLedger)
    .where(eq(creditLedger.sessionId, sessionId))
  const reserved = rows.some((r) => r.reason === 'reserve')
  const closed = rows.some((r) => r.reason === 'settle' || r.reason === 'release')
  return reserved && !closed
}

export { and }
