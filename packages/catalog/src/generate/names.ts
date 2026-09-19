/**
 * Name, slug and description assembly (CATALOG_SPEC §6) on top of `copy.ts`. Stream `text`,
 * draws in order: descriptorU, materialU, colourU, then s1U, s2U, s3U, s3Present (+ pairing/test).
 */
import { SUBCATEGORIES } from '../taxonomy'
import type { SubcategoryRow } from '../taxonomy/categories'
import type { ColorRow } from '../taxonomy/colors'
import type { MaterialRow } from '../taxonomy/materials'
import type { Rng } from '../types'
import type { BrandRecord } from './brands'
import {
  buildDescription,
  buildDescriptionSlots,
  buildName,
  descriptorFor,
  kebab,
  lineWordFor,
  type NameDraws,
  type NameParts,
} from './copy'

export interface NameInput {
  brand: BrandRecord
  ordinal: number
  sub: SubcategoryRow
  colour: ColorRow
  material: MaterialRow
  fit: string | null
  silhouette: string | null
  length: string | null
  extras: Readonly<Record<string, string>>
}

/**
 * Nouns that end with another noun (word-aligned): `Shirt` → [`Linen Shirt`, `Dress Shirt`],
 * `Trousers` → [`Wide-Leg Trousers`], `Tee` → [`Training Tee`], ...
 */
const LONGER_NOUNS: ReadonlyMap<string, readonly string[]> = (() => {
  const nouns = SUBCATEGORIES.map((s) => s.noun)
  const out = new Map<string, string[]>()
  for (const n of nouns) {
    out.set(
      n,
      nouns.filter((other) => other !== n && other.endsWith(` ${n}`)),
    )
  }
  return out
})()

/** True when `rest` (the name after `{brand} {line} `, colour suffix removed) ends with a longer noun. */
function ambiguousRest(rest: string, noun: string): boolean {
  for (const longer of LONGER_NOUNS.get(noun) ?? []) {
    if (rest === longer || rest.endsWith(` ${longer}`)) return true
  }
  return false
}

/**
 * `{brand} {line} {descriptor}{materialAdj}{noun}{ in Colour}` (three `text` draws). The optional
 * tokens are dropped (material adjective first, then the descriptor) whenever they would make the
 * name readable as another subcategory's noun (`Linen` + `Shirt` = the linen-shirt noun), which
 * keeps `(brand, line, noun)` recoverable and therefore names unique across the catalog.
 */
export function drawProductName(rng: Rng, input: NameInput): string {
  const descriptor = descriptorFor({
    schema: input.sub.schema,
    noun: input.sub.noun,
    fit: input.fit,
    silhouette: input.silhouette,
    length: input.length,
    attributes: input.extras,
  })
  const draws: NameDraws = { descriptorU: rng.next(), materialU: rng.next(), colourU: rng.next() }
  const parts: NameParts = {
    brandName: input.brand.name,
    ordinal: input.ordinal,
    noun: input.sub.noun,
    descriptor,
    materialAdj: input.material.adj,
    colorName: input.colour.name,
  }
  const prefix = `${input.brand.name} ${lineWordFor(input.ordinal)} `
  const suffix = draws.colourU < 0.35 ? ` in ${input.colour.name}` : ''
  const variants: ReadonlyArray<Partial<NameParts>> = [
    {},
    { materialAdj: null },
    { descriptor: null },
    { descriptor: null, materialAdj: null },
  ]
  let name = ''
  for (const variant of variants) {
    name = buildName({ ...parts, ...variant }, draws)
    const rest = name.slice(prefix.length, suffix ? name.length - suffix.length : name.length)
    if (!ambiguousRest(rest, input.sub.noun)) break
  }
  return name
}

/** `kebab(name)-id` — unique because the id is. */
export function productSlug(name: string, id: number): string {
  return `${kebab(name)}-${id}`
}

export interface DescriptionInput extends NameInput {
  neckline: string | null
  sleeve: string | null
  closure: string | null
  occasionSlug: string
  occasionName: string
  aestheticName: string
  seasonName: string
}

/** §6.3 description (four `text` draws plus the optional pairing / test draws). */
export function drawProductDescription(rng: Rng, input: DescriptionInput): string {
  const slots = buildDescriptionSlots({
    group: input.sub.group,
    schema: input.sub.schema,
    noun: input.sub.noun,
    colorName: input.colour.name,
    materialName: input.material.name,
    materialCare: input.material.care,
    fit: input.fit,
    silhouette: input.silhouette,
    length: input.length,
    neckline: input.neckline,
    sleeve: input.sleeve,
    closure: input.closure,
    attributes: input.extras,
    brandName: input.brand.name,
    brandOrigin: input.brand.origin,
    occasionName: input.occasionName,
    aestheticName: input.aestheticName,
    seasonName: input.seasonName,
  })
  return buildDescription(
    { group: input.sub.group, occasion: input.occasionSlug, voice: input.brand.voice, slots },
    rng,
  )
}
