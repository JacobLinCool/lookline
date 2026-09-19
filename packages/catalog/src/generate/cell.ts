/**
 * Per-cell combo selection (CATALOG_SPEC §7.3): enumerate the colour × material × pattern × fit
 * space of a `(subcategory, brand)` cell, weight every combo, and draw the cell's `n` combos with
 * Efraimidis–Spirakis weighted sampling **without replacement**, so every product of a cell has a
 * distinct `(colour, material, pattern, fit)` by construction. Selections are memoised per cell.
 */
import {
  AESTHETICS,
  ATTRIBUTE_SCHEMAS,
  COLORS,
  COLOR_PRIOR,
  DEPARTMENTS,
  DEPT_COLOR_MULT,
  JEANS_COLORS,
  JEWELRY_COLOR_BY_MATERIAL,
  KIDS_EXCLUDED_MATERIALS,
  MATERIAL_PRIOR,
  attributeOptions,
  materialsFor,
  patternsFor,
} from '../taxonomy'
import { AESTHETIC_COLORS, type AestheticSlug } from '../taxonomy/aesthetics'
import type { MaterialRow } from '../taxonomy/materials'
import type { PatternRow } from '../taxonomy/patterns'
import type { AestheticDef } from '../types'
import { homeWeightsOf } from './affinity'
import { cellPermutation, departmentAt, type Plan, type PlanCell } from './plan'

/** Schemas whose combo "fit" axis is the `silhouette` column (§7.3 step 2). */
export const SILHOUETTE_SCHEMAS: ReadonlySet<string> = new Set(['skirt', 'dress'])

/** Weight floor for admissible combos (§7.3 step 3). */
export const COMBO_WEIGHT_FLOOR = 0.01

export interface CellSelection {
  /** Per ordinal `j`: index into `COLORS`. */
  colour: Uint8Array
  /** Per ordinal `j`: index into `materials`. */
  material: Uint8Array
  /** Per ordinal `j`: index into `patterns`. */
  pattern: Uint8Array
  /** Per ordinal `j`: index into `fitValues` (`-1` when the axis is `[null]`). */
  fit: Int16Array
  /** Per ordinal `j`: 1 at the default tables; > 1 only when a cell exceeds its combo space. */
  edition: Uint8Array
  /** Per ordinal `j`: department index into `DEPARTMENTS`. */
  department: Uint8Array
  materials: readonly MaterialRow[]
  patterns: readonly PatternRow[]
  fitValues: readonly string[]
  /** True when `fitValues` are silhouette values (skirt/dress schemas). */
  fitIsSilhouette: boolean
  /** Number of combos with positive weight. */
  positiveCombos: number
  /** Size of the enumerated combo space. */
  comboCount: number
}

// ---------------------------------------------------------------------------
// hashSeed(seed, 'combo', cellId, k) with the FNV state continued digit by digit
// ---------------------------------------------------------------------------

const encoder = new TextEncoder()
const FNV_PRIME = 0x01000193

function fnvPrefix(text: string): number {
  let h = 0x811c9dc5 >>> 0
  for (const byte of encoder.encode(text)) {
    h ^= byte
    h = Math.imul(h, FNV_PRIME) >>> 0
  }
  return h
}

function fmix(h: number): number {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/** Continues an FNV-1a state over the decimal digits of `k`, then applies the fmix of `hashSeed`. */
export function fnvFinish(prefix: number, k: number): number {
  let h = prefix
  const digits = String(k)
  for (let i = 0; i < digits.length; i++) {
    h ^= digits.charCodeAt(i)
    h = Math.imul(h, FNV_PRIME) >>> 0
  }
  return fmix(h)
}

/** `hashSeed(seed, 'combo', cellId, k)` computed through the reusable prefix. */
export function comboHash(seed: number, cellId: number, k: number): number {
  return fnvFinish(fnvPrefix(`${seed}combo${cellId}`), k)
}

/**
 * Odometer over the decimal digits of a counter that keeps the FNV state after every digit, so a
 * sequential walk over `k` costs about one FNV step per hash instead of one per digit.
 */
class DigitHasher {
  private digits: number[] = []
  private states: number[] = []
  private k = -1
  constructor(private readonly prefix: number) {}
  /** Hash of `k`; consecutive calls with `k + 1` are amortised O(1). */
  hash(k: number): number {
    if (k === this.k + 1 && this.k >= 0) this.increment()
    else this.reset(k)
    this.k = k
    return fmix(this.states[this.digits.length] ?? this.prefix)
  }
  private reset(k: number): void {
    const text = String(k)
    this.digits = Array.from(text, (ch) => ch.charCodeAt(0) - 48)
    this.states = Array.from({ length: this.digits.length + 1 }, () => 0)
    this.states[0] = this.prefix
    this.recompute(0)
  }
  private increment(): void {
    let pos = this.digits.length - 1
    while (pos >= 0 && this.digits[pos] === 9) {
      this.digits[pos] = 0
      pos--
    }
    if (pos < 0) {
      this.digits.unshift(1)
      this.states.push(0)
      pos = 0
    } else {
      this.digits[pos] = (this.digits[pos] ?? 0) + 1
    }
    this.recompute(pos)
  }
  private recompute(from: number): void {
    let h = this.states[from] ?? this.prefix
    for (let m = from; m < this.digits.length; m++) {
      h ^= 48 + (this.digits[m] ?? 0)
      h = Math.imul(h, FNV_PRIME) >>> 0
      this.states[m + 1] = h
    }
  }
}

// ---------------------------------------------------------------------------
// affinity terms used by the combo weights (§3.2, vectorised per cell)
// ---------------------------------------------------------------------------

const AESTHETIC_BY_SLUG: ReadonlyMap<string, AestheticDef> = new Map(
  AESTHETICS.map((a) => [a.slug, a]),
)

function categoryTerm(a: AestheticDef, cell: PlanCell): number {
  if (a.favours.subcategories.includes(cell.subcategory.slug)) return 1
  if (a.favours.categoryGroups.includes(cell.subcategory.group)) return 0.5
  return 0
}

function kidsAllowed(material: string, group: string): boolean {
  if (!KIDS_EXCLUDED_MATERIALS.includes(material)) return true
  return material === 'shearling' && group === 'footwear'
}

/** Bounded max-heap of `(key, index)` keeping the `n` smallest keys. */
class SmallestKeys {
  private readonly keys: Float64Array
  private readonly idx: Int32Array
  size = 0
  constructor(readonly capacity: number) {
    this.keys = new Float64Array(capacity)
    this.idx = new Int32Array(capacity)
  }
  get full(): boolean {
    return this.size >= this.capacity
  }
  /** Largest key kept (the entry threshold once full). */
  get threshold(): number {
    return this.size > 0 ? (this.keys[0] ?? 0) : Number.POSITIVE_INFINITY
  }
  offer(key: number, index: number): void {
    if (this.size < this.capacity) {
      let i = this.size++
      this.keys[i] = key
      this.idx[i] = index
      while (i > 0) {
        const parent = (i - 1) >> 1
        if ((this.keys[parent] ?? 0) >= key) break
        this.swap(i, parent)
        i = parent
      }
      return
    }
    if (key >= (this.keys[0] ?? 0)) return
    this.keys[0] = key
    this.idx[0] = index
    let i = 0
    for (;;) {
      const l = 2 * i + 1
      const r = l + 1
      let largest = i
      if (l < this.size && (this.keys[l] ?? 0) > (this.keys[largest] ?? 0)) largest = l
      if (r < this.size && (this.keys[r] ?? 0) > (this.keys[largest] ?? 0)) largest = r
      if (largest === i) break
      this.swap(i, largest)
      i = largest
    }
  }
  private swap(a: number, b: number): void {
    const k = this.keys[a]!
    this.keys[a] = this.keys[b]!
    this.keys[b] = k
    const x = this.idx[a]!
    this.idx[a] = this.idx[b]!
    this.idx[b] = x
  }
  /** Selected indices ordered by key ascending (ties → lower index). */
  sorted(): Int32Array {
    const order = Array.from({ length: this.size }, (_, i) => i)
    order.sort(
      (a, b) =>
        (this.keys[a] ?? 0) - (this.keys[b] ?? 0) || (this.idx[a] ?? 0) - (this.idx[b] ?? 0),
    )
    return Int32Array.from(order, (i) => this.idx[i] ?? 0)
  }
}

interface ComboSpace {
  materials: MaterialRow[]
  materialWeights: number[]
  patterns: PatternRow[]
  /** Per material: pattern indices into `patterns`. */
  patternLists: Int32Array[]
  fitValues: string[]
  fitWeights: number[]
  fitCount: number
  fitIsSilhouette: boolean
  /** Combos per material block (`patternLists[mi].length × fitCount`). */
  blockSize: number[]
  /** Offset of each material block inside one colour span. */
  blockOffset: number[]
  /** Combos per colour. */
  span: number
  comboCount: number
}

function comboSpace(cell: PlanCell): ComboSpace {
  const sub = cell.subcategory
  const schema = ATTRIBUTE_SCHEMAS[sub.schema]!
  const materialList = materialsFor(sub.slug, 'women')
  const materials = materialList.map(([m]) => m)
  const materialWeights = materialList.map(([m, w]) => MATERIAL_PRIOR[sub.slug]?.[m.slug] ?? w)
  const patternsByMaterial = materials.map((m) => patternsFor(sub.group, m.slug))
  const patternIndex = new Map<string, number>()
  const patterns: PatternRow[] = []
  for (const list of patternsByMaterial) {
    for (const p of list) {
      if (!patternIndex.has(p.slug)) {
        patternIndex.set(p.slug, patterns.length)
        patterns.push(p)
      }
    }
  }
  const patternLists = patternsByMaterial.map((list) =>
    Int32Array.from(list, (p) => patternIndex.get(p.slug) ?? 0),
  )
  const fitIsSilhouette = SILHOUETTE_SCHEMAS.has(schema.id)
  const fitOptions = fitIsSilhouette
    ? attributeOptions(schema, 'silhouette', sub.slug)
    : attributeOptions(schema, 'fit', sub.slug)
  const fitValues = fitOptions.map(([v]) => v)
  const fitWeights = fitOptions.length > 0 ? fitOptions.map(([, w]) => w) : [1]
  const fitCount = fitWeights.length
  const blockSize = patternLists.map((list) => list.length * fitCount)
  const blockOffset: number[] = []
  let span = 0
  for (const size of blockSize) {
    blockOffset.push(span)
    span += size
  }
  return {
    materials,
    materialWeights,
    patterns,
    patternLists,
    fitValues,
    fitWeights,
    fitCount,
    fitIsSilhouette,
    blockSize,
    blockOffset,
    span,
    comboCount: span * COLORS.length,
  }
}

function decodeCombo(
  space: ComboSpace,
  k: number,
): [ci: number, mi: number, pi: number, fi: number] {
  const ci = Math.floor(k / space.span)
  const r = k - ci * space.span
  let mi = space.blockOffset.length - 1
  while (mi > 0 && (space.blockOffset[mi] ?? 0) > r) mi--
  const inBlock = r - (space.blockOffset[mi] ?? 0)
  const li = Math.floor(inBlock / space.fitCount)
  const fi = inBlock - li * space.fitCount
  return [ci, mi, space.patternLists[mi]![li] ?? 0, fi]
}

function selectCell(plan: Plan, cell: PlanCell): CellSelection {
  const sub = cell.subcategory
  const group = sub.group
  const brand = cell.brand
  const n = cell.n
  const space = comboSpace(cell)
  const { materials, patterns, fitCount, fitWeights, span } = space

  // Home-aesthetic mixture π_a (step 1).
  const homes = homeWeightsOf(brand)
  const mix: Array<{ a: AestheticDef; pi: number }> = []
  let piTotal = 0
  for (const [slug, hw] of homes) {
    const a = AESTHETIC_BY_SLUG.get(slug)
    if (!a) continue
    const pi = hw * (categoryTerm(a, cell) + 0.2)
    mix.push({ a, pi })
    piTotal += pi
  }
  for (const m of mix) m.pi = piTotal > 0 ? m.pi / piTotal : 1 / Math.max(1, mix.length)
  const A = mix.length

  // Per-axis aesthetic factors (1 + 2·S) / (1 + 1.5·S_fit), precomputed per cell.
  const colF = mix.map(({ a }) => {
    const favoured = AESTHETIC_COLORS[a.slug as AestheticSlug] ?? []
    return Float64Array.from(
      COLORS,
      (c) =>
        1 +
        2 * (favoured.includes(c.slug) ? 1 : a.favours.colorFamilies.includes(c.family) ? 0.5 : 0),
    )
  })
  const matF = mix.map(({ a }) =>
    Float64Array.from(materials, (m) => 1 + 2 * (a.favours.materials.includes(m.slug) ? 1 : 0.25)),
  )
  const patF = mix.map(({ a }) =>
    Float64Array.from(
      patterns,
      (p) => 1 + 2 * (a.favours.patterns.includes(p.slug) ? 1 : p.slug === 'solid' ? 0.5 : 0),
    ),
  )
  const fitF = mix.map(({ a }) =>
    space.fitValues.length > 0
      ? Float64Array.from(space.fitValues, (v) => 1 + 1.5 * (a.favours.fits.includes(v) ? 1 : 0.4))
      : Float64Array.of(1 + 1.5 * 0.4),
  )
  // Per material block: inner[ai][x] = patternPrior · fitWeight · patF · fitF for x = (li, fi),
  // plus the block maximum used for the pruning bound.
  const inner: Float64Array[][] = []
  const innerMax: Float64Array[] = []
  const plainInner: Float64Array[] = []
  const plainMax: number[] = []
  materials.forEach((_, mi) => {
    const list = space.patternLists[mi]!
    const size = space.blockSize[mi] ?? 0
    const plain = new Float64Array(size)
    let pmax = 0
    for (let li = 0; li < list.length; li++) {
      const prior = patterns[list[li]!]!.prior
      for (let fi = 0; fi < fitCount; fi++) {
        const v = prior * (fitWeights[fi] ?? 1)
        plain[li * fitCount + fi] = v
        if (v > pmax) pmax = v
      }
    }
    plainInner.push(plain)
    plainMax.push(pmax)
    const perA: Float64Array[] = []
    const maxA = new Float64Array(A)
    for (let ai = 0; ai < A; ai++) {
      const arr = new Float64Array(size)
      let amax = 0
      for (let li = 0; li < list.length; li++) {
        const pf = patF[ai]![list[li]!] ?? 1
        for (let fi = 0; fi < fitCount; fi++) {
          const v = (plain[li * fitCount + fi] ?? 0) * pf * (fitF[ai]![fi] ?? 1)
          arr[li * fitCount + fi] = v
          if (v > amax) amax = v
        }
      }
      perA.push(arr)
      maxA[ai] = amax
    }
    inner.push(perA)
    innerMax.push(maxA)
  })

  // Department mix per (colour family, material).
  const shares = cell.departments.map((d) => ({ d, share: cell.deptCounts[d] / n }))
  const deptMix = (family: (typeof COLORS)[number]['family'], material: string): number => {
    let s = 0
    for (const { d, share } of shares) {
      if (d === 'kids' && !kidsAllowed(material, group)) continue
      s += share * (DEPT_COLOR_MULT[d][family] ?? 1)
    }
    return s
  }
  const isJeans = sub.slug === 'jeans'
  const isJewelry = group === 'jewelry'

  // Enumerate colour-major; Efraimidis–Spirakis keys into a bounded heap. Once the heap is full a
  // combo can only enter when u > exp(−T · wMax) with wMax an upper bound of its block, so most
  // combos cost one hash and one comparison.
  const heap = new SmallestKeys(Math.min(n, space.comboCount))
  const hasher = new DigitHasher(fnvPrefix(`${plan.seed}combo${cell.id}`))
  const cm = new Float64Array(A)
  let positive = 0
  const weightOf = (ci: number, mi: number, x: number, base: number): number => {
    let aesthetic = 0
    if (A === 0) aesthetic = plainInner[mi]![x] ?? 0
    else {
      for (let ai = 0; ai < A; ai++) aesthetic += (cm[ai] ?? 0) * (inner[mi]![ai]![x] ?? 0)
    }
    const w = base * aesthetic
    return w > 0 && w < COMBO_WEIGHT_FLOOR ? COMBO_WEIGHT_FLOOR : w
  }
  for (let ci = 0; ci < COLORS.length; ci++) {
    const colour = COLORS[ci]!
    const colourBase = COLOR_PRIOR[group][colour.family] * (1 + 0.3 * colour.trend)
    const jeansOk = !isJeans || JEANS_COLORS.includes(colour.slug)
    for (let mi = 0; mi < materials.length; mi++) {
      const material = materials[mi]!
      const size = space.blockSize[mi] ?? 0
      const k0 = ci * span + (space.blockOffset[mi] ?? 0)
      const jewelryRule = isJewelry ? JEWELRY_COLOR_BY_MATERIAL[material.slug] : undefined
      const jewelryOk = !jewelryRule || jewelryRule.includes(colour.slug)
      const dm = deptMix(colour.family, material.slug)
      if (!(jeansOk && jewelryOk && dm > 0)) continue
      const base = colourBase * (space.materialWeights[mi] ?? 1) * dm
      positive += size
      let bound = 0
      if (A === 0) bound = base * (plainMax[mi] ?? 0)
      else {
        for (let ai = 0; ai < A; ai++) {
          cm[ai] = mix[ai]!.pi * (colF[ai]![ci] ?? 1) * (matF[ai]![mi] ?? 1)
          bound += (cm[ai] ?? 0) * (innerMax[mi]![ai] ?? 0)
        }
        bound *= base
      }
      if (bound < COMBO_WEIGHT_FLOOR) bound = COMBO_WEIGHT_FLOOR
      const uMin = heap.full ? Math.exp(-heap.threshold * bound) : 0
      for (let x = 0; x < size; x++) {
        const k = k0 + x
        const u = (hasher.hash(k) + 0.5) / 4294967296
        if (u <= uMin) continue
        const w = weightOf(ci, mi, x, base)
        heap.offer(-Math.log(u) / w, k)
      }
    }
  }
  if (positive === 0) {
    throw new Error(`@lookline/catalog: cell ${sub.slug}/${brand.slug} has no admissible combo`)
  }

  // Selected combos ordered by key; wrap around with editions when n exceeds the space.
  const first = heap.sorted()
  const selected = new Int32Array(n)
  const editions = new Uint8Array(n)
  if (first.length >= n) {
    selected.set(first.subarray(0, n))
    editions.fill(1)
  } else {
    const keyed: Array<[key: number, k: number]> = []
    for (let ci = 0; ci < COLORS.length; ci++) {
      const colour = COLORS[ci]!
      const colourBase = COLOR_PRIOR[group][colour.family] * (1 + 0.3 * colour.trend)
      const jeansOk = !isJeans || JEANS_COLORS.includes(colour.slug)
      for (let mi = 0; mi < materials.length; mi++) {
        const material = materials[mi]!
        const jewelryRule = isJewelry ? JEWELRY_COLOR_BY_MATERIAL[material.slug] : undefined
        const jewelryOk = !jewelryRule || jewelryRule.includes(colour.slug)
        const dm = deptMix(colour.family, material.slug)
        if (!(jeansOk && jewelryOk && dm > 0)) continue
        const base = colourBase * (space.materialWeights[mi] ?? 1) * dm
        for (let ai = 0; ai < A; ai++) {
          cm[ai] = mix[ai]!.pi * (colF[ai]![ci] ?? 1) * (matF[ai]![mi] ?? 1)
        }
        const size = space.blockSize[mi] ?? 0
        const k0 = ci * span + (space.blockOffset[mi] ?? 0)
        for (let x = 0; x < size; x++) {
          const k = k0 + x
          const u = (hasher.hash(k) + 0.5) / 4294967296
          keyed.push([-Math.log(u) / weightOf(ci, mi, x, base), k])
        }
      }
    }
    keyed.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    for (let j = 0; j < n; j++) {
      selected[j] = keyed[j % keyed.length]![1]
      editions[j] = Math.floor(j / keyed.length) + 1
    }
  }

  // Ordinal j → layout position perm[j] → (department, combo).
  const perm = cellPermutation(plan, cell)
  const edition = new Uint8Array(n)
  const department = new Uint8Array(n)
  const comboOf = new Int32Array(n)
  for (let j = 0; j < n; j++) {
    const pos = perm[j] ?? j
    comboOf[j] = selected[pos] ?? 0
    edition[j] = editions[pos] ?? 1
    department[j] = DEPARTMENTS.indexOf(departmentAt(cell, pos))
  }
  // Kids fix-up (§7.3): a kids ordinal holding a kids-excluded material swaps combos with the
  // first non-kids ordinal whose material kids may wear. Combos stay a permutation of the
  // selection, so the duplicate key stays unique by construction.
  const kidsIndex = DEPARTMENTS.indexOf('kids')
  const materialOfCombo = (k: number): string => materials[decodeCombo(space, k)[1]]!.slug
  for (let j = 0; j < n; j++) {
    if (department[j] !== kidsIndex) continue
    if (kidsAllowed(materialOfCombo(comboOf[j]!), group)) continue
    for (let t = 0; t < n; t++) {
      if (t === j || department[t] === kidsIndex) continue
      if (!kidsAllowed(materialOfCombo(comboOf[t]!), group)) continue
      const tmp = comboOf[j]!
      comboOf[j] = comboOf[t]!
      comboOf[t] = tmp
      const te = edition[j]!
      edition[j] = edition[t]!
      edition[t] = te
      break
    }
  }
  const colour = new Uint8Array(n)
  const material = new Uint8Array(n)
  const pattern = new Uint8Array(n)
  const fit = new Int16Array(n)
  for (let j = 0; j < n; j++) {
    const [ci, mi, pi, fi] = decodeCombo(space, comboOf[j]!)
    colour[j] = ci
    material[j] = mi
    pattern[j] = pi
    fit[j] = space.fitValues.length > 0 ? fi : -1
  }
  return {
    colour,
    material,
    pattern,
    fit,
    edition,
    department,
    materials,
    patterns,
    fitValues: space.fitValues,
    fitIsSilhouette: space.fitIsSilhouette,
    positiveCombos: positive,
    comboCount: space.comboCount,
  }
}

const selectionCache = new WeakMap<Plan, Map<number, CellSelection>>()

/** Memoised §7.3 selection of a cell. */
export function cellSelection(plan: Plan, cell: PlanCell): CellSelection {
  let cache = selectionCache.get(plan)
  if (!cache) {
    cache = new Map()
    selectionCache.set(plan, cache)
  }
  let sel = cache.get(cell.id)
  if (!sel) {
    sel = selectCell(plan, cell)
    cache.set(cell.id, sel)
  }
  return sel
}
