/**
 * Size runs (§1.5 of docs/specs/CATALOG_SPEC.md).
 */
import type { Department, SizeSystem } from '../types'
import { findSubcategory } from './categories'

export const SIZE_SYSTEMS = ['alpha', 'numeric-waist', 'eu-shoe', 'one-size'] as const

/** `SIZE_RUNS[system][department]` — the full run offered, in order. */
export const SIZE_RUNS: Readonly<
  Record<SizeSystem, Readonly<Record<Department, readonly string[]>>>
> = {
  alpha: {
    women: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    men: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    unisex: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    kids: ['XS', 'S', 'M', 'L', 'XL'],
  },
  'numeric-waist': {
    women: ['26', '27', '28', '29', '30', '31', '32', '33', '34'],
    men: ['28', '30', '32', '34', '36', '38', '40'],
    unisex: ['28', '30', '32', '34', '36', '38'],
    /** Kids never use numeric-waist; `sizeSystemFor` maps them to alpha. Kept for completeness. */
    kids: ['XS', 'S', 'M', 'L', 'XL'],
  },
  'eu-shoe': {
    women: ['35', '36', '37', '38', '39', '40', '41'],
    men: ['39', '40', '41', '42', '43', '44', '45', '46'],
    unisex: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
    kids: ['35', '36', '37', '38', '39'],
  },
  'one-size': {
    women: ['OS'],
    men: ['OS'],
    unisex: ['OS'],
    kids: ['OS'],
  },
}

/** Kids alpha labels map to age bands in the UI (§1.5). */
export const KIDS_AGE_BANDS: Readonly<Record<string, string>> = {
  XS: '3–4Y',
  S: '5–6Y',
  M: '7–8Y',
  L: '9–10Y',
  XL: '11–12Y',
}

/** Effective size system: kids always use alpha where a subcategory says numeric-waist. */
export function sizeSystemFor(subcategoryOrSystem: string, department: Department): SizeSystem {
  const system = (SIZE_SYSTEMS as readonly string[]).includes(subcategoryOrSystem)
    ? (subcategoryOrSystem as SizeSystem)
    : (findSubcategory(subcategoryOrSystem)?.sizeSystem ?? 'one-size')
  return department === 'kids' && system === 'numeric-waist' ? 'alpha' : system
}

/** The full run for a size system in a department (kids numeric-waist resolves to alpha). */
export function sizeRunFor(system: SizeSystem, department: Department): readonly string[] {
  return SIZE_RUNS[sizeSystemFor(system, department)][department]
}

/** The median size of a run (upper median for even lengths). */
export function medianSize(run: readonly string[]): string | undefined {
  return run[Math.floor(run.length / 2)]
}
