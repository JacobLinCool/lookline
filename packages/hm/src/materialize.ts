/**
 * One validated vision reading plus the row it belongs to, turned into the columns the engine
 * queries and the 64-d style vector it ranks on.
 *
 * Kept apart from the run that produced the reading, so fixing a rule here costs a pass over
 * SQLite rather than 105 100 image requests.
 *
 * The division of labour is the point: the model answers what a photograph shows, and every
 * number the data already knows keeps its measured source. `warmth` stays with the fabric and the
 * months an article sells in, `price-tier` with the price, `trendiness` with sales momentum. Only
 * `formality`, `boldness`, `structure`, `coverage` and `texture` come from the image — and the
 * last three had no source at all before, so they were zero on every row.
 */
import { toStyleVector } from '@lookline/catalog'
import { spaceCjk } from '@lookline/db'
import type { CategoryGroup, ColorFamily } from '@lookline/catalog'
import { sectionMeaning, styleAxes } from './enrich'
import type { VisionResult } from './vision'

/** The article columns a vision reading overwrites or fills in. */
export interface MaterializedArticle {
  aesthetics: string[]
  pattern: string
  printSubject: string
  silhouette: string
  fit: string
  length: string
  neckline: string
  sleeve: string
  closure: string
  material: string
  occasions: string[]
  attributes: Record<string, string | number | boolean>
  styleCaption: string
  styleCaptionZh: string
  searchZh: string
  rise: string
  shoulder: string
  pocketStyle: string
  knitGauge: string
  padding: string
  stylingNote: string
  stylingNoteZh: string
  visionEvidence: string
  visionConfidence: number
  styleVector: number[]
}

/** The row as the import left it — what the dataset and the `detail_desc` regexes established. */
export interface ImportedArticle {
  /** The catalog family slug, `articles.colour_family` — `black`, not H&M's `Black`. */
  colorFamily: string
  categoryGroup: string
  section: string
  seasons: readonly string[]
  occasions: readonly string[]
  price: number
  trendScore: number
  material: string
  fit: string
  length: string
  neckline: string
  sleeve: string
  closure: string
  attributes: Record<string, string | number | boolean>
}

/** The image's answer, or the imported one when the image had none. */
const prefer = (fromImage: string, fromImport: string): string => fromImage || fromImport

export function materializeVision(row: ImportedArticle, vision: VisionResult): MaterializedArticle {
  const measured = styleAxes({
    formality: sectionMeaning(row.section).formality,
    material: row.material,
    seasons: row.seasons,
    price: row.price,
    trendScore: row.trendScore,
  })

  // A blurred, folded or hanger-shot garment should pull the vector toward its tags less far than
  // a clear one does. Confidence belongs in the magnitude, which is what a cosine reads; the
  // column keeps the tag either way, so a facet still finds it.
  const aesthetics: Record<string, number> = {}
  for (const a of vision.aesthetics) aesthetics[a.slug] = a.weight * vision.confidence

  const styleVector = toStyleVector({
    aesthetics,
    colorFamily: row.colorFamily as ColorFamily,
    secondaryColorFamily: null,
    axes: {
      formality: vision.axes.formality,
      boldness: vision.axes.boldness,
      structure: vision.axes.structure,
      coverage: vision.axes.coverage,
      texture: vision.axes.texture,
      warmth: measured['warmth'] ?? 0,
      'price-tier': measured['price-tier'] ?? 0,
      trendiness: measured['trendiness'] ?? 0,
    },
    categoryGroup: row.categoryGroup as CategoryGroup,
  })

  // The two attribute sets share no key: the regexes own `pockets`, `hood`, `zip`, `elasticWaist`
  // and `lined`, the image owns everything in DESIGN_DETAILS.
  // The details are a set, which is what `attributes` is for and what `attribute_match` reads by
  // key. Everything single-valued is a column instead.
  const attributes: Record<string, string | number | boolean> = { ...row.attributes }
  for (const detail of vision.designDetails) attributes[detail] = true

  return {
    aesthetics: vision.aesthetics.map((a) => a.slug),
    // H&M's own pattern column files 17 145 garments as "All over pattern", so the image's
    // reading replaces it outright rather than filling a gap.
    pattern: vision.pattern,
    printSubject: vision.printSubject === 'none' ? '' : vision.printSubject,
    silhouette: vision.silhouette,
    fit: prefer(vision.fit, row.fit),
    length: prefer(vision.length, row.length),
    neckline: prefer(vision.neckline, row.neckline),
    sleeve: prefer(vision.sleeve, row.sleeve),
    closure: prefer(vision.closure, row.closure),
    // The other way round: where the copy names a fabric it is stating a fact, and an image only
    // ever infers one.
    material: prefer(row.material, vision.material),
    // Imported occasions come from the merchandising shelf, so every article on it shares one
    // list; a per-item reading is strictly better when there is one.
    occasions: vision.occasions.length > 0 ? vision.occasions : [...row.occasions],
    attributes,
    styleCaption: vision.lookEn,
    styleCaptionZh: vision.lookZh,
    // Spaced so `unicode61` can tokenise it; the readable copy stays in `styleCaptionZh`.
    searchZh: spaceCjk([vision.lookZh, vision.stylingZh].join(' ')),
    rise: vision.rise,
    shoulder: vision.shoulder,
    pocketStyle: vision.pocketStyle,
    knitGauge: vision.knitGauge,
    padding: vision.padding,
    stylingNote: vision.stylingEn,
    stylingNoteZh: vision.stylingZh,
    visionEvidence: vision.evidence,
    visionConfidence: vision.confidence,
    styleVector,
  }
}
