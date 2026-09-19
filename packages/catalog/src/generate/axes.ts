/**
 * The eight style axes (CATALOG_SPEC §8.2), computed from a product's columns and `attributes`.
 * Pure; exported as `computeAxes(product, brand)`.
 */
import {
  findAesthetic,
  findColor,
  findMaterial,
  findPattern,
  findSubcategory,
  fitAdjustments,
} from '../taxonomy'
import type { Axis, BrandTier, GeneratedBrand, GeneratedProduct } from '../types'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const round4 = (x: number): number => Math.round(x * 10_000) / 10_000

const TIER_ADJ: Readonly<Record<BrandTier, number>> = {
  budget: -0.03,
  mid: 0,
  premium: 0.03,
  luxury: 0.06,
}
const TIER_BASE: Readonly<Record<BrandTier, number>> = {
  budget: 0.1,
  mid: 0.35,
  premium: 0.65,
  luxury: 0.9,
}
const SEASON_WARMTH: Readonly<Record<string, number>> = {
  winter: 0.15,
  autumn: 0.05,
  spring: -0.05,
  summer: -0.15,
  'all-season': 0,
}
const LENGTH_COVERAGE: Readonly<Record<string, number>> = {
  mini: -0.1,
  cropped: -0.1,
  short: -0.1,
  knee: 0,
  midi: 0.05,
  maxi: 0.15,
  floor: 0.15,
  full: 0.15,
  longline: 0.05,
}
const SLEEVE_COVERAGE: Readonly<Record<string, number>> = {
  sleeveless: -0.1,
  cap: -0.1,
  short: -0.05,
  'three-quarter': 0.03,
  long: 0.1,
}
const RECENCY: Readonly<Record<number, number>> = { 2026: 1, 2025: 0.6, 2024: 0.3 }

export type AxesInput = Pick<
  GeneratedProduct,
  | 'subcategory'
  | 'material'
  | 'pattern'
  | 'colorName'
  | 'fit'
  | 'silhouette'
  | 'length'
  | 'sleeve'
  | 'attributes'
  | 'seasons'
  | 'price'
  | 'tier'
  | 'secondaryColorHex'
>

/** §8.2 — every axis clamped to [0, 1] and rounded to 4 decimals. */
export function computeAxes(
  p: AxesInput,
  brand: Pick<GeneratedBrand, 'tier'> & { trend?: number },
): Record<Axis, number> {
  const sub = findSubcategory(p.subcategory)
  const material = findMaterial(p.material)
  const pattern = findPattern(p.pattern)
  const colour = findColor(p.colorName)
  if (!sub || !material || !pattern || !colour) {
    throw new Error(`@lookline/catalog: computeAxes: unknown taxonomy value on ${p.subcategory}`)
  }
  const attrs: Readonly<Record<string, string | number | boolean>> = p.attributes ?? {}
  const primarySlug = typeof attrs.primaryAesthetic === 'string' ? attrs.primaryAesthetic : ''
  const aesthetic = findAesthetic(primarySlug)
  const aAxes = aesthetic?.axes ?? {}
  const dropYear = typeof attrs.dropYear === 'number' ? attrs.dropYear : 2026
  const fitAdj = fitAdjustments(p.fit, p.silhouette)
  const season = p.seasons?.[0] ?? 'all-season'
  const garment = sub.coverage > 0
  const tier = p.tier

  const formality =
    sub.formality +
    material.formalityAdj +
    pattern.formalityAdj +
    colour.formalityAdj +
    (aAxes.formality ?? 0) +
    TIER_ADJ[tier]

  let warmth: number
  if (garment) {
    warmth = 0.6 * material.warmth + 0.25 * sub.coverage + (SEASON_WARMTH[season] ?? 0)
    if (attrs.hood !== undefined && attrs.hood !== 'none') warmth += 0.05
    if (p.sleeve === 'long') warmth += 0.05
    else if (p.sleeve === 'sleeveless') warmth -= 0.05
  } else {
    warmth = 0.5 * material.warmth + 0.1
    if (sub.slug === 'beanie' || sub.slug === 'scarf') warmth += 0.25
  }

  const boldness =
    0.45 * colour.boldness +
    0.35 * pattern.boldness +
    0.2 * (aAxes.boldness ?? 0) +
    (fitAdj.boldness ?? 0) +
    (p.secondaryColorHex ? 0.05 : 0)

  const structure = 0.6 * sub.structure + 0.4 * material.structure + (fitAdj.structure ?? 0)

  const lo = Math.log(0.3 * sub.basePrice)
  const hi = Math.log(40 * sub.basePrice)
  const priceTier =
    0.5 * TIER_BASE[tier] + 0.5 * clamp01((Math.log(Math.max(1, p.price)) - lo) / (hi - lo))

  let coverage = 0
  if (garment) {
    coverage =
      sub.coverage +
      (p.length ? (LENGTH_COVERAGE[p.length] ?? 0) : 0) +
      (p.sleeve ? (SLEEVE_COVERAGE[p.sleeve] ?? 0) : 0) +
      (fitAdj.coverage ?? 0)
    if (sub.group === 'swimwear') {
      if (attrs.coverage === 'minimal') coverage -= 0.05
      else if (attrs.coverage === 'full') coverage += 0.1
    }
  }

  let texture = 0.7 * material.texture + 0.3 * pattern.texture
  if (attrs.gauge === 'chunky') texture += 0.15
  else if (attrs.gauge === 'fine') texture -= 0.05
  if (attrs.lining === 'shearling') texture += 0.1

  const trendiness =
    0.55 * (aAxes.trendiness ?? 0.5) +
    0.2 * (brand.trend ?? 0.5) +
    0.15 * (RECENCY[dropYear] ?? 1) +
    0.1 * pattern.trend

  return {
    formality: round4(clamp01(formality)),
    warmth: round4(clamp01(warmth)),
    boldness: round4(clamp01(boldness)),
    structure: round4(clamp01(structure)),
    'price-tier': round4(clamp01(priceTier)),
    coverage: round4(clamp01(coverage)),
    texture: round4(clamp01(texture)),
    trendiness: round4(clamp01(trendiness)),
  }
}
