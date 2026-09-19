/**
 * `generatePersonas(seed, n)`: n users (10 hand-written demo personas first, then generated
 * ones) with bilingual names, unique handles, department/sizes/budget, a social cluster, hidden
 * self taste sampled around the cluster archetype, a distinct gift taste for ≈ 40 %, and
 * behaviour parameters. Pure in (seed, n).
 */
import { createRng, hashSeed, logUniformInt, type Rng } from '@lookline/catalog'
import type { Department } from '@lookline/db'
import { CLUSTER_ARCHETYPES, CLUSTER_COUNT, clusterBySlug } from './clusters'
import { asciiHandle, pickName } from './names'
import { buildTasteVector, clamp01, topAesthetics } from './taste'
import type { Persona, PersonaParams } from './types'

export const DEFAULT_PERSONA_COUNT = 1200
export const GIFT_SHARE = 0.4

export function personaId(index: number): string {
  return `u_${String(index).padStart(6, '0')}`
}

interface DemoSpec {
  handle: string
  displayName: string
  department: Department
  cluster: string
  bio: string
  /** Aesthetic to push on top of the cluster archetype (trend carriers). */
  extra?: string
  gift?: { label: string; department: Department; primaries: readonly [string, string] }
  budget: number
  params: PersonaParams
}

/** Ten demo personas (docs/CONTRACTS.md asks for ≥ 8 demo-ready personas). */
export const DEMO_PERSONAS: readonly DemoSpec[] = [
  {
    handle: 'jacob',
    displayName: 'Jacob Lin 林宇翔',
    department: 'men',
    cluster: 'gorp-hikers',
    bio: 'Builds things on weekdays, climbs Qixing on weekends. Gorpcore by necessity, techwear by taste; the friend who always has a spare shell jacket.',
    extra: 'city-boy',
    gift: { label: 'for my sister', department: 'women', primaries: ['k-street', 'minimalist'] },
    budget: 6000,
    params: { activity: 0.9, remixPropensity: 0.45, askPropensity: 0.5, shareRadius: 6 },
  },
  {
    handle: 'alice',
    displayName: 'Alice Chen',
    department: 'women',
    cluster: 'taipei-quiet-lux',
    bio: 'Product lead in Xinyi, quiet-luxury believer: camel coats, one good bag, nothing that shouts. Asks friends before every big purchase and answers theirs at 2 a.m.',
    gift: { label: 'for Mom', department: 'women', primaries: ['romantic', 'quiet-luxury'] },
    budget: 12000,
    params: { activity: 0.85, remixPropensity: 0.3, askPropensity: 0.7, shareRadius: 5 },
  },
  {
    handle: 'mei',
    displayName: '沈美琪 Mei Shen',
    department: 'women',
    cluster: 'romantic-garden',
    bio: 'Florist in Yangmei with a balcony full of herbs. Romantic and cottagecore, puff sleeves on purpose, film camera always in the tote.',
    gift: { label: 'for my partner', department: 'men', primaries: ['workwear', 'city-boy'] },
    budget: 4500,
    params: { activity: 0.85, remixPropensity: 0.35, askPropensity: 0.45, shareRadius: 5 },
  },
  {
    handle: 'ken',
    displayName: 'Ken Wu 吳建宏',
    department: 'men',
    cluster: 'city-boy-tokyo',
    bio: 'Bicycle commuter, Popeye magazine subscriber, wide trousers and clean sneakers. Remixes friends’ Looks into something you could actually cycle in.',
    extra: 'gorpcore',
    budget: 7000,
    params: { activity: 0.85, remixPropensity: 0.6, askPropensity: 0.3, shareRadius: 5 },
  },
  {
    handle: 'yuki',
    displayName: 'Yuki Tanaka',
    department: 'women',
    cluster: 'k-minimal',
    bio: 'Moved from Osaka to Da-an for a design job. Beige, grey, off-white; one perfect trouser; a wardrobe that fits in a carry-on and looks like it was planned.',
    gift: {
      label: 'for my mother-in-law',
      department: 'women',
      primaries: ['quiet-luxury', 'scandi'],
    },
    budget: 8000,
    params: { activity: 0.8, remixPropensity: 0.35, askPropensity: 0.4, shareRadius: 4 },
  },
  {
    handle: 'noah',
    displayName: 'Noah Williams',
    department: 'men',
    cluster: 'athleisure-runners',
    bio: 'English teacher and riverside runner. Athleisure Monday to Friday, normcore on Sunday; owns more running shoes than opinions.',
    gift: {
      label: 'for my girlfriend',
      department: 'women',
      primaries: ['athleisure', 'clean-girl'],
    },
    budget: 4000,
    params: { activity: 0.8, remixPropensity: 0.25, askPropensity: 0.35, shareRadius: 4 },
  },
  {
    handle: 'hana',
    displayName: 'Hana Kim',
    department: 'women',
    cluster: 'ballet-coquette',
    bio: 'Pilates instructor in Tianmu. Balletcore and coquette: wrap cardigans, ribbons, mesh; the first to try a new silhouette and the first to share it.',
    extra: 'y2k',
    budget: 5000,
    params: { activity: 0.9, remixPropensity: 0.5, askPropensity: 0.55, shareRadius: 6 },
  },
  {
    handle: 'leo',
    displayName: 'Leo Huang 黃立安',
    department: 'men',
    cluster: 'workwear-makers',
    bio: 'Runs a leather workshop in Wanhua. Raw denim, chore coats, boots resoled twice. Buys little, buys well, and knows what his customers will wear next season.',
    gift: { label: 'for Dad', department: 'men', primaries: ['western', 'workwear'] },
    budget: 6500,
    params: { activity: 0.75, remixPropensity: 0.3, askPropensity: 0.25, shareRadius: 4 },
  },
  {
    handle: 'aria',
    displayName: 'Aria Rossi',
    department: 'women',
    cluster: 'glam-nights',
    bio: 'Milanese bartender who moved to Xinyi for the night skyline. Glam and mob-wife: faux fur, sequins, big gold earrings. Dresses like every Tuesday is a premiere.',
    extra: 'avant-garde',
    gift: { label: 'for my brother', department: 'men', primaries: ['streetwear', 'k-street'] },
    budget: 15000,
    params: { activity: 0.9, remixPropensity: 0.45, askPropensity: 0.5, shareRadius: 6 },
  },
  {
    handle: 'ravi',
    displayName: 'Ravi Patel',
    department: 'men',
    cluster: 'dark-academia-club',
    bio: 'Doctoral student near Gongguan. Dark academia and preppy: tweed, oxford shirts, a fountain pen that leaks. Answers style Asks with footnotes.',
    gift: { label: 'for my niece', department: 'kids', primaries: ['kidcore', 'preppy'] },
    budget: 5500,
    params: { activity: 0.8, remixPropensity: 0.3, askPropensity: 0.45, shareRadius: 4 },
  },
]

const GIFT_LABELS: ReadonlyArray<readonly [label: string, department: Department]> = [
  ['for Mom', 'women'],
  ['for Dad', 'men'],
  ['for my partner', 'women'],
  ['for my partner', 'men'],
  ['for my sister', 'women'],
  ['for my brother', 'men'],
  ['for my best friend', 'women'],
  ['for my roommate', 'unisex'],
  ['for my kid', 'kids'],
  ['for my niece', 'kids'],
  ['for my nephew', 'kids'],
  ['for a colleague', 'unisex'],
]

function pickDepartment(rng: Rng, shares: readonly [number, number, number]): Department {
  return rng.weighted([
    ['women', shares[0]],
    ['men', shares[1]],
    ['unisex', shares[2]],
  ] as const)
}

/** Sizes keyed the way the engine resolves them (`alpha`, `numeric-waist`, `eu-shoe`). */
export function pickSizes(rng: Rng, department: Department): Record<string, string> {
  const alpha =
    department === 'men'
      ? rng.weighted([
          ['S', 1],
          ['M', 3],
          ['L', 3],
          ['XL', 2],
          ['XXL', 0.5],
        ] as const)
      : department === 'kids'
        ? rng.pick(['XS', 'S', 'M', 'L', 'XL'] as const)
        : rng.weighted([
            ['XS', 1],
            ['S', 3],
            ['M', 3],
            ['L', 2],
            ['XL', 0.7],
          ] as const)
  const waist =
    department === 'men'
      ? String(rng.pick([28, 30, 30, 32, 32, 34, 36]))
      : department === 'women'
        ? String(rng.pick([26, 27, 28, 28, 29, 30, 31, 32]))
        : String(rng.pick([28, 30, 30, 32, 34]))
  const shoe =
    department === 'men'
      ? String(rng.pick([40, 41, 42, 42, 43, 43, 44, 45]))
      : department === 'women'
        ? String(rng.pick([35, 36, 37, 37, 38, 38, 39, 40]))
        : department === 'kids'
          ? String(rng.pick([35, 36, 37, 38]))
          : String(rng.pick([38, 39, 40, 41, 42, 43]))
  return { alpha, 'numeric-waist': waist, 'eu-shoe': shoe }
}

function uniqueHandle(base: string, taken: Set<string>): string {
  let handle = base || 'user'
  let k = 2
  while (taken.has(handle)) handle = `${base}${k++}`
  taken.add(handle)
  return handle
}

function personaBio(rng: Rng, clusterIndex: number, primaries: readonly string[]): string {
  const archetype = CLUSTER_ARCHETYPES[clusterIndex]!
  const lead = rng.pick(archetype.bios)
  const tail = rng.pick([
    `Lives around ${archetype.place}.`,
    `Mostly ${primaries[0]} with a ${primaries[1]} streak.`,
    `Shops with friends more than alone.`,
    `Would rather remix a friend's Look than scroll.`,
    `Buys for other people almost as often as for herself or himself.`,
    `Weekend ${archetype.place} regular.`,
  ])
  return `${lead} ${tail}`
}

function demoPersona(spec: DemoSpec, index: number, seed: number): Persona {
  const cluster = clusterBySlug(spec.cluster)
  if (cluster < 0) throw new Error(`@lookline/sim: unknown demo cluster ${spec.cluster}`)
  const archetype = CLUSTER_ARCHETYPES[cluster]!
  const rng = createRng(hashSeed(seed, 'demo', spec.handle))
  const hidden = buildTasteVector({
    primaries: archetype.aesthetics,
    department: spec.department,
    rng,
    extra: spec.extra ?? null,
  })
  const gift = spec.gift
    ? buildTasteVector({
        primaries: resolveGiftPrimaries(spec.gift.primaries, rng),
        department: spec.gift.department,
        rng,
      })
    : null
  return {
    id: personaId(index),
    handle: spec.handle,
    displayName: spec.displayName,
    department: spec.department,
    sizes: pickSizes(rng, spec.department),
    budgetHint: spec.budget,
    avatarSeed: hashSeed(seed, 'avatar', spec.handle) % 100000,
    bio: spec.bio,
    socialCluster: cluster,
    isPersona: true,
    archetype: archetype.slug,
    primaryAesthetics: topAesthetics(hidden, 3),
    hiddenVector: hidden,
    giftHiddenVector: gift,
    giftDepartment: spec.gift?.department ?? null,
    giftLabel: spec.gift?.label ?? null,
    params: spec.params,
  }
}

const known = (slug: string): boolean => CLUSTER_ARCHETYPES.some((a) => a.aesthetics.includes(slug))

/** Demo gift primaries may name a cluster-free pair; unknown slugs fall back to a random archetype. */
function resolveGiftPrimaries(
  primaries: readonly [string, string],
  rng: Rng,
): readonly [string, string] {
  const fallback = CLUSTER_ARCHETYPES[rng.int(0, CLUSTER_COUNT - 1)]!.aesthetics
  return [
    known(primaries[0]) ? primaries[0] : fallback[0],
    known(primaries[1]) ? primaries[1] : fallback[1],
  ]
}

function generatedPersona(index: number, seed: number, taken: Set<string>): Persona {
  const rng = createRng(hashSeed(seed, 'persona', index))
  // Cluster: round-robin with a little shuffle so cluster sizes are even (≈ n / 24).
  const cluster = (index + rng.int(0, 2)) % CLUSTER_COUNT
  const archetype = CLUSTER_ARCHETYPES[cluster]!
  const department = pickDepartment(rng, archetype.departments)
  const gender: 'f' | 'm' =
    department === 'women' ? 'f' : department === 'men' ? 'm' : rng.chance(0.5) ? 'f' : 'm'
  const name = pickName(rng, gender)
  const handle = uniqueHandle(name.handleBase, taken)
  const hidden = buildTasteVector({ primaries: archetype.aesthetics, department, rng })
  const hasGift = rng.chance(GIFT_SHARE)
  const giftPick = GIFT_LABELS[rng.int(0, GIFT_LABELS.length - 1)]!
  const giftCluster = (cluster + rng.int(3, CLUSTER_COUNT - 3)) % CLUSTER_COUNT
  const gift = hasGift
    ? buildTasteVector({
        primaries: CLUSTER_ARCHETYPES[giftCluster]!.aesthetics,
        department: giftPick[1],
        rng,
      })
    : null
  const params: PersonaParams = {
    activity: clamp01(rng.normal(0.35, 0.18)),
    remixPropensity: rng.float(0.05, 0.45),
    askPropensity: rng.float(0.05, 0.6),
    shareRadius: rng.int(1, 6),
  }
  params.activity = Math.min(0.95, Math.max(0.05, params.activity))
  const budgetHint = logUniformInt(rng, archetype.budget[0], archetype.budget[1])
  return {
    id: personaId(index),
    handle,
    displayName: name.displayName,
    department,
    sizes: pickSizes(rng, department),
    budgetHint,
    avatarSeed: hashSeed(seed, 'avatar', index) % 100000,
    bio: personaBio(rng, cluster, archetype.aesthetics),
    socialCluster: cluster,
    isPersona: false,
    archetype: archetype.slug,
    primaryAesthetics: topAesthetics(hidden, 3),
    hiddenVector: hidden,
    giftHiddenVector: gift,
    giftDepartment: hasGift ? giftPick[1] : null,
    giftLabel: hasGift ? giftPick[0] : null,
    params,
  }
}

/** `n` personas (default 1,200): the demo personas first, ids `u_000001…`. Pure in (seed, n). */
export function generatePersonas(seed: number, n: number = DEFAULT_PERSONA_COUNT): Persona[] {
  const out: Persona[] = []
  const taken = new Set<string>(DEMO_PERSONAS.map((d) => d.handle))
  const demoCount = Math.min(n, DEMO_PERSONAS.length)
  for (let i = 0; i < demoCount; i++) out.push(demoPersona(DEMO_PERSONAS[i]!, i + 1, seed))
  for (let i = demoCount; i < n; i++) out.push(generatedPersona(i + 1, seed, taken))
  return out
}

export { asciiHandle }
