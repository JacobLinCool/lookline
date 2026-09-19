/**
 * Generation barrel: brands (§4), copy (§6), affinity (§3.4), plan / cells (§7), attributes,
 * pricing, inventory, axes, product assembly and catalog iteration. `catalogDigest` lives in
 * `./digest` (needs `node:crypto`) and is deliberately not re-exported here.
 */
export {
  generateBrands,
  brandSizes,
  slugifyBrand,
  FIXED_BRANDS,
  ROSTER,
  CITIES,
  TAGLINES,
  VOICE_PRIOR,
  TIER_PRICE_BAND,
  TIER_SHARE,
  BRAND_SIZE_MIN,
  BRAND_SIZE_MAX,
  GENERALIST_IDS,
  type BrandRecord,
  type BrandVoice,
  type RosterRow,
} from './brands'
export {
  LINE_WORDS,
  ROMAN,
  lineWordFor,
  kebab,
  descriptorFor,
  buildName,
  drawName,
  buildSlug,
  S1_TEMPLATES,
  S2_TEMPLATES,
  S3_TEMPLATES,
  CARE_LINES,
  TEST_VALUES,
  PAIRINGS,
  OUTFIT_PAIR,
  fillTemplate,
  buildDescription,
  buildDescriptionFromDraws,
  buildDescriptionSlots,
  type CareKey,
  type DescriptorInput,
  type NameParts,
  type NameDraws,
  type SlugParts,
  type Pairing,
  type DescriptionContext,
  type DescriptionDraws,
  type DescriptionSlotInput,
} from './copy'
export * from './affinity'
export * from './constants'
export * from './distribution'
export * from './plan'
export * from './cell'
export * from './attributes'
export * from './pricing'
export * from './inventory'
export * from './axes'
export * from './silhouette'
export * from './names'
export * from './product'
export * from './catalog'
