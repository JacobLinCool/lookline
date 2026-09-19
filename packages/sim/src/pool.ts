/**
 * Article pool: the catalog sample the simulation chooses from, indexed by department and
 * category group, with per-taste shortlists (top-K per group by block-weighted cosine × budget
 * fit × size availability). All choices are driven by the caller's rng, so they are
 * reproducible for a given plan.
 */
import { CATEGORY_GROUPS, aestheticIndex, type CategoryGroup, type Rng } from '@lookline/catalog'
import type { Department } from '@lookline/db'
import { GROUP_PRIOR, keyDot, tasteKey } from './taste'
import type { SimProduct } from './types'

export const SHORTLIST_PER_GROUP = 40

export interface Scored {
  id: string
  score: number
}

export interface Shortlist {
  department: Department
  byGroup: ReadonlyMap<CategoryGroup, readonly Scored[]>
}

export interface TasteProfile {
  /** Cache key (e.g. `${userId}` or `${userId}:gift`). */
  key: string
  vector: readonly number[]
  department: Department
  sizes: Readonly<Record<string, string>>
  budget: number
}

export function compatibleDepartments(department: Department): Department[] {
  switch (department) {
    case 'women':
      return ['women', 'unisex']
    case 'men':
      return ['men', 'unisex']
    case 'kids':
      return ['kids']
    default:
      return ['unisex', 'women', 'men']
  }
}

/** The catalogue ships no sizes, so every article fits every persona. */
function sizeOk(_p: SimProduct, _sizes: Readonly<Record<string, string>>): boolean {
  return true
}

export function budgetFit(price: number, budget: number): number {
  if (budget <= 0) return 1
  if (price <= budget) return 1
  return Math.max(0.05, 1 - (price - budget) / (1.5 * budget))
}

export class ProductPool {
  readonly articles: SimProduct[] = []
  private readonly index = new Map<string, number>()
  private readonly keys: Float64Array[] = []
  private readonly byDeptGroup = new Map<string, number[]>()
  private readonly shortlists = new Map<string, Shortlist>()

  constructor(articles: readonly SimProduct[] = []) {
    this.add(articles)
  }

  get size(): number {
    return this.articles.length
  }

  add(articles: readonly SimProduct[]): void {
    for (const p of articles) {
      if (this.index.has(p.id)) continue
      const i = this.articles.length
      this.articles.push(p)
      this.index.set(p.id, i)
      this.keys.push(tasteKey(p.styleVector))
      const k = `${p.department}|${p.categoryGroup}`
      const list = this.byDeptGroup.get(k)
      if (list) list.push(i)
      else this.byDeptGroup.set(k, [i])
    }
    // Shortlists are computed over the pool at the time; invalidate on growth.
    if (articles.length > 0) this.shortlists.clear()
  }

  get(id: string): SimProduct | undefined {
    const i = this.index.get(id)
    return i === undefined ? undefined : this.articles[i]
  }

  has(id: string): boolean {
    return this.index.has(id)
  }

  /** Pool indices of `group` articles wearable by `department`. */
  candidates(department: Department, group: CategoryGroup): number[] {
    const out: number[] = []
    for (const d of compatibleDepartments(department)) {
      const list = this.byDeptGroup.get(`${d}|${group}`)
      if (list) for (const i of list) out.push(i)
    }
    return out
  }

  /** Taste score of a product for a profile: cosine × budget fit × size availability. */
  scoreOf(idx: number, key: Float64Array, profile: TasteProfile): number {
    const p = this.articles[idx]!
    const cos = Math.max(0, keyDot(this.keys[idx]!, key))
    return cos * budgetFit(p.price, profile.budget) * (sizeOk(p, profile.sizes) ? 1 : 0.35)
  }

  /** Top-K articles per group for a taste profile (cached by `profile.key`). */
  shortlist(profile: TasteProfile): Shortlist {
    const cached = this.shortlists.get(profile.key)
    if (cached) return cached
    const key = tasteKey(profile.vector)
    const byGroup = new Map<CategoryGroup, Scored[]>()
    for (const group of CATEGORY_GROUPS) {
      const idxs = this.candidates(profile.department, group)
      if (idxs.length === 0) continue
      const scored: Scored[] = idxs.map((i) => ({
        id: this.articles[i]!.id,
        score: this.scoreOf(i, key, profile),
      }))
      scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      byGroup.set(group, scored.slice(0, SHORTLIST_PER_GROUP))
    }
    const list: Shortlist = { department: profile.department, byGroup }
    this.shortlists.set(profile.key, list)
    return list
  }

  /** Random pool product wearable by `department` (negative examples for browsing). */
  randomProduct(rng: Rng, department: Department): SimProduct | null {
    const groups = CATEGORY_GROUPS.filter((g) => this.candidates(department, g).length > 0)
    if (groups.length === 0) return null
    const idxs = this.candidates(department, rng.pick(groups))
    return this.articles[idxs[rng.int(0, idxs.length - 1)]!] ?? null
  }
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

/** Softmax sample over scores (temperature-ish `beta`); deterministic given `rng`. */
function sampleScored(rng: Rng, items: readonly Scored[], beta = 6): Scored | null {
  if (items.length === 0) return null
  const max = items.reduce((m, s) => Math.max(m, s.score), 0)
  const weights = items.map((s) => Math.exp(beta * (s.score - max)))
  const total = weights.reduce((a, b) => a + b, 0)
  let u = rng.next() * total
  for (let i = 0; i < items.length; i++) {
    u -= weights[i]!
    if (u <= 0) return items[i]!
  }
  return items[items.length - 1]!
}

export function pickGroup(
  rng: Rng,
  department: Department,
  shortlist: Shortlist,
  exclude: ReadonlySet<CategoryGroup> = new Set(),
): CategoryGroup | null {
  const prior = GROUP_PRIOR[department]
  const options: Array<readonly [CategoryGroup, number]> = []
  for (const group of CATEGORY_GROUPS) {
    if (exclude.has(group)) continue
    const w = prior[group] ?? 0
    if (w > 0 && (shortlist.byGroup.get(group)?.length ?? 0) > 0) options.push([group, w])
  }
  return options.length > 0 ? rng.weighted(options) : null
}

export interface ChoiceOptions {
  group?: CategoryGroup | null
  exclude?: ReadonlySet<string>
  /** Boost articles carrying this aesthetic (trend seeds). */
  aesthetic?: string | null
  /** Occasion-favoured groups get a nudge (kept simple: dresses/footwear for events). */
  occasion?: string | null
}

/** One product from the shortlist (taste-weighted); null when the shortlist is empty. */
export function chooseProduct(
  pool: ProductPool,
  shortlist: Shortlist,
  rng: Rng,
  opts: ChoiceOptions = {},
): SimProduct | null {
  const group = opts.group ?? pickGroup(rng, shortlist.department, shortlist)
  if (!group) return null
  let items = shortlist.byGroup.get(group) ?? []
  if (opts.exclude && opts.exclude.size > 0) items = items.filter((s) => !opts.exclude!.has(s.id))
  if (opts.aesthetic) {
    const ai = aestheticIndex(opts.aesthetic)
    if (ai >= 0) {
      items = items.map((s) => {
        const p = pool.get(s.id)
        const w = p?.styleVector[ai] ?? 0
        return { id: s.id, score: s.score * (0.4 + 1.6 * w) }
      })
    }
  }
  const pick = sampleScored(rng, items)
  return pick ? (pool.get(pick.id) ?? null) : null
}

/** Products carrying `aesthetic` strongly, department-compatible, best taste score first. */
export function aestheticLeaders(
  pool: ProductPool,
  shortlist: Shortlist,
  aesthetic: string,
  group: CategoryGroup,
  n: number,
): SimProduct[] {
  const ai = aestheticIndex(aesthetic)
  const out: Array<{ p: SimProduct; w: number }> = []
  for (const i of pool.candidates(shortlist.department, group)) {
    const p = pool.articles[i]!
    const w = ai >= 0 ? (p.styleVector[ai] ?? 0) : 0
    if (w >= 0.5) out.push({ p, w })
  }
  out.sort((a, b) => b.w - a.w || a.p.id.localeCompare(b.p.id))
  return out.slice(0, n).map((x) => x.p)
}

const OUTFIT_TEMPLATES: ReadonlyArray<readonly CategoryGroup[]> = [
  ['tops', 'bottoms', 'footwear'],
  ['tops', 'bottoms', 'footwear', 'bags'],
  ['outerwear', 'tops', 'bottoms', 'footwear'],
  ['dresses', 'footwear', 'bags'],
  ['dresses', 'outerwear', 'footwear'],
  ['tops', 'bottoms', 'footwear', 'accessories'],
  ['tailoring', 'tops', 'footwear'],
  ['activewear', 'footwear', 'accessories'],
]

/** 3–4 articles for a Look: keep `base` (recent purchases) and fill the remaining slots by taste. */
export function chooseOutfit(
  pool: ProductPool,
  shortlist: Shortlist,
  rng: Rng,
  base: readonly string[],
  opts: { aesthetic?: string | null; occasion?: string | null } = {},
): string[] {
  const chosen: string[] = []
  const groups = new Set<CategoryGroup>()
  for (const id of base) {
    const p = pool.get(id)
    if (!p || chosen.includes(id)) continue
    const g = p.categoryGroup as CategoryGroup
    if (groups.has(g)) continue
    chosen.push(id)
    groups.add(g)
    if (chosen.length >= 2) break
  }
  const dept = shortlist.department
  const templates = OUTFIT_TEMPLATES.filter((t) => {
    if (dept === 'men' && t.includes('dresses')) return false
    if (opts.occasion === 'workout') return t.includes('activewear')
    if (opts.occasion !== 'workout' && t.includes('activewear')) return false
    return t.every((g) => (shortlist.byGroup.get(g)?.length ?? 0) > 0)
  })
  const template =
    templates.length > 0 ? rng.pick(templates) : (OUTFIT_TEMPLATES[0] as readonly CategoryGroup[])
  // A dress replaces top + bottom.
  const hasDress = groups.has('dresses')
  const wantsTopBottom = groups.has('tops') || groups.has('bottoms')
  for (const g of template) {
    if (chosen.length >= 4) break
    if (groups.has(g)) continue
    if (hasDress && (g === 'tops' || g === 'bottoms')) continue
    if (wantsTopBottom && g === 'dresses') continue
    const exclude = new Set(chosen)
    const leaders = opts.aesthetic
      ? aestheticLeaders(pool, shortlist, opts.aesthetic, g, 12).filter((p) => !exclude.has(p.id))
      : []
    const p =
      leaders.length > 0
        ? leaders[rng.int(0, Math.min(leaders.length, 3) - 1)]!
        : chooseProduct(pool, shortlist, rng, { group: g, exclude, aesthetic: opts.aesthetic })
    if (!p) continue
    chosen.push(p.id)
    groups.add(g)
  }
  if (chosen.length < 3) {
    for (const g of CATEGORY_GROUPS) {
      if (chosen.length >= 3) break
      if (groups.has(g)) continue
      const p = chooseProduct(pool, shortlist, rng, { group: g, exclude: new Set(chosen) })
      if (p) {
        chosen.push(p.id)
        groups.add(g)
      }
    }
  }
  return chosen
}

/** Remix fallback: one product per source product, same group, by the remixer's taste. */
export function remixFallback(
  pool: ProductPool,
  shortlist: Shortlist,
  rng: Rng,
  sourceProductIds: readonly string[],
): string[] {
  const out: string[] = []
  for (const id of sourceProductIds) {
    const src = pool.get(id)
    const group = (src?.categoryGroup ?? 'tops') as CategoryGroup
    const p = chooseProduct(pool, shortlist, rng, {
      group,
      exclude: new Set([...sourceProductIds, ...out]),
    })
    if (p) out.push(p.id)
  }
  return out
}
