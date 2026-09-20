/**
 * Simplified garment silhouettes for deterministic card and preview placeholders. Each is an
 * absolute-command path inside a 200×260 box, keyed by a family resolved from the product's
 * `silhouetteId` (prefix match) or, failing that, its category group.
 */

export type ShapeFamily =
  | 'top'
  | 'sleeveless'
  | 'knit'
  | 'pants'
  | 'shorts'
  | 'skirt'
  | 'dress'
  | 'outer'
  | 'shoe'
  | 'boot'
  | 'bag'
  | 'hat'
  | 'ring'
  | 'pendant'
  | 'swim'
  | 'accessory'

export interface Shape {
  /** Absolute path commands in a 200×260 box. */
  d: string
  /** Approximate visual weight, used to size the shape in the composition. */
  weight: number
}

export const SHAPES: Readonly<Record<ShapeFamily, Shape>> = {
  top: {
    d: 'M60 40 L20 62 L34 110 L56 102 L56 240 L144 240 L144 102 L166 110 L180 62 L140 40 Q120 62 100 62 Q80 62 60 40 Z',
    weight: 1,
  },
  sleeveless: {
    d: 'M70 30 L58 70 L58 240 L142 240 L142 70 L130 30 Q116 52 100 52 Q84 52 70 30 Z',
    weight: 0.8,
  },
  knit: {
    d: 'M56 46 L14 70 L30 126 L52 118 L52 236 L148 236 L148 118 L170 126 L186 70 L144 46 Q122 70 100 70 Q78 70 56 46 Z',
    weight: 1.05,
  },
  pants: {
    d: 'M52 20 L148 20 L156 250 L112 250 L100 120 L88 250 L44 250 Z',
    weight: 1.1,
  },
  shorts: {
    d: 'M50 40 L150 40 L158 150 L110 150 L100 90 L90 150 L42 150 Z',
    weight: 0.7,
  },
  skirt: {
    d: 'M64 30 L136 30 L172 230 Q100 250 28 230 Z',
    weight: 0.95,
  },
  dress: {
    d: 'M70 16 L62 60 L44 100 L58 130 L30 250 L170 250 L142 130 L156 100 L138 60 L130 16 Q100 40 70 16 Z',
    weight: 1.25,
  },
  outer: {
    d: 'M56 30 L12 56 L28 130 L52 120 L46 250 L154 250 L148 120 L172 130 L188 56 L144 30 L124 64 L100 34 L76 64 Z',
    weight: 1.3,
  },
  shoe: {
    d: 'M20 150 C40 100 100 88 140 78 C170 72 190 96 196 130 L196 156 Q100 176 20 166 Z',
    weight: 0.6,
  },
  boot: {
    d: 'M70 30 L130 30 L134 150 C170 152 190 170 190 200 L18 200 Q18 172 66 160 Z',
    weight: 0.8,
  },
  bag: {
    d: 'M40 96 L160 96 L172 236 L28 236 Z M68 96 C68 56 84 40 100 40 C116 40 132 56 132 96',
    weight: 0.75,
  },
  hat: {
    d: 'M40 140 Q100 90 160 140 Q188 154 194 170 Q100 200 6 170 Q12 154 40 140 Z',
    weight: 0.55,
  },
  ring: {
    d: 'M100 40 C150 40 180 80 180 130 C180 180 150 220 100 220 C50 220 20 180 20 130 C20 80 50 40 100 40 Z M100 84 C126 84 140 106 140 130 C140 154 126 176 100 176 C74 176 60 154 60 130 C60 106 74 84 100 84 Z',
    weight: 0.5,
  },
  pendant: {
    d: 'M20 30 C60 80 140 80 180 30 L184 40 C150 100 50 100 16 40 Z M84 100 L116 100 L128 150 L100 180 L72 150 Z',
    weight: 0.55,
  },
  swim: {
    d: 'M40 40 L160 40 L150 120 L110 160 L100 200 L90 160 L50 120 Z',
    weight: 0.7,
  },
  accessory: {
    d: 'M30 90 L170 90 L170 170 L30 170 Z',
    weight: 0.45,
  },
}

const PREFIX_FAMILY: ReadonlyArray<readonly [string, ShapeFamily]> = [
  ['tank', 'sleeveless'],
  ['tee', 'top'],
  ['shirt', 'top'],
  ['blouse', 'top'],
  ['sweater', 'knit'],
  ['cardigan', 'knit'],
  ['hoodie', 'knit'],
  ['sweatshirt', 'knit'],
  ['pants', 'pants'],
  ['shorts', 'shorts'],
  ['skirt', 'skirt'],
  ['overalls', 'pants'],
  ['dress', 'dress'],
  ['jumpsuit', 'dress'],
  ['jacket', 'outer'],
  ['puffer', 'outer'],
  ['coat', 'outer'],
  ['trench', 'outer'],
  ['blazer', 'outer'],
  ['waistcoat', 'sleeveless'],
  ['sneaker', 'shoe'],
  ['boot', 'boot'],
  ['loafer', 'shoe'],
  ['flat', 'shoe'],
  ['pump', 'shoe'],
  ['sandal', 'shoe'],
  ['slide', 'shoe'],
  ['tote', 'bag'],
  ['shoulder-bag', 'bag'],
  ['crossbody', 'bag'],
  ['clutch', 'accessory'],
  ['bucket-bag', 'bag'],
  ['backpack', 'bag'],
  ['belt-bag', 'accessory'],
  ['duffle', 'bag'],
  ['cap', 'hat'],
  ['beanie', 'hat'],
  ['bucket-hat', 'hat'],
  ['belt', 'accessory'],
  ['scarf', 'accessory'],
  ['tie', 'accessory'],
  ['sunglasses', 'accessory'],
  ['socks', 'accessory'],
  ['hair-clip', 'accessory'],
  ['watch', 'ring'],
  ['necklace', 'pendant'],
  ['earrings', 'pendant'],
  ['bracelet', 'ring'],
  ['ring', 'ring'],
  ['brooch', 'pendant'],
  ['sports-bra', 'sleeveless'],
  ['bikini', 'swim'],
  ['one-piece', 'swim'],
  ['trunks', 'shorts'],
  ['kaftan', 'dress'],
  ['pajama', 'top'],
  ['nightgown', 'dress'],
  ['robe', 'outer'],
]

const GROUP_FAMILY: Readonly<Record<string, ShapeFamily>> = {
  tops: 'top',
  bottoms: 'pants',
  dresses: 'dress',
  outerwear: 'outer',
  footwear: 'shoe',
  bags: 'bag',
  accessories: 'accessory',
  jewelry: 'pendant',
  activewear: 'top',
  swimwear: 'swim',
  loungewear: 'top',
  tailoring: 'outer',
}

/** Family for a silhouette id (longest matching prefix), else by category group, else `top`. */
export function shapeFamilyFor(silhouetteId: string, categoryGroup: string): ShapeFamily {
  const id = silhouetteId.toLowerCase()
  let best: ShapeFamily | null = null
  let bestLen = -1
  for (const [prefix, family] of PREFIX_FAMILY) {
    if ((id === prefix || id.startsWith(`${prefix}-`)) && prefix.length > bestLen) {
      best = family
      bestLen = prefix.length
    }
  }
  return best ?? GROUP_FAMILY[categoryGroup] ?? 'top'
}
