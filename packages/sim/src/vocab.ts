/**
 * Small vocabularies of the simulation: style presets per cluster, occasion weights, bilingual
 * search utterances and Look titles. All choices take an `Rng`.
 */
import { OCCASIONS, findAesthetic, findOccasion, type Rng } from '@lookline/catalog'

export const PRESETS_BY_ARCHETYPE: Readonly<Record<string, readonly string[]>> = {
  'taipei-quiet-lux': ['paris-editorial', 'studio-minimal', 'gallery-night'],
  'ximending-street': ['street-documentary', 'tokyo-midnight', '90s-magazine'],
  'gorp-hikers': ['street-documentary', 'coastal-morning', 'concrete-brutalist'],
  'k-minimal': ['studio-minimal', 'paris-editorial', 'coastal-morning'],
  'romantic-garden': ['garden-afternoon', 'dreamscape', 'film-still'],
  'dark-academia-club': ['film-still', 'gallery-night', 'paris-editorial'],
  'glam-nights': ['gallery-night', 'tokyo-midnight', 'cyber-couture'],
  'boho-travellers': ['coastal-morning', 'garden-afternoon', 'dreamscape'],
  'clean-girl-office': ['studio-minimal', 'paris-editorial', 'concrete-brutalist'],
  'goth-punk-scene': ['tokyo-midnight', 'concrete-brutalist', '90s-magazine'],
  'athleisure-runners': ['street-documentary', 'studio-minimal', 'coastal-morning'],
  'retro-vintage': ['film-still', '90s-magazine', 'garden-afternoon'],
  'y2k-revival': ['90s-magazine', 'cyber-couture', 'dreamscape'],
  'coastal-surf': ['coastal-morning', 'street-documentary', 'dreamscape'],
  'ballet-coquette': ['dreamscape', 'garden-afternoon', 'studio-minimal'],
  'workwear-makers': ['street-documentary', 'film-still', 'concrete-brutalist'],
  'avant-garde-studio': ['concrete-brutalist', 'cyber-couture', 'gallery-night'],
  'grunge-band': ['90s-magazine', 'tokyo-midnight', 'street-documentary'],
  'city-boy-tokyo': ['street-documentary', 'tokyo-midnight', 'studio-minimal'],
  'preppy-campus': ['paris-editorial', 'coastal-morning', 'film-still'],
  'kidcore-family': ['garden-afternoon', '90s-magazine', 'dreamscape'],
  'western-riders': ['film-still', 'street-documentary', 'garden-afternoon'],
  'k-street-idol': ['tokyo-midnight', 'cyber-couture', '90s-magazine'],
  'cottage-coastal': ['garden-afternoon', 'coastal-morning', 'dreamscape'],
  'scandi-home': ['studio-minimal', 'coastal-morning', 'paris-editorial'],
}

export function pickPreset(rng: Rng, archetype: string): string {
  const list = PRESETS_BY_ARCHETYPE[archetype] ?? ['studio-minimal', 'street-documentary']
  return rng.weighted(list.map((slug, i) => [slug, i === 0 ? 3 : i === 1 ? 2 : 1] as const))
}

const OCCASION_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['everyday', 30],
  ['work', 14],
  ['date-night', 10],
  ['brunch', 10],
  ['travel', 8],
  ['party', 7],
  ['workout', 6],
  ['wedding-guest', 4],
  ['beach', 4],
  ['festival', 3],
  ['formal', 2],
  ['lounge', 2],
]

export function pickOccasion(rng: Rng, archetype: string): string {
  const boost = (slug: string): number => {
    if (archetype === 'athleisure-runners' && slug === 'workout') return 4
    if ((archetype === 'coastal-surf' || archetype === 'boho-travellers') && slug === 'beach')
      return 3
    if (archetype === 'glam-nights' && (slug === 'party' || slug === 'date-night')) return 2.5
    if ((archetype === 'taipei-quiet-lux' || archetype === 'clean-girl-office') && slug === 'work')
      return 2
    if (archetype === 'grunge-band' && slug === 'festival') return 3
    return 1
  }
  return rng.weighted(OCCASION_WEIGHTS.map(([slug, w]) => [slug, w * boost(slug)] as const))
}

const GROUP_WORDS: Readonly<Record<string, readonly [en: string, zh: string]>> = {
  tops: ['top', '上衣'],
  bottoms: ['trousers', '褲子'],
  dresses: ['dress', '洋裝'],
  outerwear: ['jacket', '外套'],
  footwear: ['shoes', '鞋子'],
  bags: ['bag', '包包'],
  accessories: ['accessory', '配件'],
  jewelry: ['jewelry', '飾品'],
  activewear: ['workout set', '運動服'],
  swimwear: ['swimsuit', '泳裝'],
  loungewear: ['loungewear', '居家服'],
  tailoring: ['suit', '西裝'],
}

/** A bilingual "say it in one sentence" utterance for Engine 01 (`intent_sessions`). */
export function searchUtterance(
  rng: Rng,
  input: { aesthetic: string; group: string; occasion: string; budget: number; forGift: boolean },
): string {
  const aesthetic = findAesthetic(input.aesthetic)
  const occasion = findOccasion(input.occasion) ?? OCCASIONS[0]!
  const [groupEn, groupZh] = GROUP_WORDS[input.group] ?? ['piece', '單品']
  const aEn = aesthetic?.name.toLowerCase() ?? input.aesthetic
  const aZh = aesthetic?.labelZh ?? input.aesthetic
  const budget = Math.round(input.budget / 100) * 100
  const gift = input.forGift
  const templates: readonly string[] = gift
    ? [
        `a ${aEn} ${groupEn} as a gift, under NT$${budget}`,
        `想送一件${aZh}風的${groupZh}當禮物，預算 ${budget} 以內`,
        `gift idea: ${aEn} ${groupEn} for ${occasion.name.toLowerCase()}, around ${budget}`,
        `幫朋友找${occasion.labelZh}穿的${aZh}${groupZh}，${budget} 左右`,
      ]
    : [
        `a ${aEn} ${groupEn} for ${occasion.name.toLowerCase()} under NT$${budget}`,
        `想找一件${aZh}風格的${groupZh}，${occasion.labelZh}穿，預算 ${budget} 以內`,
        `${aEn} ${groupEn}, ${occasion.name.toLowerCase()}, budget ${budget}`,
        `${occasion.labelZh}要穿的${aZh}${groupZh}，${budget} 元左右`,
        `something ${aEn} for ${occasion.name.toLowerCase()}, not more than ${budget}`,
        `${aZh}的${groupZh}有推薦嗎？預算 ${budget}`,
      ]
  return rng.pick(templates)
}

const TITLE_MOODS = [
  'rainy-day',
  'after-work',
  'weekend',
  'late-summer',
  'first-cold-front',
  'golden-hour',
  'night-market',
  'typhoon-day',
  'Sunday',
  'commute',
  'rooftop',
  'monsoon',
]

export function lookTitle(
  rng: Rng,
  input: {
    ownerName: string
    aesthetics: readonly string[]
    occasion: string | null
    kind: string
  },
): string {
  const lead = input.aesthetics[0]
    ? (findAesthetic(input.aesthetics[0])?.name ?? input.aesthetics[0])
    : 'everyday'
  const occasion = input.occasion ? findOccasion(input.occasion)?.name.toLowerCase() : null
  const first = input.ownerName.split(' ')[0] ?? input.ownerName
  const mood = rng.pick(TITLE_MOODS)
  if (input.kind === 'remix') {
    return rng.pick([
      `${first}'s ${lead} remix`,
      `${lead}, but make it ${first}`,
      `${first} makes it mine: ${lead}`,
      `${mood} ${lead} — ${first}'s take`,
    ])
  }
  if (input.kind === 'together') {
    return rng.pick([
      `${lead} together${occasion ? ` for ${occasion}` : ''}`,
      `Us, ${occasion ?? mood}: ${lead}`,
      `${first} & friends, ${occasion ?? mood}`,
    ])
  }
  return rng.pick([
    `${first}'s ${mood} ${lead} edition`,
    `${lead}${occasion ? ` for ${occasion}` : ''} — ${first}`,
    `${mood} ${lead}`,
    `${first}: ${lead}${occasion ? `, ${occasion}` : ''}`,
  ])
}
