/**
 * `LEXICON` (§12 of docs/specs/CATALOG_SPEC.md): bilingual search terms derived at module load
 * from the taxonomy tables, plus the department definitions and the axis hints the engine's
 * offline intent parser relies on.
 */
import type { Axis, Department, LexEntry, Lexicon } from '../types'
import { AESTHETICS } from './aesthetics'
import { CATEGORY_GROUP_DEFS, SUBCATEGORIES } from './categories'
import { COLOR_FAMILY_DEFS, COLORS } from './colors'
import { FITS, SILHOUETTE_VALUES } from './fits'
import { MATERIALS } from './materials'
import { OCCASIONS, SEASON_DEFS } from './occasions'
import { PATTERNS } from './patterns'

export interface DepartmentDef {
  slug: Department
  name: string
  labelZh: string
  synonyms: readonly string[]
}

/** §12 departments row, in `DEPARTMENTS` order. */
export const DEPARTMENT_DEFS: readonly DepartmentDef[] = [
  {
    slug: 'women',
    name: 'Women',
    labelZh: '女裝',
    synonyms: ['女', '女生', 'ladies', 'womens', 'womenswear', 'woman'],
  },
  {
    slug: 'men',
    name: 'Men',
    labelZh: '男裝',
    synonyms: ['男', '男生', 'mens', 'menswear', 'man'],
  },
  { slug: 'unisex', name: 'Unisex', labelZh: '中性', synonyms: ['男女皆可', 'gender neutral'] },
  {
    slug: 'kids',
    name: 'Kids',
    labelZh: '童裝',
    synonyms: ['小孩', '兒童', 'children', 'child', 'kid'],
  },
]

export function findDepartment(slug: string): DepartmentDef | undefined {
  return DEPARTMENT_DEFS.find((d) => d.slug === slug)
}

interface LexicalRow {
  slug: string
  name: string
  labelZh: string
  synonyms: readonly string[]
}

/**
 * Builds one lexicon entry: the lower-cased union of slug, slug with `-` → space, name, labelZh
 * and the synonyms, duplicates removed, order preserved.
 */
export function toLexEntry(row: LexicalRow): LexEntry {
  const raw = [row.slug, row.slug.replace(/-/g, ' '), row.name, row.labelZh, ...row.synonyms]
  const terms: string[] = []
  const seen = new Set<string>()
  for (const term of raw) {
    const t = term.trim().toLowerCase()
    if (t.length === 0 || seen.has(t)) continue
    seen.add(t)
    terms.push(t)
  }
  return { value: row.slug, terms }
}

const entries = (rows: readonly LexicalRow[]): LexEntry[] => rows.map(toLexEntry)

/** §12 — built from the taxonomy tables in table order. `aesthetics` follows `AESTHETICS`. */
export const LEXICON: Lexicon = {
  departments: entries(DEPARTMENT_DEFS),
  categoryGroups: entries(CATEGORY_GROUP_DEFS),
  subcategories: entries(SUBCATEGORIES),
  colors: entries(COLORS),
  colorFamilies: entries(COLOR_FAMILY_DEFS),
  aesthetics: entries(AESTHETICS),
  materials: entries(MATERIALS),
  patterns: entries(PATTERNS),
  occasions: entries(OCCASIONS),
  seasons: entries(SEASON_DEFS),
  fits: entries([...FITS, ...SILHOUETTE_VALUES]),
}

export type LexiconSection = keyof Lexicon

export const LEXICON_SECTIONS: readonly LexiconSection[] = [
  'departments',
  'categoryGroups',
  'subcategories',
  'colors',
  'colorFamilies',
  'aesthetics',
  'materials',
  'patterns',
  'occasions',
  'seasons',
  'fits',
]

/** Entries of a section whose terms contain `term` (matched lower-cased, exact). */
export function lookupLexicon(section: LexiconSection, term: string): LexEntry[] {
  const t = term.trim().toLowerCase()
  return LEXICON[section].filter((e) => e.terms.includes(t))
}

/** First value in a section matching `term`, or undefined. */
export function resolveTerm(section: LexiconSection, term: string): string | undefined {
  return lookupLexicon(section, term)[0]?.value
}

export interface AxisHint {
  value: string
  terms: readonly string[]
  axes: Readonly<Partial<Record<Axis, number>>>
}

/** Cross-cutting modifier words → axis targets (§12 `AXIS_HINTS`). */
export const AXIS_HINTS: readonly AxisHint[] = [
  { value: 'formal', terms: ['formal', '正式'], axes: { formality: 0.85 } },
  { value: 'casual', terms: ['casual', '休閒'], axes: { formality: 0.25 } },
  { value: 'warm', terms: ['warm', '保暖'], axes: { warmth: 0.8 } },
  { value: 'cool', terms: ['cool', '涼爽', '透氣'], axes: { warmth: 0.2 } },
  { value: 'bold', terms: ['bold', '大膽', '亮眼'], axes: { boldness: 0.8 } },
  { value: 'simple', terms: ['simple', '簡單', '低調'], axes: { boldness: 0.2 } },
  { value: 'structured', terms: ['structured', '挺'], axes: { structure: 0.8 } },
  { value: 'soft', terms: ['soft', '柔軟'], axes: { texture: 0.6, structure: 0.3 } },
  { value: 'trendy', terms: ['trendy', '流行', '潮'], axes: { trendiness: 0.85 } },
  { value: 'classic', terms: ['classic', '經典'], axes: { trendiness: 0.35 } },
]

/** Price words the engine turns into a department-agnostic "cheap" hint (§12); not in `LEXICON`. */
export const CHEAP_TERMS: readonly string[] = ['cheap', '便宜', '平價']
