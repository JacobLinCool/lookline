/**
 * `suggestRemix` (Make It Mine): keep the source Look's aesthetics, palette and style vector;
 * retrieve, per source slot, articles that fit the remixer (department, sizes, learned
 * preference, budget) with a cosine query over `product_vectors`; rank and explain them
 * (remix-rank.ts). The query mirrors ENGINE_SPEC §2.1 with the remix limits.
 */
import {
  and,
  asc,
  brands,
  cosineExpr,
  desc,
  eq,
  inArray,
  lookArticles,
  looks,
  lte,
  notInArray,
  articleVectors,
  articles,
  purchases,
  users,
  type Database,
  type Department,
} from '@lookline/db'
import {
  categoryGroupIndex,
  CATEGORY_GROUPS,
  normalizeVector,
  STYLE_DIMENSIONS,
  type CategoryGroup,
} from '@lookline/catalog'
import { deriveLookStyle } from '../looks'
import type { RemixSuggestion } from '../types'
import { inferRoles } from './roles'
import {
  chooseRemixItems,
  keptAesthetics,
  keptPalette,
  remixExplanation,
  slotBudget,
  type RemixContext,
  type RemixProduct,
  type RemixSlot,
} from './remix-rank'

const PER_SLOT_LIMIT = 120
const MIN_CANDIDATES = 8

function departmentsFor(department: Department): Department[] {
  switch (department) {
    case 'kids':
      return ['kids']
    case 'women':
      return ['women', 'unisex']
    case 'men':
      return ['men', 'unisex']
    default:
      return ['unisex', 'women', 'men']
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = values.toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Query vector: source style (aesthetics/colours/axes) blended with the remixer's taste, slot group one-hot. */
function slotQueryVector(
  source: readonly number[],
  preference: readonly number[] | null,
  group: string,
): number[] {
  const v: number[] = Array.from({ length: STYLE_DIMENSIONS }, () => 0)
  for (let i = 0; i < 52; i++) {
    const s = source[i] ?? 0
    const p = preference?.[i] ?? 0
    v[i] = preference && i < 32 ? 0.7 * s + 0.3 * Math.max(0, p) : s
  }
  const g = categoryGroupIndex(group as CategoryGroup)
  if (g >= 52) v[g] = 1
  return normalizeVector(v)
}

async function retrieveSlot(
  db: Database,
  vector: readonly number[],
  departments: Department[],
  group: string,
  priceMax: number | null,
  excludeIds: string[],
): Promise<RemixProduct[]> {
  const cos = cosineExpr(vector)
  const run = async (cap: number | null): Promise<RemixProduct[]> => {
    const conditions = [
      inArray(articles.department, departments),
      eq(articles.categoryGroup, group as CategoryGroup),
    ]
    if (cap !== null) conditions.push(lte(articles.price, cap))
    if (excludeIds.length > 0) conditions.push(notInArray(articles.id, excludeIds))
    const rows = await db
      .select({ product: articles, brandName: brands.name })
      .from(articles)
      .innerJoin(brands, eq(brands.id, articles.brandId))
      .innerJoin(articleVectors, eq(articleVectors.articleId, articles.id))
      .where(and(...conditions))
      .orderBy(desc(cos), asc(articles.id))
      .limit(PER_SLOT_LIMIT)
    return rows.map((r) => ({ ...r.product, brandName: r.brandName }))
  }
  // Relaxation ladder (§2.1): widen the slot price cap, then drop it.
  let rows = await run(priceMax)
  if (rows.length < MIN_CANDIDATES && priceMax !== null)
    rows = await run(Math.round(priceMax * 1.5))
  if (rows.length < MIN_CANDIDATES && priceMax !== null) rows = await run(null)
  return rows
}

export async function suggestRemix(
  db: Database,
  sourceLookId: string,
  userId: string,
  opts: { budget?: number; limit?: number } = {},
): Promise<RemixSuggestion> {
  const [sourceLook] = await db.select().from(looks).where(eq(looks.id, sourceLookId)).limit(1)
  if (!sourceLook) throw new Error(`@lookline/engine: look ${sourceLookId} not found`)

  const [sourceRows, userRows, purchaseRows] = await Promise.all([
    db
      .select({ product: articles, brandName: brands.name, role: lookArticles.role })
      .from(lookArticles)
      .innerJoin(articles, eq(lookArticles.articleId, articles.id))
      .innerJoin(brands, eq(brands.id, articles.brandId))
      .where(eq(lookArticles.lookId, sourceLookId))
      .orderBy(asc(lookArticles.position)),
    db
      .select({
        department: users.department,
        sizes: users.sizes,
        preferenceVector: users.preferenceVector,
        budgetHint: users.budgetHint,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db.select({ price: purchases.price }).from(purchases).where(eq(purchases.userId, userId)),
  ])
  const user = userRows[0]
  if (!user) throw new Error(`@lookline/engine: user ${userId} not found`)

  const sourceProducts: RemixProduct[] = sourceRows.map((r) => ({
    ...r.product,
    brandName: r.brandName,
  }))
  const style = deriveLookStyle(sourceProducts)
  const sourceVector =
    sourceLook.styleVector && sourceLook.styleVector.some((x) => x !== 0)
      ? sourceLook.styleVector
      : style.styleVector
  const sourceAesthetics =
    sourceLook.aesthetics.length > 0 ? sourceLook.aesthetics : style.aesthetics
  const sourceTotal = sourceProducts.reduce((s, p) => s + p.price, 0)
  const purchaseMedian = median(purchaseRows.map((r) => r.price))
  const budget =
    opts.budget && opts.budget > 0
      ? Math.round(opts.budget)
      : purchaseMedian !== null
        ? Math.round(purchaseMedian * 3)
        : sourceTotal > 0
          ? Math.round(sourceTotal * 1.2)
          : (user.budgetHint ?? null)

  const ctx: RemixContext = {
    sourceVector,
    preferenceVector: user.preferenceVector,
    department: user.department,
    sizes: user.sizes ?? {},
    budget,
  }

  const roles = inferRoles(sourceProducts)
  const inferredRoles = sourceRows.map((r, i) => r.role ?? roles[i] ?? 'piece')
  const departments = departmentsFor(user.department)
  const excludeIds = sourceProducts.map((p) => p.id)
  const limit = Math.max(1, opts.limit ?? sourceProducts.length)

  const slots: RemixSlot[] = await Promise.all(
    sourceProducts.slice(0, limit).map(async (source, i) => {
      const group = CATEGORY_GROUPS.includes(source.categoryGroup as CategoryGroup)
        ? source.categoryGroup
        : 'tops'
      const candidates = await retrieveSlot(
        db,
        slotQueryVector(sourceVector, user.preferenceVector, group),
        departments,
        group,
        slotBudget(group, budget) === null ? null : Math.round(slotBudget(group, budget)! * 1.3),
        excludeIds,
      )
      return { source, role: inferredRoles[i] ?? 'piece', group, candidates }
    }),
  )

  const items = chooseRemixItems(slots, ctx)
  const kept = keptAesthetics(sourceAesthetics, items)
  const palette = keptPalette(sourceProducts, items)
  const explanation = remixExplanation(slots, items, kept, palette)

  return { sourceLook, items, explanation, keptAesthetics: kept, palette }
}
