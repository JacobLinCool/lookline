/**
 * The search facets — one table that every layer of the shop reads instead of keeping its own
 * enum: the filter form and its chips, the URL parser and serializer, the API validation, the
 * sentence and voice decisions, and the SQL that runs the search.
 *
 * A facet is a `ProductSearch` field pair (`key` selects, `excludeKey` rejects), the closed
 * vocabulary its values come from, and how an article stores it. Values within one facet are OR;
 * facets are AND; an exclusion is enforced by SQL. The vocabularies themselves live in their own
 * modules; this file only says which of them are searchable.
 *
 * `decision` says how the sentence resolver asks about the facet. `semantic` facets are few and
 * broad (a colour family, a style), so every value is put to the decision model and "navy" can
 * land in the blue family without a lexicon row for it. `lexical` facets are long lists of
 * concrete construction words — a neckline, a design detail — so only the values the sentence
 * actually names are asked about; the questions stay bounded and the model never guesses that a
 * "party dress" wants sequins.
 */
import type { AestheticDef, CategoryGroup, FitDef, MaterialDef, PatternDef } from '../types'
import { AESTHETICS } from './aesthetics'
import type { CategoryGroupDef } from './categories'
import { CATEGORY_GROUP_DEFS } from './categories'
import type { ColorFamilyDef } from './colors'
import { COLOR_FAMILY_DEFS } from './colors'
import { DESIGN_DETAILS, GARMENT_DETAILS, PRINT_SUBJECTS } from './details'
import type { SilhouetteValueDef, VocabEntry } from './fits'
import { CLOSURES, FITS, LENGTHS, NECKLINES, SILHOUETTE_VALUES, SLEEVES } from './fits'
import { MATERIALS } from './materials'
import { PATTERNS } from './patterns'

/** How `articles` stores one facet. */
export type FacetStorage =
  /** One slug in a text column (`''` when unknown). */
  | 'column'
  /** A JSON array of slugs (`aesthetics`). */
  | 'json-array'
  /** A `true` under the slug in the `attributes` JSON object; absent when unknown. */
  | 'json-flag'

export type FacetDecision = 'semantic' | 'lexical'

export interface SearchFacetDef<
  Id extends string = string,
  Key extends string = string,
  ExcludeKey extends string = string,
> {
  id: Id
  key: Key
  excludeKey: ExcludeKey
  storage: FacetStorage
  decision: FacetDecision
  /** The closed vocabulary; every selectable value is one of these slugs. */
  values: readonly VocabEntry[]
  /**
   * The category groups the facet can describe; absent when it applies to everything. A rail
   * over bags offers no sleeve row, and a sentence about shoes is not asked about a neckline.
   * This is which rows are worth asking about, not proof of data: what the current results
   * actually hold is counted on demand.
   */
  groups?: readonly CategoryGroup[]
}

type Def<Id extends string, Key extends string, ExcludeKey extends string> = SearchFacetDef<
  Id,
  Key,
  ExcludeKey
>

const facet = <Id extends string, Key extends string, ExcludeKey extends string>(
  def: Def<Id, Key, ExcludeKey>,
): Def<Id, Key, ExcludeKey> => def

type Row =
  | CategoryGroupDef
  | ColorFamilyDef
  | AestheticDef
  | MaterialDef
  | PatternDef
  | FitDef
  | SilhouetteValueDef
  | VocabEntry
const vocab = (rows: readonly Row[]): readonly VocabEntry[] =>
  rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    labelZh: row.labelZh,
    synonyms: row.synonyms,
  }))

/**
 * `none` is what the vision pass answers for an unprinted garment, and the column stores it as
 * `''` — the same value an article the pass never reached carries. A filter cannot tell the two
 * apart, so "no print" is not offered as a value; a shopper who wants a plain piece asks for the
 * `solid` pattern, which the pass writes for every article it read.
 */
const PRINT_SUBJECT_VALUES = PRINT_SUBJECTS.filter((p) => p.slug !== 'none')

/** Design details from the photograph plus the construction facts read off the copy. */
export const DETAIL_VALUES: readonly VocabEntry[] = [...DESIGN_DETAILS, ...GARMENT_DETAILS]

/** Garments with a body: everything but footwear, bags, accessories and jewellery. */
const GARMENTS: readonly CategoryGroup[] = [
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'activewear',
  'swimwear',
  'loungewear',
  'tailoring',
]
/** Garments with a top half. */
const UPPER: readonly CategoryGroup[] = GARMENTS.filter((g) => g !== 'bottoms')

export const SEARCH_FACETS = [
  facet({
    id: 'categoryGroup',
    key: 'categoryGroups',
    excludeKey: 'excludedCategoryGroups',
    storage: 'column',
    decision: 'semantic',
    values: vocab(CATEGORY_GROUP_DEFS),
  }),
  facet({
    id: 'colorFamily',
    key: 'colorFamilies',
    excludeKey: 'excludedColorFamilies',
    storage: 'column',
    decision: 'semantic',
    values: vocab(COLOR_FAMILY_DEFS),
  }),
  facet({
    id: 'aesthetic',
    key: 'aesthetics',
    excludeKey: 'excludedAesthetics',
    storage: 'json-array',
    decision: 'semantic',
    values: vocab(AESTHETICS),
  }),
  facet({
    id: 'material',
    key: 'materials',
    excludeKey: 'excludedMaterials',
    storage: 'column',
    decision: 'lexical',
    values: vocab(MATERIALS),
  }),
  facet({
    id: 'pattern',
    key: 'patterns',
    excludeKey: 'excludedPatterns',
    storage: 'column',
    decision: 'lexical',
    values: vocab(PATTERNS),
  }),
  facet({
    id: 'printSubject',
    key: 'printSubjects',
    excludeKey: 'excludedPrintSubjects',
    storage: 'column',
    decision: 'lexical',
    values: vocab(PRINT_SUBJECT_VALUES),
  }),
  facet({
    id: 'silhouette',
    key: 'silhouettes',
    excludeKey: 'excludedSilhouettes',
    storage: 'column',
    decision: 'lexical',
    groups: ['dresses', 'bottoms'],
    values: vocab(SILHOUETTE_VALUES),
  }),
  facet({
    id: 'fit',
    key: 'fits',
    excludeKey: 'excludedFits',
    storage: 'column',
    decision: 'lexical',
    groups: GARMENTS,
    values: vocab(FITS),
  }),
  facet({
    id: 'length',
    key: 'lengths',
    excludeKey: 'excludedLengths',
    storage: 'column',
    decision: 'lexical',
    groups: GARMENTS,
    values: vocab(LENGTHS),
  }),
  facet({
    id: 'neckline',
    key: 'necklines',
    excludeKey: 'excludedNecklines',
    storage: 'column',
    decision: 'lexical',
    groups: UPPER,
    values: vocab(NECKLINES),
  }),
  facet({
    id: 'sleeve',
    key: 'sleeves',
    excludeKey: 'excludedSleeves',
    storage: 'column',
    decision: 'lexical',
    groups: UPPER,
    values: vocab(SLEEVES),
  }),
  facet({
    id: 'closure',
    key: 'closures',
    excludeKey: 'excludedClosures',
    storage: 'column',
    decision: 'lexical',
    groups: [...GARMENTS, 'footwear', 'bags', 'accessories'],
    values: vocab(CLOSURES),
  }),
  facet({
    id: 'detail',
    key: 'details',
    excludeKey: 'excludedDetails',
    storage: 'json-flag',
    decision: 'lexical',
    values: DETAIL_VALUES,
  }),
] as const

export type SearchFacet = (typeof SEARCH_FACETS)[number]
export type SearchFacetId = SearchFacet['id']
export type SearchFacetKey = SearchFacet['key']
export type SearchFacetExcludeKey = SearchFacet['excludeKey']
/** Every `ProductSearch` field a facet owns, selections and exclusions alike. */
export type SearchFacetField = SearchFacetKey | SearchFacetExcludeKey

export const SEARCH_FACET_FIELDS: readonly SearchFacetField[] = SEARCH_FACETS.flatMap((f) => [
  f.key,
  f.excludeKey,
])

const BY_ID: ReadonlyMap<string, SearchFacet> = new Map(SEARCH_FACETS.map((f) => [f.id, f]))
const BY_FIELD: ReadonlyMap<string, SearchFacet> = new Map(
  SEARCH_FACETS.flatMap((f) => [
    [f.key, f],
    [f.excludeKey, f],
  ]),
)

export function findSearchFacet(id: string): SearchFacet | undefined {
  return BY_ID.get(id)
}

/** The facet a `ProductSearch` field belongs to, whether it is the selection or the exclusion. */
export function searchFacetOfField(field: string): SearchFacet | undefined {
  return BY_FIELD.get(field)
}

export function isSearchFacetField(field: string): field is SearchFacetField {
  return BY_FIELD.has(field)
}

/** Whether `value` is one of the facet's slugs. */
export function isFacetValue(def: SearchFacet, value: string): boolean {
  return def.values.some((v) => v.slug === value)
}

/** Whether `facet` can describe an article in any of `groups` (no groups selected: any facet). */
export function facetAppliesTo(def: SearchFacet, groups: readonly string[]): boolean {
  if (!def.groups || groups.length === 0) return true
  return groups.some((g) => (def.groups as readonly string[]).includes(g))
}
