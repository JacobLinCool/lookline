/**
 * Slot templates per occasion × department (ENGINE_SPEC §3.1): mutually exclusive core plans
 * A (dresses), B (tops + bottoms), C (tailoring + shirt + bottoms), required extra slots and
 * seasonal optional slots, with `slotShareMax` budget shares and soft subcategory hints.
 */
import type { CategoryGroup, Season } from '@lookline/catalog'
import type { Department } from '@lookline/db'
import { templateForOccasion } from '../aesthetics'
import type { TemplateKey } from '../aesthetics'
import type { EngineIntent } from '../intent-view'

export type SlotRole =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outer'
  | 'shoes'
  | 'bag'
  | 'accessory'
  | 'jewelry'
  | 'activewear'
  | 'swimwear'
  | 'tailoring'

export interface SlotSpec {
  /** Stable key used to share retrieval between plans (`groups|subcategories`). */
  key: string
  role: SlotRole
  groups: CategoryGroup[]
  /** Soft subcategory hints (retrieval filter first; relaxation step 1 drops them). */
  subcategories: string[] | null
  required: boolean
  /** Core slots come first in the beam order and define the plan identity. */
  core: boolean
  /** Keep the subcategory hints through the relaxation ladder (formal outerwear must stay formal). */
  strictHints?: boolean
}

export interface Plan {
  key: string
  template: TemplateKey
  slots: SlotSpec[]
}

/**
 * Garments an occasion asks for, by group — the hard half of "what do I wear to X".
 *
 * A cosine over the style vector cannot carry it: the aesthetic block is 32 of 64 dimensions and
 * `style_similarity` is one factor of eight, so 「爬山」 (gorpcore .9) still answered with denim
 * trousers, a chiffon blouse and flip-flops. This is the same instrument the `sport` and `beach`
 * slot templates already used — a retrieval hint, not a new scoring rule — and it costs nothing:
 * it narrows the SQL prefilter that runs anyway, and the relaxation ladder drops it when the
 * catalogue is too thin to answer.
 *
 * Only the occasions whose clothes are a matter of function are listed. Everywhere else the
 * vector is the better judge and a missing row leaves retrieval exactly as it was. A group the
 * row says nothing about (a bag on a hike) is not narrowed either — see `occasionGarments`.
 */
export const OCCASION_GARMENTS: Readonly<
  Partial<Record<TemplateKey, Readonly<Partial<Record<CategoryGroup, readonly string[]>>>>>
> = {
  outdoor: {
    tops: ['performance-tee', 'tee', 'polo-shirt', 'hoodie'],
    bottoms: ['cargo-pants', 'joggers', 'training-tights', 'running-shorts'],
    activewear: ['performance-tee', 'training-tights', 'running-shorts', 'joggers'],
    outerwear: ['windbreaker', 'fleece-jacket', 'puffer-jacket', 'parka'],
    footwear: ['hiking-boot', 'combat-boot', 'sneaker', 'running-shoe'],
  },
  sport: {
    tops: ['performance-tee', 'sports-bra', 'tee'],
    bottoms: ['training-tights', 'running-shorts', 'bike-shorts', 'joggers'],
    activewear: ['performance-tee', 'sports-bra', 'training-tights', 'running-shorts'],
    outerwear: ['track-jacket', 'windbreaker', 'fleece-jacket'],
    footwear: ['sneaker', 'running-shoe'],
  },
  beach: {
    footwear: ['flat-sandal', 'slide'],
  },
}

/**
 * Retrieval hints for a request that runs no slot template (`mode: single`, `browse`): the
 * occasion's garments for the groups asked for, or every group it names when none were.
 * `null` — no narrowing — whenever the occasion is silent about any one of them.
 */
export function occasionGarments(
  occasion: string | null | undefined,
  groups: readonly CategoryGroup[],
): string[] | null {
  const row = occasion ? OCCASION_GARMENTS[templateForOccasion(occasion)] : undefined
  if (!row) return null
  const wanted = groups.length > 0 ? groups : (Object.keys(row) as CategoryGroup[])
  const out: string[] = []
  for (const g of wanted) {
    const hints = row[g]
    if (!hints) return null
    for (const s of hints) if (!out.includes(s)) out.push(s)
  }
  return out.length > 0 ? out : null
}

export const SLOT_SHARE_MAX: Readonly<Record<CategoryGroup, number>> = {
  dresses: 0.55,
  tailoring: 0.5,
  outerwear: 0.5,
  footwear: 0.4,
  tops: 0.3,
  bottoms: 0.35,
  bags: 0.35,
  jewelry: 0.25,
  accessories: 0.15,
  activewear: 0.3,
  swimwear: 0.35,
  loungewear: 0.3,
}

export const OPTIONAL_SLOT_MIN_PRICE = 300

export function slotShareMax(groups: readonly CategoryGroup[]): number {
  let max = 0
  for (const g of groups) max = Math.max(max, SLOT_SHARE_MAX[g] ?? 0.3)
  return max || 0.3
}

const slot = (
  role: SlotRole,
  groups: CategoryGroup[],
  opts: {
    subcategories?: string[]
    required?: boolean
    core?: boolean
    strictHints?: boolean
  } = {},
): SlotSpec => ({
  key: `${groups.join('+')}|${(opts.subcategories ?? []).join('+')}${opts.strictHints ? '|strict' : ''}`,
  role,
  groups,
  subcategories: opts.subcategories && opts.subcategories.length > 0 ? opts.subcategories : null,
  required: opts.required ?? true,
  core: opts.core ?? false,
  ...(opts.strictHints ? { strictHints: true } : {}),
})

type CorePlan = 'A' | 'B' | 'C'

interface TemplateDef {
  women: CorePlan[]
  men: CorePlan[]
  required: SlotSpec[]
  /** Optional slots in table order; `seasons` restricts when the slot is offered. */
  optional: Array<{ spec: SlotSpec; seasons?: Season[]; requiredIn?: Season[] }>
}

const AW: Season[] = ['autumn', 'winter']

/** §3.1 rows. */
export const SLOT_TEMPLATES: Readonly<Record<TemplateKey, TemplateDef>> = {
  formal: {
    women: ['A', 'C', 'B'],
    men: ['C', 'B'],
    required: [
      slot('shoes', ['footwear'], {
        subcategories: ['pump', 'heeled-sandal', 'derby', 'loafer', 'chelsea-boot'],
      }),
    ],
    optional: [
      { spec: slot('bag', ['bags'], { required: false }) },
      { spec: slot('jewelry', ['jewelry'], { required: false }) },
      {
        spec: slot('outer', ['outerwear'], {
          required: false,
          subcategories: ['wool-coat', 'trench-coat'],
          strictHints: true,
        }),
        requiredIn: AW,
      },
    ],
  },
  work: {
    women: ['B', 'C', 'A'],
    men: ['B', 'C'],
    required: [
      slot('shoes', ['footwear'], {
        subcategories: ['loafer', 'derby', 'pump', 'ballet-flat', 'chelsea-boot', 'ankle-boot'],
      }),
    ],
    optional: [
      {
        spec: slot('outer', ['outerwear'], {
          required: false,
          subcategories: ['wool-coat', 'trench-coat', 'overshirt'],
        }),
        seasons: AW,
      },
      { spec: slot('bag', ['bags'], { required: false }) },
      { spec: slot('accessory', ['accessories'], { required: false }) },
    ],
  },
  'smart-casual': {
    women: ['B', 'A'],
    men: ['B'],
    required: [slot('shoes', ['footwear'])],
    optional: [
      { spec: slot('outer', ['outerwear'], { required: false }), seasons: AW },
      { spec: slot('bag', ['bags'], { required: false }) },
      { spec: slot('jewelry', ['jewelry'], { required: false }) },
      { spec: slot('accessory', ['accessories'], { required: false }) },
    ],
  },
  party: {
    women: ['A', 'B'],
    men: ['B', 'C'],
    required: [slot('shoes', ['footwear'])],
    optional: [
      { spec: slot('bag', ['bags'], { required: false }) },
      { spec: slot('jewelry', ['jewelry'], { required: false }) },
      { spec: slot('outer', ['outerwear'], { required: false }), seasons: ['winter'] },
    ],
  },
  festival: {
    women: ['B', 'A'],
    men: ['B'],
    required: [slot('shoes', ['footwear']), slot('accessory', ['accessories'])],
    optional: [
      { spec: slot('bag', ['bags'], { required: false }) },
      { spec: slot('jewelry', ['jewelry'], { required: false }) },
      { spec: slot('outer', ['outerwear'], { required: false }), seasons: AW },
    ],
  },
  travel: {
    women: ['B'],
    men: ['B'],
    required: [
      slot('outer', ['outerwear']),
      slot('shoes', ['footwear']),
      slot('bag', ['bags'], { subcategories: ['backpack', 'crossbody'] }),
    ],
    optional: [{ spec: slot('accessory', ['accessories'], { required: false }) }],
  },
  casual: {
    women: ['B', 'A'],
    men: ['B'],
    required: [slot('shoes', ['footwear'])],
    optional: [
      { spec: slot('outer', ['outerwear'], { required: false }), seasons: AW },
      { spec: slot('bag', ['bags'], { required: false }) },
      { spec: slot('accessory', ['accessories'], { required: false }) },
    ],
  },
  sport: {
    women: ['B'],
    men: ['B'],
    required: [slot('shoes', ['footwear'], { subcategories: ['sneaker', 'running-shoe'] })],
    optional: [
      {
        spec: slot('outer', ['outerwear', 'activewear'], {
          required: false,
          subcategories: ['track-jacket', 'windbreaker', 'fleece-jacket'],
        }),
      },
      { spec: slot('bag', ['bags'], { required: false }) },
      { spec: slot('accessory', ['accessories'], { required: false }) },
    ],
  },
  outdoor: {
    women: ['B'],
    men: ['B'],
    required: [
      slot('outer', ['outerwear']),
      slot('shoes', ['footwear'], {
        subcategories: ['hiking-boot', 'combat-boot', 'sneaker', 'running-shoe'],
      }),
    ],
    optional: [
      { spec: slot('accessory', ['accessories'], { required: false }) },
      { spec: slot('bag', ['bags'], { required: false }) },
    ],
  },
  beach: {
    women: ['B'],
    men: ['B'],
    required: [slot('shoes', ['footwear'], { subcategories: ['flat-sandal', 'slide'] })],
    optional: [
      { spec: slot('accessory', ['accessories'], { required: false }) },
      { spec: slot('bag', ['bags'], { required: false }) },
    ],
  },
}

/** Core slots of a plan letter for a template/department. */
export function coreSlots(
  plan: CorePlan,
  template: TemplateKey,
  department: Department,
): SlotSpec[] {
  const men = department === 'men'
  if (template === 'sport') {
    return [
      slot('activewear', ['activewear'], {
        core: true,
        subcategories: ['sports-bra', 'performance-tee'],
      }),
      slot('bottom', ['activewear'], {
        core: true,
        subcategories: ['training-tights', 'running-shorts', 'bike-shorts', 'joggers'],
      }),
    ]
  }
  if (template === 'outdoor') {
    return [
      slot('top', ['tops', 'activewear'], {
        core: true,
        subcategories: [...OCCASION_GARMENTS.outdoor!.tops!],
      }),
      slot('bottom', ['bottoms', 'activewear'], {
        core: true,
        subcategories: [...OCCASION_GARMENTS.outdoor!.bottoms!],
      }),
    ]
  }
  if (template === 'beach') {
    return [
      slot('swimwear', ['swimwear'], {
        core: true,
        subcategories: men
          ? ['swim-trunks', 'rash-guard']
          : ['bikini-top', 'one-piece', 'bikini-bottom'],
      }),
      men
        ? slot('top', ['tops'], { core: true })
        : slot('top', ['tops', 'dresses'], {
            core: true,
            subcategories: [
              'linen-shirt',
              'cover-up',
              'maxi-dress',
              'tee',
              'tank-top',
              'crop-top',
              'camisole',
            ],
          }),
    ]
  }
  switch (plan) {
    case 'A':
      return [slot('dress', ['dresses'], { core: true })]
    case 'B':
      return [slot('top', ['tops'], { core: true }), slot('bottom', ['bottoms'], { core: true })]
    case 'C':
      return [
        slot('tailoring', ['tailoring'], {
          core: true,
          subcategories: ['blazer', 'two-piece-suit'],
        }),
        slot('top', ['tops', 'tailoring'], {
          core: true,
          subcategories: ['button-down-shirt', 'dress-shirt', 'blouse'],
        }),
        slot('bottom', ['bottoms', 'tailoring'], {
          core: true,
          subcategories: [
            'tailored-trousers',
            'pencil-skirt',
            'wide-leg-trousers',
            'chinos',
            'midi-skirt',
          ],
        }),
      ]
  }
}

export interface PlanOptions {
  department: Department
  season?: Season | null
  excludeGroups?: readonly CategoryGroup[]
  /** Caps the number of slots (required first, optional in table order). */
  quantity?: number | null
}

/** Plans for an intent: template × department, exclusions and quantity applied. */
export function planFor(intent: EngineIntent, opts: PlanOptions): Plan[] {
  const template = templateForOccasion(intent.occasion)
  return plansForTemplate(template, {
    ...opts,
    excludeGroups: [...(opts.excludeGroups ?? []), ...(intent.excludeCategoryGroups ?? [])],
    quantity: opts.quantity ?? intent.quantity ?? null,
  })
}

export function plansForTemplate(template: TemplateKey, opts: PlanOptions): Plan[] {
  const def = SLOT_TEMPLATES[template]
  const dept = opts.department
  const kids = dept === 'kids'
  let letters: CorePlan[] = dept === 'men' || dept === 'unisex' ? def.men : def.women
  if (kids) letters = ['B']
  const excluded = new Set<CategoryGroup>(opts.excludeGroups ?? [])
  if (kids) {
    excluded.add('jewelry')
    excluded.add('tailoring')
  }
  const season = opts.season ?? null
  const keep = (s: SlotSpec): SlotSpec | null => {
    const groups = s.groups.filter((g) => !excluded.has(g))
    if (groups.length === 0) return null
    return groups.length === s.groups.length
      ? s
      : { ...s, groups, key: `${groups.join('+')}|${(s.subcategories ?? []).join('+')}` }
  }
  const plans: Plan[] = []
  for (const letter of letters) {
    const core: SlotSpec[] = []
    let valid = true
    for (const s of coreSlots(letter, template, dept)) {
      const k = keep(s)
      if (!k) {
        valid = false
        break
      }
      core.push(k)
    }
    if (!valid) continue
    const required: SlotSpec[] = []
    for (const s of def.required) {
      const k = keep(s)
      if (k) required.push(k)
    }
    const optional: SlotSpec[] = []
    for (const o of def.optional) {
      const k = keep(o.spec)
      if (!k) continue
      if (o.requiredIn && season && o.requiredIn.includes(season)) {
        required.push({ ...k, required: true })
        continue
      }
      if (o.seasons && season && !o.seasons.includes(season)) continue
      optional.push({ ...k, required: false })
    }
    let slots = [...core, ...required, ...optional]
    if (opts.quantity && opts.quantity > 0) {
      const quantity = Math.max(opts.quantity, core.length + required.length)
      slots = slots.slice(0, quantity)
    }
    plans.push({ key: `${template}:${letter}`, template, slots })
  }
  // Dedupe identical plans (e.g. men templates where B appears once).
  const seen = new Set<string>()
  return plans.filter((p) => {
    const sig = p.slots.map((s) => s.key).join(';')
    if (seen.has(sig)) return false
    seen.add(sig)
    return true
  })
}

/** Beam order of §3.3: core slots first, then footwear, outerwear, bags, accessories, jewelry. */
const ROLE_ORDER: readonly SlotRole[] = [
  'dress',
  'tailoring',
  'top',
  'bottom',
  'activewear',
  'swimwear',
  'shoes',
  'outer',
  'bag',
  'accessory',
  'jewelry',
]

export function orderSlots(slots: readonly SlotSpec[]): SlotSpec[] {
  return slots.toSorted((a, b) => {
    if (a.core !== b.core) return a.core ? -1 : 1
    return ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  })
}

/** Slot role for a product group when pinned (completeOutfit). */
export function roleForGroup(group: string): SlotRole {
  switch (group) {
    case 'tops':
      return 'top'
    case 'bottoms':
      return 'bottom'
    case 'dresses':
      return 'dress'
    case 'outerwear':
      return 'outer'
    case 'footwear':
      return 'shoes'
    case 'bags':
      return 'bag'
    case 'accessories':
      return 'accessory'
    case 'jewelry':
      return 'jewelry'
    case 'activewear':
      return 'activewear'
    case 'swimwear':
      return 'swimwear'
    case 'tailoring':
      return 'tailoring'
    default:
      return 'accessory'
  }
}
