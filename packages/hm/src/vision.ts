/**
 * What a multimodal model is asked to read off an article's photograph, and the shape it must
 * answer in.
 *
 * H&M recorded this catalogue for its own merchandising, so the columns a recommender wants most
 * are the ones it never kept: no aesthetic on any of the 105 100 rows, a closure on none of them,
 * a neckline on a quarter, and `graphical_appearance_name = 'All over pattern'` for 17 145
 * garments whose print is the entire point of them. `detail_desc` regexes recovered what the copy
 * happened to mention and then ran out of road. The photograph did not.
 *
 * Every value here comes from a vocabulary `@lookline/catalog` already owns, so a value the model
 * writes is a value the intent parser can already ask for. The enums are built from those arrays
 * rather than retyped, and the request is sent with `strict: true`, which makes anything outside
 * them unrepresentable rather than merely discouraged.
 *
 * Design: docs/plans/2026-09-19-vision-attributes-design.md
 */
import {
  AESTHETICS,
  CLOSURES,
  FITS,
  LENGTHS,
  MATERIALS,
  NECKLINES,
  OCCASIONS,
  PATTERNS,
  SILHOUETTE_VALUES,
  SLEEVES,
} from '@lookline/catalog'

/** Prompt and vocabulary revision. Bump on any change here; `article_vision.version` records it. */
export const VISION_VERSION = 'vision-1'

/** Most tags a single article may carry; the model is told, and `parseVision` enforces. */
export const MAX_AESTHETICS = 3
export const MAX_OCCASIONS = 4
export const MAX_DESIGN_DETAILS = 6

/**
 * What a print depicts, which is the question H&M's `graphical_appearance_name` never answers.
 * Kidswear is a third of the catalogue and nearly all of it is printed; "All over pattern" is the
 * same label for a dinosaur, a slogan and a field of daisies.
 */
export const PRINT_SUBJECTS = [
  'none',
  'slogan',
  'character',
  'floral',
  'animal',
  'abstract',
  'landscape',
  'photo',
] as const
export type PrintSubject = (typeof PRINT_SUBJECTS)[number]

/**
 * Construction details a photograph shows and the copy usually omits. They are written into
 * `articles.attributes` as booleans, where `attribute_match` already scores them against an
 * intent's `mustHave` / `mustAvoid` — so "不要蕾絲" works the day the column lands.
 *
 * Deliberately disjoint from the five keys `garmentDetails` sets from `detail_desc` (`pockets`,
 * `hood`, `zip`, `elasticWaist`, `lined`): the two sets merge by plain spread, with no key in
 * both and so no rule about which wins.
 */
export const DESIGN_DETAILS = [
  'ruffle',
  'pleats',
  'cutout',
  'slit',
  'belt',
  'embroidery',
  'sequin',
  'distressed',
  'ribbed',
  'cableKnit',
  'laceTrim',
  'asymmetric',
  'sheer',
  'tieBow',
  'fringe',
  'buttonFront',
  'logo',
] as const
export type DesignDetail = (typeof DESIGN_DETAILS)[number]

/**
 * The materials a photograph actually separates. Cotton against polyester is not a judgement an
 * image supports, and the pass does not make it — those rows keep whatever `detail_desc` said,
 * or stay empty.
 */
export const VISIBLE_MATERIALS = [
  'denim',
  'leather',
  'suede',
  'lace',
  'sequin',
  'velvet',
  'corduroy',
  'tweed',
  'mesh',
  'satin',
  'chiffon',
  'fleece',
  'shearling',
  'canvas',
  'raffia',
  'flannel',
  'mohair-blend',
  'wool',
  'linen',
] as const

/**
 * The axes a photograph can be asked to score. `warmth` comes from the material and the months an
 * article actually sells in, `trendiness` from sales momentum and `price-tier` from the price:
 * a model never overrides a number the data already knows.
 */
export const VISION_AXES = ['formality', 'boldness', 'structure', 'coverage', 'texture'] as const
export type VisionAxis = (typeof VISION_AXES)[number]

const slugs = (rows: readonly { slug: string }[]): string[] => rows.map((r) => r.slug)

/** Every closed list the schema constrains a field to, built from the catalog's own tables. */
export const VISION_VOCAB = {
  aesthetics: slugs(AESTHETICS),
  patterns: slugs(PATTERNS),
  printSubjects: [...PRINT_SUBJECTS],
  designDetails: [...DESIGN_DETAILS],
  fits: slugs(FITS),
  silhouettes: slugs(SILHOUETTE_VALUES),
  lengths: slugs(LENGTHS),
  necklines: slugs(NECKLINES),
  sleeves: slugs(SLEEVES),
  closures: slugs(CLOSURES),
  materials: [...VISIBLE_MATERIALS],
  occasions: slugs(OCCASIONS),
} as const

// A slug that drifted out of the catalog would otherwise reach the model as a value it can return
// and the materialiser as one it silently drops.
{
  const known = new Set(slugs(MATERIALS))
  const missing = VISIBLE_MATERIALS.filter((m) => !known.has(m))
  if (missing.length > 0) {
    throw new Error(`@lookline/hm: VISIBLE_MATERIALS not in the catalog: ${missing.join(', ')}`)
  }
}

export interface VisionResult {
  aesthetics: Array<{ slug: string; weight: number }>
  pattern: string
  printSubject: string
  designDetails: string[]
  fit: string
  silhouette: string
  length: string
  neckline: string
  sleeve: string
  closure: string
  material: string
  axes: Record<VisionAxis, number>
  occasions: string[]
  captionEn: string
  captionZh: string
  confidence: number
  evidence: string
}

// ---------------------------------------------------------------------------
// JSON schema
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>

const enumOf = (values: readonly string[], description: string, blank = false): Json => ({
  type: 'string',
  enum: blank ? ['', ...values] : [...values],
  description,
})

const arrayOf = (items: Json, description: string): Json => ({
  type: 'array',
  items,
  description,
})

/**
 * The strict Structured Outputs schema. Note what is missing: `maxItems`, `minimum` and `maximum`
 * are not supported under `strict`, so the caps and the [0, 1] ranges are stated in the
 * descriptions for the model and enforced in `parseVision` for everyone else.
 */
export function visionJsonSchema(): Json {
  const v = VISION_VOCAB
  const axisProps: Json = {}
  for (const axis of VISION_AXES) {
    axisProps[axis] = { type: 'number', description: `${axis}, 0 to 1` }
  }
  const properties: Json = {
    aesthetics: arrayOf(
      {
        type: 'object',
        additionalProperties: false,
        required: ['slug', 'weight'],
        properties: {
          slug: enumOf(v.aesthetics, 'aesthetic slug'),
          weight: { type: 'number', description: 'how strongly it applies, 0 to 1' },
        },
      },
      `at most ${MAX_AESTHETICS}, strongest first; [] if the garment has no discernible style`,
    ),
    pattern: enumOf(v.patterns, 'the surface pattern; `solid` when there is none'),
    printSubject: enumOf(v.printSubjects, 'what the print depicts; `none` when unprinted'),
    designDetails: arrayOf(
      enumOf(v.designDetails, 'construction detail'),
      `at most ${MAX_DESIGN_DETAILS}, only details clearly visible in the photograph`,
    ),
    fit: enumOf(v.fits, 'how it sits on the body', true),
    silhouette: enumOf(v.silhouettes, 'dress and skirt shape; "" for anything else', true),
    length: enumOf(v.lengths, 'hem or leg length', true),
    neckline: enumOf(v.necklines, 'neckline; "" when not a garment with one', true),
    sleeve: enumOf(v.sleeves, 'sleeve length or shape; "" when not applicable', true),
    closure: enumOf(v.closures, 'how it fastens', true),
    material: enumOf(v.materials, 'only when the surface is unmistakable; "" otherwise', true),
    axes: {
      type: 'object',
      additionalProperties: false,
      required: [...VISION_AXES],
      properties: axisProps,
      description:
        'formality: 0 loungewear, 1 black tie. boldness: 0 disappears into a crowd, 1 turns heads. ' +
        'structure: 0 drapes and clings, 1 holds its own shape. coverage: 0 bares the most skin ' +
        'this category can, 1 covers fully. texture: 0 flat and smooth, 1 deep pile, heavy weave ' +
        'or visible surface relief.',
    },
    occasions: arrayOf(
      enumOf(v.occasions, 'occasion slug'),
      `at most ${MAX_OCCASIONS} places a person would actually wear this`,
    ),
    captionEn: {
      type: 'string',
      description:
        'One sentence on how it looks and who it suits, in English. No brand name, no price, ' +
        'nothing already in the product name.',
    },
    captionZh: { type: 'string', description: 'The same sentence in Traditional Chinese.' },
    confidence: { type: 'number', description: 'overall confidence in this reading, 0 to 1' },
    evidence: {
      type: 'string',
      description:
        'One short clause naming what in the image drove the aesthetics, e.g. ' +
        '"oversized cable knit in oatmeal, no hardware".',
    },
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const zhLabels = (rows: readonly { slug: string; labelZh?: string }[]): string =>
  rows.map((r) => (r.labelZh ? `${r.slug} (${r.labelZh})` : r.slug)).join(', ')

/**
 * The stable half of every request, and so the half prompt caching bills at a tenth. It carries
 * the aesthetic vocabulary with its Chinese labels, because a slug like `clean-girl` or
 * `mob-wife` means little without one.
 */
export const VISION_SYSTEM = `You are cataloguing garments for a fashion search engine from a single product photograph.

Read the image first and the supplied text second. The text is H&M's own merchandising copy: it is reliable about what the item is and unreliable about how it looks, and it frequently says nothing at all. Where they disagree, trust the photograph.

The aesthetic vocabulary, which is the most important field:
${zhLabels(AESTHETICS)}

Rules:
- Answer only from what is visible. Never infer a detail because the category usually has one.
- Leave a field as "" (or [] ) rather than guess. An empty field costs nothing; a wrong one is worse than missing, because a shopper who filters on it will not see this garment.
- Aesthetics are what a person wearing it would be read as, not what the item is. A plain black hoodie is streetwear or normcore, not "tops".
- Occasions are where someone would actually wear this, not everywhere it is permitted.
- A flat-lay, a mannequin and a model shot are all the same garment; judge the garment.
- Set confidence low when the photograph is small, cropped, folded, or shows the item on a hanger with its shape lost.`

export interface VisionArticle {
  id: string
  name: string
  subcategory: string
  description: string
  colorName: string
  section: string
  department: string
}

/** The per-article half of the request: the facts the catalogue does carry. */
export function buildVisionPrompt(a: VisionArticle): string {
  const lines = [
    `product type: ${a.subcategory}`,
    `name: ${a.name}`,
    `department: ${a.department}`,
    `colour (H&M's own label): ${a.colorName || 'unrecorded'}`,
    `merchandising shelf: ${a.section || 'unrecorded'}`,
    `description: ${a.description || '(none)'}`,
  ]
  return `Catalogue this garment.\n\n${lines.join('\n')}`
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const clamp01 = (x: unknown): number =>
  typeof x === 'number' && Number.isFinite(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0

const oneOf = (value: unknown, allowed: readonly string[]): string =>
  typeof value === 'string' && allowed.includes(value) ? value : ''

const someOf = (value: unknown, allowed: readonly string[], cap: number): string[] => {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const slug = oneOf(item, allowed)
    if (slug && !out.includes(slug)) out.push(slug)
    if (out.length >= cap) break
  }
  return out
}

/**
 * Validate and clamp one model response. `strict` already guarantees the enums, so this is the
 * second line of defence, and the only one for the caps and ranges the schema cannot express.
 */
export function parseVision(raw: unknown): VisionResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const v = VISION_VOCAB

  const aesthetics: Array<{ slug: string; weight: number }> = []
  if (Array.isArray(r['aesthetics'])) {
    for (const item of r['aesthetics']) {
      if (typeof item !== 'object' || item === null) continue
      const row = item as Record<string, unknown>
      const slug = oneOf(row['slug'], v.aesthetics)
      if (!slug || aesthetics.some((a) => a.slug === slug)) continue
      const weight = clamp01(row['weight'])
      if (weight <= 0) continue
      aesthetics.push({ slug, weight })
      if (aesthetics.length >= MAX_AESTHETICS) break
    }
    aesthetics.sort((a, b) => b.weight - a.weight)
  }

  const axesRaw = (r['axes'] ?? {}) as Record<string, unknown>
  const axes = Object.fromEntries(
    VISION_AXES.map((axis) => [axis, clamp01(axesRaw[axis])]),
  ) as Record<VisionAxis, number>

  const text = (key: string): string => {
    const value = r[key]
    return typeof value === 'string' ? value.trim().slice(0, 300) : ''
  }

  return {
    aesthetics,
    pattern: oneOf(r['pattern'], v.patterns),
    printSubject: oneOf(r['printSubject'], v.printSubjects),
    designDetails: someOf(r['designDetails'], v.designDetails, MAX_DESIGN_DETAILS),
    fit: oneOf(r['fit'], v.fits),
    silhouette: oneOf(r['silhouette'], v.silhouettes),
    length: oneOf(r['length'], v.lengths),
    neckline: oneOf(r['neckline'], v.necklines),
    sleeve: oneOf(r['sleeve'], v.sleeves),
    closure: oneOf(r['closure'], v.closures),
    material: oneOf(r['material'], v.materials),
    axes,
    occasions: someOf(r['occasions'], v.occasions, MAX_OCCASIONS),
    captionEn: text('captionEn'),
    captionZh: text('captionZh'),
    confidence: clamp01(r['confidence']),
    evidence: text('evidence'),
  }
}
