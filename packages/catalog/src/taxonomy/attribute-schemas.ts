/**
 * Attribute schemas (§1.4 of docs/specs/CATALOG_SPEC.md, 46 rows).
 *
 * Each schema lists, for the six denormalised product columns (`fit`, `silhouette`, `length`,
 * `neckline`, `sleeve`, `closure`), the allowed values with relative integer weights, plus
 * `extras` written into `articles.attributes`. A column absent from a schema is `null` on the
 * product. Subcategory overrides replace the column's list for that subcategory.
 *
 * Rows are written in the spec's own "value weight value weight …" notation and parsed once at
 * module load, so the tables can be checked against the spec line by line.
 */

export const ATTRIBUTE_COLUMNS = [
  'fit',
  'silhouette',
  'length',
  'neckline',
  'sleeve',
  'closure',
] as const
export type AttributeColumnName = (typeof ATTRIBUTE_COLUMNS)[number]

export type WeightedValue = readonly [value: string, weight: number]

export interface AttributeColumn {
  /** Weighted values used unless a subcategory override applies (may be empty). */
  default: readonly WeightedValue[]
  /** Subcategory slug → weighted values replacing `default` for that subcategory. */
  overrides: Readonly<Record<string, readonly WeightedValue[]>>
}

export interface AttributeSchema {
  id: string
  /** Denormalised columns present on articles of this schema. */
  columns: Readonly<Partial<Record<AttributeColumnName, AttributeColumn>>>
  /** Extra keys written into `articles.attributes` JSON. */
  extras: Readonly<Record<string, AttributeColumn>>
}

/** Parses "slim 15 regular 40 relaxed 25" into weighted pairs. */
export function parseWeighted(spec: string): WeightedValue[] {
  const tokens = spec
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
  if (tokens.length % 2 !== 0) throw new Error(`@lookline/catalog: odd weighted spec "${spec}"`)
  const out: WeightedValue[] = []
  for (let i = 0; i < tokens.length; i += 2) {
    const value = tokens[i]
    const weight = Number(tokens[i + 1])
    if (value === undefined || !Number.isFinite(weight) || weight <= 0) {
      throw new Error(`@lookline/catalog: bad weighted spec "${spec}"`)
    }
    out.push([value, weight])
  }
  return out
}

type ColumnSpec = string | readonly [defaults: string, overrides: Readonly<Record<string, string>>]

function column(spec: ColumnSpec): AttributeColumn {
  const [defaults, overrides] = typeof spec === 'string' ? [spec, {}] : spec
  const parsedOverrides: Record<string, readonly WeightedValue[]> = {}
  for (const [keys, value] of Object.entries(overrides)) {
    const parsed = parseWeighted(value)
    for (const key of keys.split('/')) parsedOverrides[key] = parsed
  }
  return { default: defaults === '' ? [] : parseWeighted(defaults), overrides: parsedOverrides }
}

interface SchemaSpec {
  fit?: ColumnSpec
  silhouette?: ColumnSpec
  length?: ColumnSpec
  neckline?: ColumnSpec
  sleeve?: ColumnSpec
  closure?: ColumnSpec
  extras?: Readonly<Record<string, ColumnSpec>>
}

function defineSchema(id: string, spec: SchemaSpec): AttributeSchema {
  const columns: Partial<Record<AttributeColumnName, AttributeColumn>> = {}
  for (const name of ATTRIBUTE_COLUMNS) {
    const s = spec[name]
    if (s !== undefined) columns[name] = column(s)
  }
  const extras: Record<string, AttributeColumn> = {}
  for (const [key, s] of Object.entries(spec.extras ?? {})) extras[key] = column(s)
  return { id, columns, extras }
}

// prettier-ignore
const SCHEMA_LIST: readonly AttributeSchema[] = [
  defineSchema('tee', {
    fit: 'slim 15 regular 40 relaxed 25 oversized 15 boxy 5',
    length: 'regular 70 cropped 18 longline 12',
    neckline: 'crew 55 v-neck 15 scoop 10 henley 8 boat 5 square 4 mock 3',
    sleeve: 'short 60 long 25 cap 8 raglan 7',
    closure: 'pull-on 100',
  }),
  defineSchema('tank', {
    fit: 'fitted 30 slim 25 regular 25 relaxed 20',
    length: ['regular 70 cropped 30', { 'crop-top': 'cropped 100', camisole: 'regular 100' }],
    neckline: 'scoop 35 crew 25 square 20 halter 10 v-neck 10',
    sleeve: 'sleeveless 100',
    closure: 'pull-on 100',
  }),
  defineSchema('bodysuit', {
    fit: 'fitted 70 slim 30',
    length: 'regular 100',
    neckline: 'scoop 30 square 25 crew 20 halter 10 v-neck 10 off-shoulder 5',
    sleeve: 'long 40 sleeveless 30 short 20 three-quarter 10',
    closure: 'snap 100',
  }),
  defineSchema('shirt', {
    fit: 'slim 25 regular 45 relaxed 20 oversized 10',
    length: 'regular 85 longline 15',
    neckline: 'collar 100',
    sleeve: ['long 70 short 30', { 'polo-shirt': 'short 85 long 15', 'linen-shirt': 'long 55 short 45' }],
    closure: ['button 95 snap 5', { 'polo-shirt': 'pull-on 100' }],
    extras: { collar: ['point 50 button-down 25 band 10 camp 15', { 'polo-shirt': 'polo 100' }] },
  }),
  defineSchema('blouse', {
    fit: 'slim 20 regular 45 relaxed 35',
    length: 'regular 75 cropped 10 longline 15',
    neckline: 'v-neck 25 crew 15 square 15 collar 15 boat 10 off-shoulder 10 sweetheart 5 halter 5',
    sleeve: 'long 35 short 20 puff 20 three-quarter 10 sleeveless 10 elbow 5',
    closure: 'button 50 pull-on 35 zip 15',
  }),
  defineSchema('knit', {
    fit: 'slim 20 regular 40 relaxed 25 oversized 15',
    length: 'regular 75 cropped 15 longline 10',
    neckline: ['crew 55 v-neck 15 mock 10 boat 10 turtle 10', { turtleneck: 'turtle 100', cardigan: 'v-neck 60 crew 40' }],
    sleeve: 'long 90 short 10',
    closure: ['pull-on 100', { cardigan: 'button 80 zip 10 pull-on 10' }],
    extras: { gauge: 'fine 35 medium 45 chunky 20' },
  }),
  defineSchema('sweat', {
    fit: 'regular 35 relaxed 35 oversized 25 boxy 5',
    length: 'regular 75 cropped 15 longline 10',
    neckline: ['crew 100', { hoodie: 'hood 100' }],
    sleeve: 'long 100',
    closure: 'pull-on 85 zip 15',
    extras: { weight: 'midweight 60 heavyweight 40', hood: ['none 100', { hoodie: 'fixed 100' }] },
  }),
  defineSchema('pant', {
    fit: 'skinny 8 slim 20 straight 30 tapered 12 relaxed 15 wide 10 flared 5',
    length: 'regular 70 cropped 20 ankle 10',
    closure: ['zip 65 button 20 drawstring 15', { 'cargo-pants': 'zip 60 drawstring 40' }],
    extras: { rise: 'low 10 mid 55 high 35', wash: ['', { jeans: 'raw 10 dark-wash 25 mid-wash 35 light-wash 20 black 10' }] },
  }),
  defineSchema('short', {
    fit: 'slim 15 regular 35 relaxed 35 wide 15',
    length: 'short 60 knee 40',
    closure: 'zip 45 drawstring 40 button 15',
    extras: { rise: 'mid 60 high 40' },
  }),
  defineSchema('skirt', {
    silhouette: ['a-line 35 pencil 20 pleated 15 tiered 10 wrap 10 column 10', { 'pleated-skirt': 'pleated 100', 'pencil-skirt': 'pencil 100' }],
    length: ['', { 'mini-skirt': 'mini 100', 'midi-skirt': 'midi 100', 'maxi-skirt': 'maxi 100', 'pleated-skirt': 'mini 30 midi 55 maxi 15', 'pencil-skirt': 'knee 50 midi 50' }],
    closure: 'zip 70 button 15 wrap-tie 15',
    extras: { rise: 'mid 55 high 45' },
  }),
  defineSchema('overalls', {
    fit: 'relaxed 50 straight 30 wide 20',
    length: 'full 75 short 25',
    closure: 'buckle 70 button 30',
  }),
  defineSchema('dress', {
    silhouette: ['a-line 25 fit-and-flare 15 shift 15 wrap 10 slip 10 bodycon 10 column 10 tiered 5', {
      'slip-dress': 'slip 100',
      'wrap-dress': 'wrap 100',
      'sheath-dress': 'column 60 bodycon 40',
      'evening-gown': 'column 50 a-line 30 fit-and-flare 20',
      'knit-dress': 'bodycon 40 column 30 shift 30',
      'shirt-dress': 'shift 50 a-line 50',
    }],
    length: ['midi 50 mini 25 maxi 25', { 'mini-dress': 'mini 100', 'midi-dress': 'midi 100', 'maxi-dress': 'maxi 100', 'evening-gown': 'floor 70 maxi 30' }],
    neckline: ['v-neck 20 crew 15 square 15 scoop 10 sweetheart 10 halter 8 off-shoulder 7 boat 5 collar 5 turtle 5', { 'shirt-dress': 'collar 100', 'slip-dress': 'v-neck 50 square 30 scoop 20' }],
    sleeve: ['short 25 long 20 sleeveless 20 puff 15 three-quarter 10 cap 5 elbow 5', { 'slip-dress': 'sleeveless 100', 'knit-dress': 'long 80 short 20' }],
    closure: ['zip 50 pull-on 30 button 15 wrap-tie 5', { 'wrap-dress': 'wrap-tie 100', 'shirt-dress': 'button 100' }],
  }),
  defineSchema('jumpsuit', {
    fit: 'slim 20 regular 40 relaxed 30 wide 10',
    length: 'full 85 cropped 15',
    neckline: 'v-neck 25 square 20 crew 20 halter 15 collar 10 sweetheart 10',
    sleeve: 'sleeveless 30 short 30 long 30 puff 10',
    closure: 'zip 60 button 30 wrap-tie 10',
  }),
  defineSchema('jacket', {
    fit: 'slim 20 regular 45 relaxed 25 oversized 10',
    length: 'regular 60 cropped 25 longline 15',
    closure: ['zip 55 button 30 snap 15', {
      'biker-jacket': 'zip 100',
      windbreaker: 'zip 100',
      'fleece-jacket': 'zip 90 pull-on 10',
      'track-jacket': 'zip 100',
      overshirt: 'button 70 snap 30',
    }],
    extras: {
      hood: ['none 70 fixed 20 detachable 10', { windbreaker: 'fixed 70 none 30', 'biker-jacket': 'none 100' }],
      lining: 'unlined 30 quilted 30 mesh 20 shearling 10 fleece 10',
    },
  }),
  defineSchema('puffer', {
    fit: 'regular 45 relaxed 35 oversized 20',
    length: 'regular 55 cropped 15 longline 30',
    closure: 'zip 100',
    extras: { hood: 'fixed 55 detachable 25 none 20', insulation: 'light 30 medium 45 heavy 25' },
  }),
  defineSchema('coat', {
    fit: 'slim 20 regular 45 relaxed 25 oversized 10',
    length: 'longline 55 regular 30 full 15',
    closure: ['button 60 belt 20 zip 20', { 'trench-coat': 'belt 60 button 40', parka: 'zip 100' }],
    extras: {
      buttons: 'single 60 double 40',
      hood: ['none 80 detachable 20', { parka: 'fixed 70 detachable 30' }],
      lining: 'quilted 40 unlined 30 shearling 15 fleece 15',
    },
  }),
  defineSchema('sneaker', {
    closure: 'lace-up 85 slip-on 10 velcro 5',
    extras: {
      height: ['low 70 mid 15 high 15', { 'running-shoe': 'low 100' }],
      sole: ['cupsole 30 vulcanised 30 foam 30 gum 10', { 'running-shoe': 'foam 100' }],
      toe: 'round 100',
    },
  }),
  defineSchema('shoe', {
    closure: ['slip-on 60 buckle 20 lace-up 20', { derby: 'lace-up 100', 'ballet-flat': 'slip-on 100', pump: 'slip-on 100', 'heeled-sandal': 'buckle 70 slip-on 30' }],
    extras: {
      heel: ['flat 30 kitten 20 block 30 stiletto 15 platform 5', { 'loafer/derby/ballet-flat': 'flat 100', pump: 'stiletto 40 block 35 kitten 25' }],
      toe: 'round 40 almond 30 pointed 20 square 10',
      sole: 'leather 60 rubber 40',
    },
  }),
  defineSchema('boot', {
    closure: ['zip 40 lace-up 35 slip-on 25', { 'chelsea-boot': 'slip-on 100', 'combat-boot': 'lace-up 100', 'hiking-boot': 'lace-up 100' }],
    extras: {
      shaft: ['ankle 60 mid-calf 25 knee 15', { 'knee-high-boot': 'knee 100', 'chelsea-boot/ankle-boot': 'ankle 100' }],
      heel: ['flat 30 block 40 lug 20 kitten 10', { 'combat-boot/hiking-boot': 'lug 100' }],
      toe: 'round 60 almond 25 pointed 15',
    },
  }),
  defineSchema('sandal', {
    closure: ['slip-on 70 buckle 30', { slide: 'slip-on 100', slipper: 'slip-on 100' }],
    extras: {
      sole: ['rubber 40 leather 25 cork 15 eva 20', { slipper: 'eva 60 rubber 40' }],
      toe: ['open 100', { slipper: 'closed 60 open 40' }],
    },
  }),
  defineSchema('bag', {
    closure: ['zip 45 magnetic 25 snap 20 drawstring 10', { 'bucket-bag': 'drawstring 100', clutch: 'magnetic 60 zip 40' }],
    extras: {
      size: ['mini 20 small 35 medium 30 large 15', { 'mini-bag': 'mini 100', duffle: 'large 100', tote: 'medium 50 large 50' }],
      strap: ['top-handle 25 shoulder 30 crossbody 25 adjustable 15 chain 5', { backpack: 'adjustable 100', 'belt-bag': 'adjustable 100', clutch: 'none 70 chain 30' }],
      hardware: 'gold 35 silver 35 gunmetal 15 none 15',
    },
  }),
  defineSchema('hat', {
    extras: {
      brim: ['short 60 none 20 wide 20', { beanie: 'none 100', 'baseball-cap': 'short 100' }],
      fitment: 'adjustable 60 one-size 40',
    },
  }),
  defineSchema('belt', {
    closure: 'buckle 100',
    extras: { hardware: 'gold 35 silver 40 gunmetal 25', width: 'slim 30 regular 50 wide 20' },
  }),
  defineSchema('watch', {
    closure: 'buckle 100',
    extras: { case: '36mm 35 40mm 45 42mm 20', strap: 'leather 45 steel 35 nylon 20', dial: 'white 35 black 35 blue 15 green 15' },
  }),
  defineSchema('scarf', { extras: { weave: 'knit 50 woven 30 silk 20', fringe: 'yes 55 no 45' } }),
  defineSchema('tie', { extras: { width: 'slim 30 regular 55 wide 15', weave: 'satin 30 grenadine 20 knit 20 twill 30' } }),
  defineSchema('sunglasses', { extras: { frame: 'round 25 square 30 cat-eye 20 aviator 15 shield 10', lens: 'dark 50 gradient 25 mirrored 15 clear 10' } }),
  defineSchema('socks', { length: 'ankle 30 crew 55 knee 15', extras: { pack: 'single 60 3-pack 40' } }),
  defineSchema('hair-clip', { extras: { style: 'claw 50 barrette 30 bow 20' } }),
  defineSchema('jewel', {
    extras: {
      stone: 'none 50 pearl 20 cubic-zirconia 15 enamel 10 onyx 5',
      scale: 'dainty 40 regular 40 statement 20',
      type: ['', { necklace: 'chain 40 pendant 40 choker 20', earrings: 'stud 35 hoop 35 drop 30', bracelet: 'chain 40 bangle 30 cuff 30', ring: 'band 50 signet 30 stone 20', brooch: 'pin 100' }],
    },
  }),
  defineSchema('active-top', {
    fit: 'fitted 40 compression 15 regular 30 relaxed 15',
    length: 'regular 70 cropped 30',
    neckline: 'crew 40 scoop 30 racerback 20 v-neck 10',
    sleeve: ['short 45 sleeveless 35 long 20', { 'sports-bra': 'sleeveless 100' }],
    closure: 'pull-on 100',
    extras: { support: ['light 30 medium 45 high 25', { 'performance-tee': 'none 100' }] },
  }),
  defineSchema('active-bottom', {
    fit: ['fitted 30 compression 15 regular 25 relaxed 20 tapered 10', { 'leggings/training-tights/bike-shorts': 'fitted 70 compression 30', 'joggers/sweatpants': 'relaxed 50 tapered 35 regular 15' }],
    length: ['full 60 cropped 25 short 15', { 'running-shorts/bike-shorts': 'short 100', 'joggers/sweatpants': 'full 85 cropped 15' }],
    closure: 'pull-on 70 drawstring 30',
    extras: { rise: 'mid 50 high 50', pocket: 'yes 60 no 40' },
  }),
  defineSchema('swim-top', { extras: { cut: 'triangle 35 bandeau 25 halter 25 sports 15', coverage: 'minimal 30 moderate 50 full 20' } }),
  defineSchema('swim-bottom', { extras: { cut: 'classic 40 high-leg 25 boy-short 15 high-waist 20', coverage: 'minimal 25 moderate 50 full 25' } }),
  defineSchema('one-piece', {
    fit: 'fitted 100',
    neckline: 'scoop 35 square 25 halter 20 v-neck 20',
    sleeve: 'sleeveless 100',
    closure: 'pull-on 100',
    extras: { cut: 'classic 50 high-leg 30 cut-out 20', coverage: 'moderate 60 full 40' },
  }),
  defineSchema('trunks', {
    fit: 'regular 50 relaxed 50',
    length: 'short 55 knee 45',
    closure: 'drawstring 100',
    extras: { lining: 'mesh 70 none 30' },
  }),
  defineSchema('rash-guard', {
    fit: 'fitted 60 regular 40',
    length: 'regular 100',
    neckline: 'crew 80 mock 20',
    sleeve: 'long 60 short 40',
    closure: 'pull-on 80 zip 20',
    extras: { upf: '50 100' },
  }),
  defineSchema('cover-up', {
    fit: 'relaxed 60 oversized 40',
    silhouette: 'shift 40 tiered 30 wrap 30',
    length: 'midi 40 maxi 40 mini 20',
    neckline: 'v-neck 50 boat 30 halter 20',
    sleeve: 'sleeveless 40 short 30 long 30',
    closure: 'pull-on 70 wrap-tie 30',
  }),
  defineSchema('lounge', {
    fit: 'regular 40 relaxed 45 oversized 15',
    length: 'full 70 short 30',
    neckline: 'crew 45 v-neck 30 collar 25',
    sleeve: 'long 55 short 45',
    closure: 'button 40 pull-on 60',
    extras: { weight: 'lightweight 35 midweight 45 plush 20' },
  }),
  defineSchema('nightgown', {
    fit: 'regular 45 relaxed 55',
    silhouette: 'slip 40 shift 40 a-line 20',
    length: 'mini 30 midi 50 maxi 20',
    neckline: 'v-neck 40 scoop 30 square 20 sweetheart 10',
    sleeve: 'sleeveless 45 short 35 long 20',
    closure: 'pull-on 100',
    extras: { weight: 'lightweight 60 midweight 40' },
  }),
  defineSchema('robe', {
    fit: 'relaxed 60 oversized 40',
    length: 'midi 40 maxi 40 knee 20',
    sleeve: 'long 80 three-quarter 20',
    closure: 'belt 100',
    extras: { weight: 'lightweight 30 midweight 35 plush 35' },
  }),
  defineSchema('tailor-jacket', {
    fit: 'slim 35 regular 45 relaxed 15 oversized 5',
    length: 'regular 80 cropped 10 longline 10',
    sleeve: 'long 100',
    closure: 'button 100',
    extras: {
      lapel: 'notch 60 peak 25 shawl 15',
      buttons: 'single-1 20 single-2 45 single-3 10 double-4 10 double-6 15',
      vent: 'single 40 double 45 none 15',
      canvas: 'half 50 full 20 fused 30',
    },
  }),
  defineSchema('suit', {
    fit: 'slim 40 regular 45 relaxed 15',
    length: 'regular 100',
    sleeve: 'long 100',
    closure: 'button 100',
    extras: {
      lapel: ['notch 55 peak 30 shawl 15', { tuxedo: 'shawl 50 peak 50' }],
      buttons: 'single-1 20 single-2 60 double-6 20',
      'trouser-fit': 'slim 40 straight 45 tapered 15',
    },
  }),
  defineSchema('waistcoat', {
    fit: 'slim 50 regular 40 relaxed 10',
    length: 'regular 100',
    neckline: 'v-neck 100',
    sleeve: 'sleeveless 100',
    closure: 'button 100',
    extras: { buttons: 'single-4 30 single-5 45 single-6 25', back: 'fabric 55 satin 45' },
  }),
  defineSchema('tailor-trouser', {
    fit: 'slim 30 straight 40 tapered 15 wide 10 relaxed 5',
    length: 'regular 70 cropped 20 ankle 10',
    closure: 'zip 80 button 20',
    extras: { rise: 'mid 60 high 40', pleats: 'flat-front 55 single 30 double 15', hem: 'plain 65 cuffed 35' },
  }),
  defineSchema('dress-shirt', {
    fit: 'slim 45 regular 45 relaxed 10',
    length: 'regular 100',
    neckline: 'collar 100',
    sleeve: 'long 100',
    closure: 'button 100',
    extras: { collar: 'spread 40 point 30 cutaway 15 button-down 15', cuff: 'barrel 75 french 25' },
  }),
]

/** `ATTRIBUTE_SCHEMAS[id]` — the 46 schemas of §1.4 keyed by id. */
export const ATTRIBUTE_SCHEMAS: Readonly<Record<string, AttributeSchema>> = Object.fromEntries(
  SCHEMA_LIST.map((s) => [s.id, s]),
)

/** Schema ids in spec order. */
export const ATTRIBUTE_SCHEMA_IDS: readonly string[] = SCHEMA_LIST.map((s) => s.id)

export function schemaFor(id: string): AttributeSchema | undefined {
  return ATTRIBUTE_SCHEMAS[id]
}

/** The denormalised columns a schema fills, in `ATTRIBUTE_COLUMNS` order (= `SubcategoryDef.attributes`). */
export function schemaColumns(schema: AttributeSchema): AttributeColumnName[] {
  return ATTRIBUTE_COLUMNS.filter((c) => schema.columns[c] !== undefined)
}

/** Resolved weighted values of one column for a subcategory (override, else default). Empty when absent. */
export function attributeOptions(
  schema: AttributeSchema,
  columnName: AttributeColumnName,
  subcategory: string,
): readonly WeightedValue[] {
  const col = schema.columns[columnName]
  if (!col) return []
  return col.overrides[subcategory] ?? col.default
}

/** Resolved weighted values of one `extras` key for a subcategory. Empty when the key does not apply. */
export function extraOptions(
  schema: AttributeSchema,
  key: string,
  subcategory: string,
): readonly WeightedValue[] {
  const col = schema.extras[key]
  if (!col) return []
  return col.overrides[subcategory] ?? col.default
}
