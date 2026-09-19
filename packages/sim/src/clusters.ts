/**
 * The 24 social clusters of the simulation. Each cluster has a taste archetype (two primary
 * aesthetics from the catalog's 32), a department mix, a budget band and bio fragments.
 * Every one of the 32 aesthetics is a primary of at least one cluster.
 */
import type { ClusterArchetype } from './types'

const c = (
  slug: string,
  label: string,
  aesthetics: readonly [string, string],
  departments: readonly [number, number, number],
  budget: readonly [number, number],
  place: string,
  bios: readonly string[],
): ClusterArchetype => ({ slug, label, aesthetics, departments, budget, place, bios })

export const CLUSTER_ARCHETYPES: readonly ClusterArchetype[] = [
  c(
    'taipei-quiet-lux',
    'Quiet luxury',
    ['quiet-luxury', 'corporate-chic'],
    [0.6, 0.3, 0.1],
    [4000, 18000],
    'Xinyi',
    [
      'Cashmere in neutrals, nothing with a logo. Works in Xinyi, shops like it is a long game.',
      'Believes a good coat is a ten-year decision. Quiet colours, loud tailoring.',
    ],
  ),
  c(
    'ximending-street',
    'Ximending street',
    ['streetwear', 'k-street'],
    [0.35, 0.5, 0.15],
    [1500, 7000],
    'Ximending',
    [
      'Sneaker queue veteran. Oversized everything, photographed against the Ximending crossing.',
      'Street looks first, function second. Trades hoodies with friends like cards.',
    ],
  ),
  c(
    'gorp-hikers',
    'Gorp hikers',
    ['gorpcore', 'techwear'],
    [0.35, 0.5, 0.15],
    [2500, 12000],
    'Yangmingshan',
    [
      'Weekend trails above Taipei, weekday gorpcore. Buys shell jackets like other people buy coffee.',
      'Counts grams, loves buckles. Half the wardrobe is technically rain gear.',
    ],
  ),
  c(
    'k-minimal',
    'Korean minimal',
    ['minimalist', 'scandi'],
    [0.6, 0.3, 0.1],
    [2000, 9000],
    'Da-an',
    [
      'Beige, grey, off-white, repeat. A one-in-one-out closet and a very tidy Instagram.',
      'Minimal lines, soft knits, one perfect trouser. Cafés in Da-an, always in the corner seat.',
    ],
  ),
  c(
    'romantic-garden',
    'Romantic garden',
    ['romantic', 'cottagecore'],
    [0.85, 0.05, 0.1],
    [1500, 7000],
    'Yangmei',
    [
      'Puff sleeves and picnic baskets. Grows herbs on a balcony and dresses like it.',
      'Florals, linen and the occasional bow. Weekend markets, film cameras, pressed flowers.',
    ],
  ),
  c(
    'dark-academia-club',
    'Dark academia',
    ['dark-academia', 'preppy'],
    [0.5, 0.4, 0.1],
    [2500, 10000],
    'Gongguan',
    [
      'Tweed, oxford shirts, second-hand hardcovers. Lives near the university and never really left.',
      'Library light, wool blazers, a fountain pen that leaks. Dresses for autumn all year.',
    ],
  ),
  c(
    'glam-nights',
    'Glam nights',
    ['glam', 'mob-wife'],
    [0.8, 0.1, 0.1],
    [4000, 20000],
    'Xinyi nightlife',
    [
      'Sequins on a Tuesday. Faux fur, big earrings, bigger opinions about heels.',
      'If it does not shine, why buy it. Dinner in Xinyi, after-party anywhere.',
    ],
  ),
  c(
    'boho-travellers',
    'Boho travellers',
    ['boho', 'resort'],
    [0.7, 0.2, 0.1],
    [1800, 8000],
    'Taitung',
    [
      'Six months in Taitung, six months anywhere with a beach. Linen, fringe, sun hats.',
      'Packs one bag and a lot of prints. Surf mornings and night-market dinners.',
    ],
  ),
  c(
    'clean-girl-office',
    'Clean girl office',
    ['clean-girl', 'corporate-chic'],
    [0.85, 0.05, 0.1],
    [2500, 11000],
    'Nangang',
    [
      'Slick bun, gold hoops, trousers that mean business. Nangang software park by day.',
      'Minimal makeup, maximal blazer game. Believes in the perfect white tee.',
    ],
  ),
  c('goth-punk-scene', 'Goth & punk', ['goth', 'punk'], [0.5, 0.4, 0.1], [1500, 8000], 'Shida', [
    'Black on black, silver hardware, a band tee from a show you have not heard of.',
    'Platform boots and a cassette collection. Lives for live houses around Shida.',
  ]),
  c(
    'athleisure-runners',
    'Athleisure runners',
    ['athleisure', 'normcore'],
    [0.45, 0.45, 0.1],
    [1500, 7000],
    'Riverside',
    [
      'Riverside runs at 6 a.m., leggings until noon. Buys sneakers in pairs.',
      'Gym, brunch, gym. The wardrobe is 60 % performance knit and proud of it.',
    ],
  ),
  c(
    'retro-vintage',
    'Retro vintage',
    ['retro-70s', 'western'],
    [0.5, 0.4, 0.1],
    [1500, 8000],
    'Dihua Street',
    [
      'Flares, suede, a corduroy jacket found in Dihua Street. Films everything on 35mm.',
      'Seventies palettes and vintage denim. Would rather thrift than click.',
    ],
  ),
  c('y2k-revival', 'Y2K revival', ['y2k', 'kidcore'], [0.7, 0.2, 0.1], [1200, 6000], 'Zhongshan', [
    'Low-rise, butterfly clips, a phone covered in charms. Zhongshan on weekends.',
    'Baby tees, cargo minis and glitter. Nostalgic for a decade barely remembered.',
  ]),
  c(
    'coastal-surf',
    'Coastal surf',
    ['coastal', 'resort'],
    [0.5, 0.4, 0.1],
    [1500, 7000],
    'Fulong',
    [
      'Salt in the hair, stripes on the shirt. Fulong beach whenever the swell is right.',
      'Linen shirts, slides, a bucket hat that has seen things. Coast over city.',
    ],
  ),
  c(
    'ballet-coquette',
    'Ballet & coquette',
    ['balletcore', 'coquette'],
    [0.9, 0.02, 0.08],
    [1500, 8000],
    'Tianmu',
    [
      'Wrap cardigans, ribbons and ballet flats. Pilates in Tianmu, pastries after.',
      'Soft pinks, bows on everything, a mesh top for every occasion.',
    ],
  ),
  c(
    'workwear-makers',
    'Workwear makers',
    ['workwear', 'city-boy'],
    [0.25, 0.65, 0.1],
    [2000, 9000],
    'Wanhua',
    [
      'Raw denim, chore coats and a workshop in Wanhua. Buys things that get better with wear.',
      'Canvas, selvedge, boots resoled twice. Believes in pockets.',
    ],
  ),
  c(
    'avant-garde-studio',
    'Avant-garde studio',
    ['avant-garde', 'techwear'],
    [0.5, 0.4, 0.1],
    [4000, 20000],
    'Songshan',
    [
      'Asymmetric hems and a studio in a converted factory. Black, but architectural.',
      'Wears the collection before the runway shows it. Straps, drapes, no compromises.',
    ],
  ),
  c(
    'grunge-band',
    'Grunge band',
    ['grunge', 'punk'],
    [0.45, 0.45, 0.1],
    [1200, 6000],
    'Gongguan basements',
    [
      'Flannel, ripped denim, a guitar case as a bag. Plays basement shows on Fridays.',
      'Thrifted plaid and combat boots. Loud music, quiet colours.',
    ],
  ),
  c(
    'city-boy-tokyo',
    'City boy',
    ['city-boy', 'normcore'],
    [0.2, 0.7, 0.1],
    [2500, 11000],
    'Zhongshan North',
    [
      'Wide trousers, mountain parkas, a tote from a bookshop. Tokyo magazines on the shelf.',
      'Clean sneakers and a well-cut shirt. Bicycle commuter with a coffee habit.',
    ],
  ),
  c(
    'preppy-campus',
    'Preppy campus',
    ['preppy', 'coastal'],
    [0.5, 0.4, 0.1],
    [2000, 9000],
    'NTU campus',
    [
      'Polo shirts, loafers, a sweater over the shoulders. Regatta energy without the boat.',
      'Navy and cream, stripes in summer, cable knits in winter.',
    ],
  ),
  c(
    'kidcore-family',
    'Kidcore family',
    ['kidcore', 'athleisure'],
    [0.55, 0.3, 0.15],
    [1000, 5000],
    'Neihu',
    [
      'Bright colours, matching outfits with the kids, a stroller with better suspension than the car.',
      'Playground-tested clothes. Buys in threes: one for me, two for the little ones.',
    ],
  ),
  c(
    'western-riders',
    'Western riders',
    ['western', 'workwear'],
    [0.4, 0.5, 0.1],
    [2000, 9000],
    'Hsinchu',
    [
      'Snap shirts, cowboy boots, a truck that is mostly for the aesthetic.',
      'Denim on denim and a leather belt with a story. Country roads outside Hsinchu.',
    ],
  ),
  c(
    'k-street-idol',
    'K-street idol',
    ['k-street', 'y2k'],
    [0.7, 0.2, 0.1],
    [1500, 8000],
    'Dongqu',
    [
      'Idol-inspired layering, cropped everything, a new hair colour each season.',
      'Dance practice videos and matching crew outfits. Dongqu boutiques on Saturday.',
    ],
  ),
  c(
    'cottage-coastal',
    'Cottage coast',
    ['cottagecore', 'coastal'],
    [0.75, 0.15, 0.1],
    [1500, 7000],
    'Yilan',
    [
      'A rented farmhouse in Yilan, linen dresses, bread that takes two days.',
      'Gingham, straw and sea air. Sends postcards, keeps chickens.',
    ],
  ),
  c(
    'scandi-home',
    'Scandi home',
    ['scandi', 'minimalist'],
    [0.5, 0.4, 0.1],
    [2500, 12000],
    'Tianmu',
    [
      'Wool, oak and daylight. A flat that looks like a furniture catalogue on purpose.',
      'Functional knits and a monochrome palette. Thinks about hygge more than is healthy.',
    ],
  ),
]

export const CLUSTER_COUNT = CLUSTER_ARCHETYPES.length

export function clusterBySlug(slug: string): number {
  return CLUSTER_ARCHETYPES.findIndex((a) => a.slug === slug)
}
