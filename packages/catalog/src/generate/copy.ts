/**
 * Written copy (CATALOG_SPEC §6): line words, the name grammar, description templates, care
 * lines, outfit pairings. Everything here is a pure function of its inputs; randomness comes in
 * only through explicit draws (or an `Rng` whose draw order is documented on each function).
 */
import type { CategoryGroup, Rng } from '../types'

// ---------------------------------------------------------------------------
// §6.1 line words
// ---------------------------------------------------------------------------

const LINE_WORD_TEXT = `Aster Aldous Arbor Atlas Aurora Avalon Beacon Birch Bowen Brindle Brook Cairn Calder Canyon Cedar Clove
Coble Crest Cypress Dale Dune Echo Elm Ellis Ember Fenn Fjord Flint Ford Glen Grove Hale
Harbor Haven Hazel Heath Holt Idris Indie Iris Isla Juno Jasper Kai Keel Kellan Kelso Knox
Lark Ledger Linden Loch Loxley Lyra Mabel Marden Meadow Mesa Milo Minna Moss Nash Nell Noor
North Oak Odell Opal Orla Otis Pax Perry Pike Piper Quill Rae Reed Remy Ridge River
Roan Rook Rowan Rune Sabine Selby Shore Sloane Sol Sorrel Spruce Sterling Summit Sylvan Talia Tarn
Tess Thea Thorne Tide Tobin Trace Vale Vega Verity Vida Wade Wells Wilder Willa Wynn Yara
Yew Zadie Zephyr Zion Zola Alba Ansel Arden Astrid Bea Blythe Bodhi Briar Cael Cleo Cora
Dagny Della Dev Edie Elin Enzo Esme Etta Ezra Faye Finch Freya Gale Gia Greta Hana
Hugo Ines Ivo Jude Kira Lena Leo Lior Lux Mae Maren Nico Nina Nova Oren Orion
Ottilie Pia Quinn Rafa Romy Rosa Ruth Saga Sana Seren Soren Suki Theo Uma Una Vera
Viggo Wyatt Xavi Yuki Zane Amara Anouk Beck Cato Cyra Dax Eero Elio Fia Gus Hart
Ida Jori Kit Lina Lulu Marnie Neve Odie Pim Rex Selma Tove Ulla Bay Bluff Cliff
Delta Dell Fell Field Firth Gully Inlet Isle Knoll Lagoon Marsh Moor Pass Plain Point Reef
Rill Sound Strand Valley Wold Weir Crag Spur Tor Ness Hollow Rise Bank Amble Drift Glide
Halcyon Lull Meander Nomad Pause Ramble Roam Saunter Stroll Sway Trek Wander Waltz Arrow Ambra Corin`

/** 256 unique line words, index 0–255. */
export const LINE_WORDS: readonly string[] = LINE_WORD_TEXT.split(/\s+/)

/** Suffix for cell ordinals ≥ 256. */
export const ROMAN = ['', 'II', 'III', 'IV'] as const

/** `LINE_WORDS[j mod 256]` plus a Roman suffix for `j ≥ 256` (injective for `j < 1024`). */
export function lineWordFor(ordinal: number): string {
  const j = Math.max(0, Math.floor(ordinal))
  const word = LINE_WORDS[j % 256]!
  const roman = ROMAN[Math.floor(j / 256)] ?? `x${Math.floor(j / 256)}`
  return roman ? `${word} ${roman}` : word
}

/** Lower-case ASCII kebab-case: diacritics stripped, `&` → `and`, runs of other characters → `-`. */
export function kebab(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------------------
// §6.2 descriptor display forms
// ---------------------------------------------------------------------------

const FIT_DISPLAY: Readonly<Record<string, string>> = {
  fitted: 'Fitted',
  slim: 'Slim',
  regular: '',
  relaxed: 'Relaxed',
  oversized: 'Oversized',
  boxy: 'Boxy',
  skinny: 'Skinny',
  straight: 'Straight',
  tapered: 'Tapered',
  wide: 'Wide-Leg',
  flared: 'Flared',
  compression: 'Compression',
}
const RISE_DISPLAY: Readonly<Record<string, string>> = {
  low: 'Low-Rise',
  mid: 'Mid-Rise',
  high: 'High-Rise',
}
const RISE_SCHEMAS = new Set(['pant', 'short', 'tailor-trouser'])
const SILHOUETTE_DISPLAY: Readonly<Record<string, string>> = {
  'a-line': 'A-Line',
  bodycon: 'Bodycon',
  shift: 'Shift',
  'fit-and-flare': 'Fit-and-Flare',
  wrap: 'Wrap',
  slip: 'Slip',
  column: 'Column',
  tiered: 'Tiered',
  pencil: 'Pencil',
  pleated: 'Pleated',
}
const LENGTH_SCHEMAS = new Set(['dress', 'skirt'])
const LENGTH_DISPLAY: Readonly<Record<string, string>> = {
  mini: 'Mini',
  midi: 'Midi',
  maxi: 'Maxi',
  floor: 'Floor-Length',
}
const SHAFT_DISPLAY: Readonly<Record<string, string>> = { knee: 'Knee', 'mid-calf': 'Mid-Calf' }
const HEEL_DISPLAY: Readonly<Record<string, string>> = {
  kitten: 'Kitten-Heel',
  block: 'Block-Heel',
  stiletto: 'Stiletto',
  platform: 'Platform',
}
const SIZE_DISPLAY: Readonly<Record<string, string>> = {
  mini: 'Mini',
  small: 'Small',
  large: 'Large',
}
const GAUGE_DISPLAY: Readonly<Record<string, string>> = { fine: 'Fine-Gauge', chunky: 'Chunky' }
const SCALE_DISPLAY: Readonly<Record<string, string>> = { dainty: 'Dainty', statement: 'Statement' }
const WEIGHT_DISPLAY: Readonly<Record<string, string>> = {
  heavyweight: 'Heavyweight',
  plush: 'Plush',
}
const TYPE_DISPLAY: Readonly<Record<string, string>> = {
  chain: 'Chain',
  pendant: 'Pendant',
  choker: 'Choker',
  stud: 'Stud',
  hoop: 'Hoop',
  drop: 'Drop',
  bangle: 'Bangle',
  cuff: 'Cuff',
  signet: 'Signet',
  pin: 'Pin',
}
const FRAME_DISPLAY: Readonly<Record<string, string>> = {
  round: 'Round',
  square: 'Square',
  'cat-eye': 'Cat-Eye',
  aviator: 'Aviator',
  shield: 'Shield',
}
const COLLAR_DISPLAY: Readonly<Record<string, string>> = {
  band: 'Band-Collar',
  camp: 'Camp-Collar',
}

export interface DescriptorInput {
  /** Attribute schema id (§1.4), e.g. `pant`, `dress`, `sneaker`, `bag`, `jewel`, `shirt`. */
  schema: string
  /** Display noun of the subcategory (§1.3). */
  noun: string
  fit?: string | null
  silhouette?: string | null
  length?: string | null
  /** Schema extras (`attributes` JSON). */
  attributes?: Readonly<Record<string, string | number | boolean>>
}

const wordIn = (noun: string, word: string): boolean =>
  noun
    .toLowerCase()
    .split(/[\s-]+/)
    .includes(word.toLowerCase())

/** Descriptor display form: first rule that yields text, in the order of §6.2; `''` when none. */
export function descriptorFor(input: DescriptorInput): string {
  const attrs = input.attributes ?? {}
  const str = (key: string): string | null => {
    const v = attrs[key]
    return typeof v === 'string' ? v : v === undefined ? null : String(v)
  }
  const fit = input.fit ?? null
  const rise = str('rise')

  if (RISE_SCHEMAS.has(input.schema) && rise && RISE_DISPLAY[rise]) {
    const fitForm = fit ? (FIT_DISPLAY[fit] ?? '') : ''
    return fitForm ? `${RISE_DISPLAY[rise]} ${fitForm}` : RISE_DISPLAY[rise]!
  }
  if (fit && FIT_DISPLAY[fit]) return FIT_DISPLAY[fit]!
  const sil = input.silhouette
  if (sil && SILHOUETTE_DISPLAY[sil] && !wordIn(input.noun, SILHOUETTE_DISPLAY[sil]!)) {
    return SILHOUETTE_DISPLAY[sil]!
  }
  const length = input.length
  if (
    LENGTH_SCHEMAS.has(input.schema) &&
    length &&
    LENGTH_DISPLAY[length] &&
    !wordIn(input.noun, length)
  ) {
    return LENGTH_DISPLAY[length]!
  }
  const height = str('height')
  if (height === 'high') return 'High-Top'
  if (height === 'low' && input.schema !== 'sneaker') return 'Low-Top'
  const shaft = str('shaft')
  if (shaft && SHAFT_DISPLAY[shaft]) return SHAFT_DISPLAY[shaft]!
  const heel = str('heel')
  if (heel && HEEL_DISPLAY[heel]) return HEEL_DISPLAY[heel]!
  const size = str('size')
  if (input.schema === 'bag' && size && SIZE_DISPLAY[size]) return SIZE_DISPLAY[size]!
  const gauge = str('gauge')
  if (gauge && GAUGE_DISPLAY[gauge]) return GAUGE_DISPLAY[gauge]!
  const scale = str('scale')
  if (scale && SCALE_DISPLAY[scale]) return SCALE_DISPLAY[scale]!
  if (str('coverage') === 'full') return 'Full-Coverage'
  const weight = str('weight')
  if (weight && WEIGHT_DISPLAY[weight]) return WEIGHT_DISPLAY[weight]!
  if (str('buttons')?.startsWith('double')) return 'Double-Breasted'
  const hood = str('hood')
  if (hood === 'fixed' || hood === 'detachable') return 'Hooded'
  if (str('insulation') === 'heavy') return 'Down-Filled'
  if (str('support') === 'high') return 'High-Support'
  const type = str('type')
  if (input.schema === 'jewel' && type && TYPE_DISPLAY[type]) return TYPE_DISPLAY[type]!
  const frame = str('frame')
  if (frame && FRAME_DISPLAY[frame]) return FRAME_DISPLAY[frame]!
  const collar = str('collar')
  if (input.schema === 'shirt' && collar && COLLAR_DISPLAY[collar]) return COLLAR_DISPLAY[collar]!
  return ''
}

// ---------------------------------------------------------------------------
// §6.2 name grammar
// ---------------------------------------------------------------------------

export interface NameParts {
  brandName: string
  /** Ordinal `j` of the product inside its `(subcategory, brand)` cell. */
  ordinal: number
  /** Display noun of the subcategory. */
  noun: string
  /** Descriptor display form (`descriptorFor`), or empty/undefined. */
  descriptor?: string | null
  /** `material.adj`, e.g. `Linen`. */
  materialAdj?: string | null
  /** Colour display name, e.g. `Optic White`. */
  colorName?: string | null
}

/** The three `text`-stream draws of the name grammar, in draw order. */
export interface NameDraws {
  descriptorU: number
  materialU: number
  colourU: number
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

/**
 * `{brand} {line} {descriptor}{materialAdj}{noun}{ in Colour}`: descriptor when `descriptorU < .75`,
 * material adjective when `materialU < .45` and not already in the noun, colour suffix when
 * `colourU < .35`. Never produces double spaces.
 */
export function buildName(parts: NameParts, draws: NameDraws): string {
  const line = lineWordFor(parts.ordinal)
  const descriptor =
    draws.descriptorU < 0.75 && parts.descriptor ? `${collapse(parts.descriptor)} ` : ''
  const adj = parts.materialAdj ? collapse(parts.materialAdj) : ''
  const materialAdj =
    draws.materialU < 0.45 && adj && !wordIn(parts.noun, adj) && !wordIn(descriptor, adj)
      ? `${adj} `
      : ''
  const colourSfx =
    draws.colourU < 0.35 && parts.colorName ? ` in ${collapse(parts.colorName)}` : ''
  return collapse(`${parts.brandName} ${line} ${descriptor}${materialAdj}${parts.noun}${colourSfx}`)
}

/** `buildName` with the draws taken from the `text` stream in order: descriptorU, materialU, colourU. */
export function drawName(parts: NameParts, rng: Rng): string {
  const descriptorU = rng.next()
  const materialU = rng.next()
  const colourU = rng.next()
  return buildName(parts, { descriptorU, materialU, colourU })
}

export interface SlugParts {
  brandSlug: string
  ordinal: number
  subcategory: string
}

/** `kebab("{brandSlug}-{line}-{subcategory}")`, e.g. `arlo-basics-aster-tee`, `…-aster-ii-tee`. */
export function buildSlug(parts: SlugParts): string {
  return kebab(`${parts.brandSlug}-${lineWordFor(parts.ordinal)}-${parts.subcategory}`)
}

// ---------------------------------------------------------------------------
// §6.3 descriptions
// ---------------------------------------------------------------------------

export type BrandVoice = 'crisp' | 'warm' | 'technical' | 'playful' | 'editorial'
export type CareKey =
  | 'wash'
  | 'hand-wash'
  | 'dry-clean'
  | 'leather'
  | 'technical'
  | 'metal'
  | 'wipe'

export const S1_TEMPLATES: Readonly<Record<CategoryGroup, readonly string[]>> = {
  tops: [
    'A {fit} {noun} cut from {material} in {colour}.',
    '{Material} {noun} with a {detail} and an easy {fit} fit.',
    'This {colour} {noun} is made from {material} that softens with every wash.',
    'Our {fit} {noun} in {colour} {material}, finished with a {detail}.',
    'Lightweight {material} gives this {colour} {noun} its drape.',
  ],
  bottoms: [
    '{Fit} {noun} in {colour} {material} with a {detail}.',
    'Cut {fit} through the leg, these {colour} {noun} sit at a {rise} rise.',
    '{Material} {noun} in {colour}, built for long days.',
    'A {rise}-rise {noun} in {colour} {material}; the leg falls {fit}.',
    'These {noun} pair {material} with a {detail} for structure.',
  ],
  dresses: [
    'A {fit} {noun} in {colour} {material} with a {neckline} neckline.',
    '{Material} moves easily in this {colour} {noun}, cut {length}.',
    'This {colour} {noun} has {sleeve} sleeves and a {fit} line.',
    'Fluid {material} shapes a {fit} {noun} in {colour}.',
    '{Length}-length {noun} in {colour}, with a {detail}.',
  ],
  outerwear: [
    'A {fit} {noun} in {colour} {material}, {length} length.',
    '{Material} shell, {closure} closure; this {colour} {noun} is built to be layered.',
    'The {noun} in {colour}: {material}, {hood} hood, {fit} through the body.',
    '{Length}-length {noun} cut from {material} in {colour}.',
    'Weatherproof {material} in {colour}, with a {closure} front.',
  ],
  footwear: [
    'A {colour} {noun} in {material} on a {sole} sole.',
    '{Material} upper, {detail}, {colour} throughout.',
    'This {noun} pairs a {toe} toe with {material} in {colour}.',
    '{Height}-profile {noun} in {colour} {material}.',
    'Built on a {sole} sole, the {noun} comes in {colour} {material}.',
  ],
  bags: [
    'A {size} {noun} in {colour} {material} with a {strap} strap.',
    '{Material} {noun} in {colour}; {closure} closure, {hardware} hardware.',
    'The {colour} {noun}: {size}, {material}, made to carry daily.',
    'Structured {material} gives this {colour} {noun} its shape.',
    '{Size} {noun} in {colour}, with {hardware} hardware and a {strap} strap.',
  ],
  accessories: [
    'A {colour} {noun} in {material}.',
    '{Material} {noun} in {colour}, {detail}.',
    'This {noun} comes in {colour} {material} with a {detail}.',
    '{Colour} {material} {noun}, one size.',
    'Simple {noun} in {colour}, made from {material}.',
  ],
  jewelry: [
    'A {scale} {type} {noun} in {metal}{stone}.',
    '{Metal} {noun}, {scale} scale{stone}.',
    'This {type} {noun} is finished in {metal}.',
    '{Scale} {noun} in {metal}, designed to layer.',
    'A {type} {noun} in {metal}{stone}.',
  ],
  activewear: [
    'A {fit} {noun} in {colour} {material}, {length} length.',
    '{Material} with four-way stretch; this {colour} {noun} is cut {fit}.',
    'Sweat-wicking {material} in {colour}, {support} support.',
    '{Fit} {noun} in {colour}, built for {occasion}.',
    'The {noun} in {colour} {material} sits at a {waist} waist.',
  ],
  swimwear: [
    'A {cut} {noun} in {colour} {material}, {coverage} coverage.',
    '{Material} with UPF 50, this {colour} {noun} is cut {cut}.',
    '{Coverage}-coverage {noun} in {colour}.',
    'The {colour} {noun}: {cut} cut, quick-dry {material}.',
    'Chlorine-resistant {material} in {colour}, {cut} style.',
  ],
  loungewear: [
    'A {fit} {noun} in {colour} {material}, {weight}.',
    '{Weight} {material} makes this {colour} {noun} a stay-in favourite.',
    'Soft {material} in {colour}, cut {fit}.',
    'The {noun} in {colour}: {weight} {material}, {length}.',
    '{Fit} {noun} in brushed {material}, {colour}.',
  ],
  tailoring: [
    'A {fit} {noun} in {colour} {material} with {lapel} lapels, {buttons}.',
    '{Material} tailoring in {colour}, cut {fit}.',
    'This {colour} {noun} is half-canvassed {material} with a {lapel} lapel.',
    '{Fit} {noun} in {colour} {material}, {length} length.',
    'Sharp {material} in {colour}; {buttons}, {lapel} lapel.',
  ],
}

export const S2_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  everyday: [
    'Wear it with {pairing} for the everyday.',
    'An easy anchor for weekday rotation.',
    'Made for the days that have no plan.',
  ],
  work: [
    'Pair with {pairing} for the office.',
    'Reads polished under a blazer, relaxed without one.',
    'Desk to dinner without a change.',
  ],
  'date-night': [
    'Pair with {pairing} for dinner out.',
    'Built for low light and good company.',
    'Dress it up with {pairing}.',
  ],
  'wedding-guest': [
    'Wedding-guest ready with {pairing}.',
    'Elegant enough for the ceremony, easy enough for the dance floor.',
    'Finish with {pairing} and go.',
  ],
  party: [
    'Late nights, loud rooms.',
    'Wear it with {pairing} and nothing else matters.',
    'Made to be photographed.',
  ],
  travel: [
    'Packs flat, wears well for hours.',
    'Pair with {pairing} for long-haul days.',
    'Made for airports and after.',
  ],
  workout: [
    'Tested through sprints, stretches and everything between.',
    'Pair with {pairing} for the studio.',
    'Made to move, then move on.',
  ],
  beach: [
    'Sand, salt and long lunches.',
    'Wear over swim or with {pairing}.',
    'Made for the shoreline.',
  ],
  festival: [
    'Layer with {pairing} for the fields.',
    'Built for three days on your feet.',
    'Made for dancing in the dust.',
  ],
  brunch: [
    'Pair with {pairing} for weekend mornings.',
    'Easy, relaxed, slightly dressed.',
    'Made for coffee that runs long.',
  ],
  formal: [
    "Reserved for the evening's best table.",
    'Pair with {pairing} for black-tie.',
    'Made for occasions with a dress code.',
  ],
  lounge: [
    'Made for slow mornings.',
    'Wear with {pairing} and stay in.',
    'Soft enough to sleep in, sharp enough to answer the door.',
  ],
}

export const S3_TEMPLATES: Readonly<Record<BrandVoice, readonly string[]>> = {
  crisp: [
    '{careLine}; it will outlast the trend.',
    'Designed in {origin}, made to be repaired.',
    'No logos, no shortcuts.',
    '{Brand} makes fewer things, better.',
  ],
  warm: [
    'Made in small runs by {Brand}.',
    'Softer each season you keep it.',
    'Designed in {origin} with long evenings in mind.',
    'Meant to be handed down.',
  ],
  technical: [
    'Taped seams, bonded pockets, tested to {test}.',
    'Every panel earns its place.',
    '{careLine}. Packs into its own pocket.',
    'Built in {origin} for weather that changes its mind.',
  ],
  playful: [
    'Loud on purpose.',
    'Goes with everything you already own, sort of.',
    'Limited drop from {Brand}, {origin}.',
    'Wear it before someone else does.',
  ],
  editorial: [
    'From the {Brand} {seasonName} edit.',
    'Cut in {origin}; worn everywhere.',
    'A study in {Aesthetic}.',
    'Photographed on film, worn in daylight.',
  ],
}

/** `{test}` values of the technical voice. */
export const TEST_VALUES: readonly string[] = ['10k mm', '20k cycles', '−10 °C']

export const CARE_LINES: Readonly<Record<CareKey, string>> = {
  wash: 'Machine wash cold',
  'hand-wash': 'Hand wash cold, dry flat',
  'dry-clean': 'Dry clean only',
  leather: 'Wipe clean; condition seasonally',
  technical: 'Machine wash, hang dry',
  metal: 'Store dry; polish with a soft cloth',
  wipe: 'Wipe clean with a damp cloth',
}

export interface Pairing {
  phrase: string
  subcategory: string
}

const pairingRow = (text: string): Pairing[] =>
  text.split(' · ').map((entry) => {
    const m = /^(.+) \[([a-z0-9-]+)\]$/.exec(entry.trim())
    if (!m) throw new Error(`@lookline/catalog: bad pairing "${entry}"`)
    return { phrase: m[1]!, subcategory: m[2]! }
  })

/** `{pairing}` phrases with the subcategory each maps to (complete-the-look prior). */
export const PAIRINGS: Readonly<Record<CategoryGroup, readonly Pairing[]>> = {
  tops: pairingRow(
    'straight jeans [jeans] · tailored trousers [tailored-trousers] · a midi skirt [midi-skirt] · wide-leg trousers [wide-leg-trousers] · chinos [chinos]',
  ),
  bottoms: pairingRow(
    'a tucked shirt [button-down-shirt] · a fine-gauge knit [crewneck-sweater] · a cropped tee [tee] · a blazer [blazer] · a hoodie [hoodie]',
  ),
  dresses: pairingRow(
    'flat sandals [flat-sandal] · ankle boots [ankle-boot] · a cropped jacket [denim-jacket] · a mini bag [mini-bag] · heeled sandals [heeled-sandal]',
  ),
  outerwear: pairingRow(
    'a turtleneck and straight jeans [turtleneck] · a slip dress [slip-dress] · a hoodie [hoodie] · tailored trousers [tailored-trousers] · chunky sneakers [sneaker]',
  ),
  footwear: pairingRow(
    'cropped trousers [tailored-trousers] · a midi skirt [midi-skirt] · wide jeans [jeans] · a shirt dress [shirt-dress] · joggers [joggers]',
  ),
  bags: pairingRow(
    'everyday layers [crewneck-sweater] · evening pieces [slip-dress] · a trench [trench-coat] · a linen shirt [linen-shirt] · a blazer [blazer]',
  ),
  accessories: pairingRow(
    'your simplest outfits [tee] · a wool coat [wool-coat] · a linen shirt [linen-shirt] · a hoodie [hoodie] · a midi dress [midi-dress]',
  ),
  jewelry: pairingRow(
    'everything else in the wardrobe [blouse] · a slip dress [slip-dress] · a white tee [tee] · a turtleneck [turtleneck] · a blazer [blazer]',
  ),
  activewear: pairingRow(
    'running shoes [running-shoe] · a track jacket [track-jacket] · a sports bra [sports-bra] · training tights [training-tights] · a baseball cap [baseball-cap]',
  ),
  swimwear: pairingRow(
    'a cover-up [cover-up] · slides [slide] · a bucket hat [bucket-hat] · sunglasses [sunglasses] · linen shorts [casual-shorts]',
  ),
  loungewear: pairingRow(
    'slippers [slipper] · a robe [robe] · a cardigan [cardigan] · socks [socks] · a sweatshirt [sweatshirt]',
  ),
  tailoring: pairingRow(
    'a dress shirt [dress-shirt] · derbies [derby] · a silk tie [tie] · a tote [tote] · pumps [pump]',
  ),
}

/** `{pairing}` phrases per group (the phrase half of `PAIRINGS`). */
export const OUTFIT_PAIR: Readonly<Record<CategoryGroup, readonly string[]>> = {
  tops: PAIRINGS.tops.map((p) => p.phrase),
  bottoms: PAIRINGS.bottoms.map((p) => p.phrase),
  dresses: PAIRINGS.dresses.map((p) => p.phrase),
  outerwear: PAIRINGS.outerwear.map((p) => p.phrase),
  footwear: PAIRINGS.footwear.map((p) => p.phrase),
  bags: PAIRINGS.bags.map((p) => p.phrase),
  accessories: PAIRINGS.accessories.map((p) => p.phrase),
  jewelry: PAIRINGS.jewelry.map((p) => p.phrase),
  activewear: PAIRINGS.activewear.map((p) => p.phrase),
  swimwear: PAIRINGS.swimwear.map((p) => p.phrase),
  loungewear: PAIRINGS.loungewear.map((p) => p.phrase),
  tailoring: PAIRINGS.tailoring.map((p) => p.phrase),
}

const capitalize = (text: string): string =>
  text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1)
const lowerFirst = (text: string): string =>
  text.length === 0 ? text : text[0]!.toLowerCase() + text.slice(1)

/**
 * Replace `{slot}` tokens. `{Slot}` (capitalised key) capitalises the value of `slot` unless a
 * value for the capitalised key itself exists (`{Brand}`, `{Aesthetic}`). Unknown slots are left
 * untouched so a test can catch them.
 */
export function fillTemplate(template: string, slots: Readonly<Record<string, string>>): string {
  return template.replace(/\{([A-Za-z]+)\}/g, (token, key: string) => {
    const exact = slots[key]
    if (exact !== undefined) return exact
    const lower = lowerFirst(key)
    if (lower !== key && slots[lower] !== undefined) return capitalize(slots[lower]!)
    return token
  })
}

export interface DescriptionContext {
  group: CategoryGroup
  /** `occasions[0]` slug; unknown occasions fall back to `everyday`. */
  occasion: string
  voice: BrandVoice
  /** Slot values (see `buildDescriptionSlots`). `pairing`/`test` may be pre-filled to skip their draws. */
  slots: Readonly<Record<string, string>>
}

/** The `text`-stream draws of the description, in draw order (`pairingU`/`testU` only when used). */
export interface DescriptionDraws {
  s1U: number
  s2U: number
  s3U: number
  s3Present: number
  pairingU?: number
  testU?: number
}

const pickBy = <T>(items: readonly T[], u: number): T =>
  items[Math.min(items.length - 1, Math.max(0, Math.floor(u * items.length)))]!

/** Which sentences a set of draws selects (used by both description builders). */
function selectSentences(ctx: DescriptionContext, draws: DescriptionDraws) {
  const s1 = pickBy(S1_TEMPLATES[ctx.group] ?? S1_TEMPLATES.tops, draws.s1U)
  const s2 = pickBy(S2_TEMPLATES[ctx.occasion] ?? S2_TEMPLATES.everyday!, draws.s2U)
  const s3 = pickBy(S3_TEMPLATES[ctx.voice] ?? S3_TEMPLATES.crisp, draws.s3U)
  const present = draws.s3Present < 0.6
  return { s1, s2, s3, present }
}

/** `S1 + ' ' + S2 (+ ' ' + S3 when s3Present < .6)` with sentence-initial capitals. */
export function buildDescriptionFromDraws(
  ctx: DescriptionContext,
  draws: DescriptionDraws,
): string {
  const { s1, s2, s3, present } = selectSentences(ctx, draws)
  const slots: Record<string, string> = { ...ctx.slots }
  if (slots.pairing === undefined && s2.includes('{pairing}')) {
    slots.pairing = pickBy(OUTFIT_PAIR[ctx.group] ?? OUTFIT_PAIR.tops, draws.pairingU ?? 0)
  }
  if (slots.test === undefined && present && s3.includes('{test}')) {
    slots.test = pickBy(TEST_VALUES, draws.testU ?? 0)
  }
  const sentences = [s1, s2, ...(present ? [s3] : [])].map((t) =>
    capitalize(fillTemplate(t, slots)),
  )
  return sentences.join(' ')
}

/**
 * `buildDescriptionFromDraws` with the draws taken from the `text` stream in order:
 * s1U, s2U, s3U, s3Present, then pairingU (only when S2 uses `{pairing}` and no `pairing` slot
 * was supplied), then testU (only when S3 is present, uses `{test}` and no `test` slot was supplied).
 */
export function buildDescription(ctx: DescriptionContext, rng: Rng): string {
  const draws: DescriptionDraws = {
    s1U: rng.next(),
    s2U: rng.next(),
    s3U: rng.next(),
    s3Present: rng.next(),
  }
  const { s2, s3, present } = selectSentences(ctx, draws)
  if (ctx.slots.pairing === undefined && s2.includes('{pairing}')) draws.pairingU = rng.next()
  if (ctx.slots.test === undefined && present && s3.includes('{test}')) draws.testU = rng.next()
  return buildDescriptionFromDraws(ctx, draws)
}

export interface DescriptionSlotInput {
  group: CategoryGroup
  schema: string
  noun: string
  colorName: string
  materialName: string
  materialCare?: CareKey | null
  fit?: string | null
  silhouette?: string | null
  length?: string | null
  neckline?: string | null
  sleeve?: string | null
  closure?: string | null
  attributes?: Readonly<Record<string, string | number | boolean>>
  brandName: string
  brandOrigin?: string | null
  /** Name of `occasions[0]`. */
  occasionName: string
  /** Primary aesthetic name. */
  aestheticName: string
  /** e.g. `Autumn 2026`. */
  seasonName: string
  /** Optional pre-chosen `{pairing}` phrase. */
  pairing?: string | null
}

const DETAIL_KEYS = ['neckline', 'sleeve', 'closure', 'sole', 'strap', 'hardware', 'stone'] as const
const SILHOUETTE_FIT_SCHEMAS = new Set(['dress', 'skirt'])

/** Build the slot table of §6.3 from a product's columns and extras. Every slot gets a value. */
export function buildDescriptionSlots(input: DescriptionSlotInput): Record<string, string> {
  const attrs = input.attributes ?? {}
  const attr = (key: string): string | null => {
    const v = attrs[key]
    if (v === undefined || v === null || v === '' || v === 'none') return null
    return String(v)
  }
  const columns: Record<string, string | null> = {
    neckline: input.neckline ?? null,
    sleeve: input.sleeve ?? null,
    closure: input.closure ?? null,
  }
  const value = (key: string): string | null => columns[key] ?? attr(key)

  let detail = 'clean finish'
  for (const key of DETAIL_KEYS) {
    const v = value(key)
    if (v) {
      detail = `${v} ${key}`
      break
    }
  }

  const fit = SILHOUETTE_FIT_SCHEMAS.has(input.schema)
    ? (input.silhouette ?? input.fit ?? 'regular')
    : (input.fit ?? input.silhouette ?? 'regular')
  const rise = attr('rise') ?? 'mid'
  const closure = input.closure ?? 'pull-on'
  const buttonsRaw = attr('buttons')
  const buttons = buttonsRaw
    ? buttonsRaw.startsWith('double')
      ? 'double-breasted'
      : 'single-breasted'
    : `${closure} closure`
  const hoodRaw = attr('hood')
  const hood = hoodRaw === 'fixed' || hoodRaw === 'detachable' ? hoodRaw : 'no'
  const stoneRaw = attr('stone')
  const material = input.materialName.toLowerCase()

  const slots: Record<string, string> = {
    colour: input.colorName.toLowerCase(),
    material,
    metal: material,
    fit,
    noun: input.noun.toLowerCase(),
    Brand: input.brandName,
    occasion: input.occasionName.toLowerCase(),
    Aesthetic: input.aestheticName,
    detail,
    rise,
    waist: rise,
    length: input.length ?? attr('length') ?? 'regular',
    sleeve: input.sleeve ?? 'long',
    neckline: input.neckline ?? 'crew',
    closure,
    hood,
    sole: attr('sole') ?? 'rubber',
    toe: attr('toe') ?? 'round',
    height: attr('height') ?? 'low',
    size: attr('size') ?? 'medium',
    strap: attr('strap') ?? 'shoulder',
    hardware: attr('hardware') ?? 'tonal',
    scale: attr('scale') ?? 'regular',
    type: attr('type') ?? 'classic',
    stone: stoneRaw ? ` with ${stoneRaw}` : '',
    support: attr('support') ?? 'medium',
    cut: attr('cut') ?? fit,
    coverage: attr('coverage') ?? 'full',
    weight: attr('weight') ?? 'midweight',
    lapel: attr('lapel') ?? 'clean',
    buttons,
    origin: input.brandOrigin ?? 'our studio',
    seasonName: input.seasonName,
    careLine: CARE_LINES[input.materialCare ?? 'wash'],
  }
  if (input.pairing) slots.pairing = input.pairing
  return slots
}
