/**
 * @lookline/catalog — taxonomy, style-vector encoding, SVG renderer.
 * Each module has exactly one owner; this barrel only re-exports (docs/CONTRACTS.md).
 *
 * The 100k product generator lived here until the catalogue became the real H&M articles file;
 * importing and cleaning that file is @lookline/hm's job now.
 */
export * from './types'
export * from './taxonomy'
export * from './rng'
export * from './vectors'
export * from './render'
