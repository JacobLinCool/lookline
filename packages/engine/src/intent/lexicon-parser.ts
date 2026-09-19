/**
 * Offline lexicon parser (ENGINE_SPEC §1.4): pure and deterministic — byte-identical output for
 * identical `(utterance, ctx)`.
 */
import { CATEGORY_GROUPS, SUBCATEGORIES } from '@lookline/catalog'
import type { CategoryGroup, ColorFamily, Season } from '@lookline/catalog'
import { FLORAL_PATTERNS, SEASONAL_OCCASIONS } from '../constants'
import type { ColorGroupWord } from '../constants'
import { finalize } from './finalize'
import { applyNegation, scanText, type Hit, type ModifierMeta } from './lexicon'
import { extractBudget, wordBudget } from './money'
import { clauseEnd, clauseOf, normalise } from './normalize'
import { classifyNumber, extractSizes, findNumbers, suffixSpan, type NumberToken } from './numbers'
import { detectRecipient, escapeRe } from './recipient'
import { detectReference, resolveReference } from './reference'
import type { IntentAssumptionExt, IntentContextExt, IntentExt, IntentSignals } from './schema'

type Locale = IntentExt['locale']
const t = (locale: Locale, zh: string, en: string): string => (locale === 'en' ? en : zh)

const APPAREL_GROUPS: ReadonlySet<CategoryGroup> = new Set<CategoryGroup>([
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'activewear',
  'swimwear',
  'loungewear',
  'tailoring',
])
const ONE_SIZE_GROUPS: ReadonlySet<CategoryGroup> = new Set<CategoryGroup>([
  'bags',
  'accessories',
  'jewelry',
])
const SUB_GROUP = new Map(SUBCATEGORIES.map((s) => [s.slug, s.group]))

const NEGATION_STOP = new Set([
  'too',
  'very',
  'the',
  'and',
  'or',
  'any',
  'one',
  'ones',
  'this',
  'that',
  'it',
  'them',
  'so',
  'much',
  'really',
  'like',
  'stuff',
  'thing',
  'things',
  'anything',
  'something',
  'else',
  'please',
  'just',
  'want',
  'need',
  'kind',
  'sort',
  'with',
  'for',
  'but',
  'also',
  'again',
  'more',
  'less',
  'bit',
  'little',
  'lot',
  'all',
  'from',
  'into',
])

const VIBE_NOISE_ZH =
  /[的了找要想幫我有一是在和跟也就都很請給買看挑選來個些嗎呢吧啊喔啦哦耶欸誒那這什麼可以想要需要幫忙去玩穿或但他她們]/g
const VIBE_NOISE_EN = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'for',
  'to',
  'of',
  'in',
  'on',
  'with',
  'i',
  'want',
  'need',
  'some',
  'something',
  'like',
  'looking',
  'find',
  'get',
  'me',
  'my',
  'please',
  'it',
  'is',
  'that',
  'this',
  'he',
  'she',
  'they',
  'likes',
  'but',
  'just',
  'be',
  'am',
  'im',
  "i'm",
  'wanna',
  'would',
  'could',
  'can',
  'you',
  'show',
  'help',
  'size',
  'sizes',
  'or',
  'his',
  'her',
  'their',
])

/** Taipei month → season; 9–11 autumn so that mid-September counts as autumn (fixture convention). */
export function seasonOfDate(date: Date): Season {
  const month = new Date(date.getTime() + 8 * 3600 * 1000).getUTCMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

const uniq = <T>(xs: readonly T[]): T[] => Array.from(new Set(xs))

export function parseIntentOffline(utterance: string, ctx: IntentContextExt = {}): IntentExt {
  const { raw, text, locale, bounds } = normalise(utterance, ctx.locale)
  const clauseOfPos = (p: number): number => clauseOf(bounds, p)
  const clauseEndOf = (c: number): number => clauseEnd(bounds, text.length, c)

  // 1. references (pre-consumed spans) and dictionary scan
  const refDet = detectReference(raw, ctx)
  const pre: boolean[] = Array.from({ length: text.length }, () => false)
  for (const [s, e] of refDet.spans) for (let i = s; i < e; i++) pre[i] = true
  const { hits, consumed } = scanText(text, clauseOfPos, pre)
  const scopes = applyNegation(hits, clauseEndOf)
  const extraSpans: Array<[number, number]> = []

  const assumptions: IntentAssumptionExt[] = []
  const explicitSlots = new Set<string>()
  const signals: IntentSignals = {
    aesthetics: {},
    colorWeights: {},
    axisHints: {},
    mustAvoid: [],
    mustHave: [],
  }
  const aestheticW = signals.aesthetics!
  const colorW = signals.colorWeights!
  const axisHints = signals.axisHints!
  const mustAvoid = signals.mustAvoid!
  const mustHave = signals.mustHave!
  const addHint = (axis: string, delta: number): void => {
    axisHints[axis] = (axisHints[axis] ?? 0) + delta
  }
  const avoid = (token: string): void => {
    if (!mustAvoid.includes(token)) mustAvoid.push(token)
  }
  const have = (token: string): void => {
    if (!mustHave.includes(token)) mustHave.push(token)
  }

  const active = hits.filter((h) => !h.negated)
  const by = (section: Hit['section']): Hit[] => active.filter((h) => h.section === section)
  const negatedBy = (section: Hit['section']): Hit[] =>
    hits.filter((h) => h.negated && h.section === section)

  // 2. slots from hits
  const colors = uniq(by('color').map((h) => h.value))
  const colorFamilies: ColorFamily[] = []
  const pushFamily = (f: string | undefined): void => {
    if (f && !colorFamilies.includes(f as ColorFamily)) colorFamilies.push(f as ColorFamily)
  }
  for (const h of by('color')) pushFamily((h.meta as { family?: string }).family)
  for (const h of by('colorFamily')) pushFamily(h.value)
  for (const h of by('extraColor')) pushFamily(h.value)
  for (const h of by('colorGroup')) {
    const w = h.meta as ColorGroupWord
    if (w.explicit) {
      for (const f of Object.keys(w.weights)) pushFamily(f)
    } else {
      for (const [f, weight] of Object.entries(w.weights))
        colorW[f] = Math.max(colorW[f] ?? 0, weight)
    }
    if (w.boldness) addHint('boldness', w.boldness)
  }
  for (const h of negatedBy('color'))
    avoid(`color:${(h.meta as { family?: string }).family ?? h.value}`)
  for (const h of negatedBy('colorFamily')) avoid(`color:${h.value}`)
  for (const h of negatedBy('extraColor')) avoid(`color:${h.value}`)
  for (const h of negatedBy('colorGroup')) {
    const w = h.meta as ColorGroupWord
    for (const [f, weight] of Object.entries(w.weights)) if (weight >= 0.8) avoid(`color:${f}`)
  }
  if (colors.length > 0 || colorFamilies.length > 0) {
    explicitSlots.add('colorFamilies')
    explicitSlots.add('colors')
  }

  const subcategories = uniq(by('subcategory').map((h) => h.value))
  const categoryGroups: CategoryGroup[] = []
  const pushGroup = (g: string | undefined): void => {
    if (
      g &&
      CATEGORY_GROUPS.includes(g as CategoryGroup) &&
      !categoryGroups.includes(g as CategoryGroup)
    ) {
      categoryGroups.push(g as CategoryGroup)
    }
  }
  for (const h of by('group')) pushGroup(h.value)
  for (const s of subcategories) pushGroup(SUB_GROUP.get(s))
  const excludeCategoryGroups: CategoryGroup[] = []
  for (const h of negatedBy('subcategory')) avoid(`subcategory:${h.value}`)
  for (const h of negatedBy('group')) {
    avoid(`group:${h.value}`)
    if (!excludeCategoryGroups.includes(h.value as CategoryGroup))
      excludeCategoryGroups.push(h.value as CategoryGroup)
  }
  if (subcategories.length > 0) explicitSlots.add('subcategories')
  if (categoryGroups.length > 0) explicitSlots.add('categoryGroups')

  const materials = uniq(by('material').map((h) => h.value))
  const allergyClauses = new Set(by('allergy').map((h) => h.clause))
  for (const h of negatedBy('material')) avoid(`material:${h.value}`)
  for (const h of by('material')) if (allergyClauses.has(h.clause)) avoid(`material:${h.value}`)
  const materialsKept = materials.filter((m) => !mustAvoid.includes(`material:${m}`))
  if (materialsKept.length > 0) explicitSlots.add('materials')

  const patterns = uniq(by('pattern').map((h) => h.value))
  for (const h of negatedBy('pattern')) avoid(`pattern:${h.value}`)
  for (const h of by('floral')) {
    void h
    colorW['multi-metallic'] = Math.max(colorW['multi-metallic'] ?? 0, 0.6)
  }
  for (const h of negatedBy('floral')) {
    void h
    for (const p of FLORAL_PATTERNS) avoid(`pattern:${p}`)
    avoid('color:multi-metallic')
  }
  if (patterns.length > 0) explicitSlots.add('patterns')

  let fits = uniq(by('fit').map((h) => h.value))
  if (fits.length > 0) explicitSlots.add('fits')

  for (const h of by('aesthetic'))
    aestheticW[h.value] = Math.max(aestheticW[h.value] ?? 0, h.weight ?? 1)
  for (const h of negatedBy('aesthetic')) avoid(`aesthetic:${h.value}`)
  if (Object.keys(aestheticW).length > 0) explicitSlots.add('aesthetics')

  // modifiers
  let practical = false
  const groupsPresent = new Set<CategoryGroup>(categoryGroups)
  for (const h of hits.filter((x) => x.section === 'modifier')) {
    const meta = h.meta as ModifierMeta
    const flip = h.negated && !meta.degree
    for (const [axis, delta] of Object.entries(meta.axes ?? {}))
      addHint(axis, flip ? -0.7 * (delta ?? 0) : (delta ?? 0))
    if (!flip && meta.fits && fits.length === 0) fits = [...meta.fits]
    if (meta.practical) practical = true
    if (meta.subAvoid) {
      for (const [g, subs] of Object.entries(meta.subAvoid)) {
        if (groupsPresent.has(g as CategoryGroup))
          for (const s of subs ?? []) avoid(`subcategory:${s}`)
      }
    }
  }
  // A sleeve is not a fit: the catalogue keeps it in `articles.sleeve`, while `intent.fits` is
  // matched against `articles.fit`. It travels as a constraint token, so "要長袖" reaches
  // retrieval as a requirement rather than as a preference the ranker may trade away.
  for (const h of by('sleeve')) have(`sleeve:${h.value}`)
  for (const h of negatedBy('sleeve')) avoid(`sleeve:${h.value}`)

  for (const h of hits.filter((x) => x.section === 'attribute')) {
    const polarity = (h.meta as { polarity: 'have' | 'avoid' }).polarity
    if (polarity === 'avoid' || h.negated) avoid(`attribute:${h.value}`)
    else have(`attribute:${h.value}`)
  }
  if (practical) have('flag:practical')
  // follow-up phrases only consume their span here; `mergeIntent` applies their effects

  // 3. occasion, season words
  const occasionHits = by('occasion')
  const occasion = occasionHits[0]?.value
  if (occasion) {
    explicitSlots.add('occasion')
    const second = occasionHits.find((h) => h.value !== occasion)
    if (second) {
      assumptions.push({
        slot: 'occasion',
        value: occasion,
        confidence: 0.6,
        reason: t(locale, '提到兩個場合，先用第一個', 'Two occasions mentioned; using the first'),
        source: 'utterance',
      })
    }
  }

  // 4. numbers on the masked text
  const masked = Array.from(text, (ch, i) => (consumed[i] ? ' ' : ch)).join('')
  const numbers = findNumbers(masked)
  const roles = new Map<NumberToken, ReturnType<typeof classifyNumber>>()
  for (const n of numbers) roles.set(n, n.bare ? 'plain' : classifyNumber(masked, n))
  let ageHint: number | undefined
  for (const n of numbers) {
    if (roles.get(n) === 'age') {
      ageHint = n.value
      extraSpans.push([n.start, suffixSpan(masked, n)])
    }
  }

  // mode words (needed for budget defaults)
  const modeWord =
    by('mode').length > 0 ||
    numbers.some(
      (n) => roles.get(n) === 'quantity' && masked.slice(n.end).trimStart().startsWith('套'),
    )
  const browseWord = by('browse').length > 0

  // references
  const ref = resolveReference(refDet, ctx, locale)
  assumptions.push(...ref.assumptions)

  // recipient & department (before mode: gifts stay `single` even with an occasion)
  const rec = detectRecipient({ raw, hits, locale, ctx, ageHint, referenceSpans: refDet.spans })
  assumptions.push(...rec.assumptions)
  for (const s of rec.explicitSlots) explicitSlots.add(s)

  const hasCategory = categoryGroups.length > 0 || subcategories.length > 0
  const hasContent = hasCategory || occasion !== undefined || Object.keys(aestheticW).length > 0
  let mode: IntentExt['mode'] = 'single'
  let modeSource: IntentSignals['modeSource'] = 'default'
  if (browseWord && !hasContent) {
    mode = 'browse'
    modeSource = 'browse'
    assumptions.push({
      slot: 'mode',
      value: 'browse',
      confidence: 0.5,
      reason: t(locale, '沒有具體需求，先隨意瀏覽', 'Nothing specific asked; browsing'),
      source: 'utterance',
    })
  } else if (modeWord) {
    mode = 'outfit'
    modeSource = 'word'
    explicitSlots.add('mode')
  } else if (occasion && !hasCategory && rec.recipient.kind !== 'other') {
    mode = 'outfit'
    modeSource = 'occasion'
    assumptions.push({
      slot: 'mode',
      value: 'outfit',
      confidence: 0.7,
      reason: t(locale, '有場合但沒指定品類，配整套', 'Occasion without a category → full outfit'),
      source: 'utterance',
    })
  } else if (ref.referenceRole === 'style-source' && ref.referenceLookId) {
    mode = 'outfit'
    modeSource = 'reference'
    assumptions.push({
      slot: 'mode',
      value: 'outfit',
      confidence: 0.7,
      reason: t(locale, '參考別人的 Look，配整套', 'Styled after a reference Look → full outfit'),
      source: 'utterance',
    })
  }

  // 5. budget
  const moneyNumbers = numbers.filter((n) => roles.get(n) === 'plain' && !n.bare)
  const extraction = extractBudget({ text, raw, numbers: moneyNumbers, hits, locale, mode })
  let budget = extraction?.budget
  const usedNumbers = new Set<NumberToken>(extraction?.numbers ?? [])
  if (extraction) {
    assumptions.push(...extraction.assumptions)
    extraSpans.push(...extraction.spans)
    explicitSlots.add('budget')
  } else {
    const cheap = by('cheap')[0]
    const luxury = by('luxury')[0]
    const kind = cheap ? 'cheap' : luxury ? 'luxury' : undefined
    if (kind) {
      const wb = wordBudget(kind, mode)
      budget = wb.budget
      signals.priceTier = wb.priceTier
      assumptions.push({
        slot: 'budget',
        value: kind === 'cheap' ? `max ${wb.budget.max}` : `min ${wb.budget.min}`,
        confidence: 0.5,
        reason: t(
          locale,
          `「${raw.slice((cheap ?? luxury)!.start, (cheap ?? luxury)!.end)}」→ 預設${kind === 'cheap' ? '上限' : '下限'}`,
          `"${raw.slice((cheap ?? luxury)!.start, (cheap ?? luxury)!.end)}" → default ${kind === 'cheap' ? 'ceiling' : 'floor'}`,
        ),
        source: 'default',
      })
    }
  }
  if (by('flexible').length > 0) {
    budget = { ...(budget ?? { currency: 'TWD' }), strictness: 'flexible' }
  }
  if (budget && by('scope').length > 0) budget.scope = 'per_item'

  // 6. sizes, quantity
  const remaining = numbers.filter((n) => !usedNumbers.has(n) && roles.get(n) !== 'age')
  const footwear = categoryGroups.includes('footwear') || subcategories.includes('slipper')
  const bottoms = categoryGroups.includes('bottoms') || categoryGroups.includes('tailoring')
  const onlyOneSize =
    categoryGroups.length > 0 && categoryGroups.every((g) => ONE_SIZE_GROUPS.has(g))
  const onlyFootwear = categoryGroups.length > 0 && categoryGroups.every((g) => g === 'footwear')
  const alpha =
    mode === 'outfit' ||
    categoryGroups.some((g) => APPAREL_GROUPS.has(g)) ||
    (!onlyOneSize && !onlyFootwear)
  const sizeMatches = extractSizes(masked, remaining, { footwear, bottoms, alpha })
  const sizes: Record<string, string> = {}
  for (const s of sizeMatches) {
    sizes[s.system] = s.value
    extraSpans.push([s.start, s.end])
    for (const n of remaining) if (n.start === s.start) usedNumbers.add(n)
  }
  if (Object.keys(sizes).length > 0) explicitSlots.add('sizes')

  let quantity: number | undefined
  const quantityWord = by('quantityWord')[0]
  if (quantityWord) quantity = Number(quantityWord.value)
  for (const n of remaining) {
    if (usedNumbers.has(n)) continue
    const role = roles.get(n)
    if (role === 'quantity') {
      const approx =
        (n.kind === 'cjk' && /^[一二兩两三四五六七八九]{2}$/.test(n.text)) ||
        /\bor\s*$/.test(masked.slice(Math.max(0, n.start - 4), n.start))
      quantity = n.value
      extraSpans.push([n.start, suffixSpan(masked, n)])
      usedNumbers.add(n)
      if (approx) {
        assumptions.push({
          slot: 'quantity',
          value: String(n.value),
          confidence: 0.7,
          reason: t(
            locale,
            '數量是範圍，取上限',
            'Quantity given as a range; using the upper bound',
          ),
          source: 'utterance',
        })
      }
      break
    }
    if (
      role === 'plain' &&
      n.kind === 'arabic' &&
      Number.isInteger(n.value) &&
      n.value >= 1 &&
      n.value <= 8
    ) {
      const followedByCategory = hits.some(
        (h) =>
          (h.section === 'subcategory' || h.section === 'group') &&
          h.start >= n.end &&
          h.start <= n.end + 24,
      )
      if (followedByCategory && quantity === undefined) {
        quantity = n.value
        extraSpans.push([n.start, n.end])
        usedNumbers.add(n)
        break
      }
    }
  }
  if (quantity !== undefined) explicitSlots.add('quantity')

  // 8. season
  let season: Season | undefined
  let seasonSource: IntentSignals['seasonSource']
  const seasonHit = by('season')[0]
  const tempHit = by('tempWord')[0]
  const dateHit = by('dateWord')[0]
  if (seasonHit) {
    season = seasonHit.value as Season
    seasonSource = 'utterance'
    explicitSlots.add('season')
  } else if (tempHit) {
    season = tempHit.value as Season
    seasonSource = 'utterance'
    assumptions.push({
      slot: 'season',
      value: season,
      confidence: 0.7,
      reason: t(
        locale,
        `「${raw.slice(tempHit.start, tempHit.end)}」→ ${season}`,
        `"${raw.slice(tempHit.start, tempHit.end)}" → ${season}`,
      ),
      source: 'utterance',
    })
  } else if (ctx.now && (dateHit || (occasion && SEASONAL_OCCASIONS.includes(occasion)))) {
    const days = dateHit ? Number(dateHit.value) : 0
    const when = new Date(ctx.now.getTime() + days * 86400 * 1000)
    season = seasonOfDate(when)
    seasonSource = 'context'
    const iso = when.toISOString().slice(0, 10)
    assumptions.push({
      slot: 'season',
      value: season,
      confidence: 0.7,
      reason: dateHit
        ? t(
            locale,
            `「${raw.slice(dateHit.start, dateHit.end)}」→ ${iso} → ${season}`,
            `"${raw.slice(dateHit.start, dateHit.end)}" → ${iso} → ${season}`,
          )
        : t(locale, `依今天的日期（${iso}）`, `From today's date (${iso})`),
      source: 'context',
    })
  }

  // 9. brands and leftover tokens in negation scope
  const brandTokens: Array<{ slug: string; negated: boolean; start: number; end: number }> = []
  for (const b of ctx.brands ?? []) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRe(b.name.toLowerCase())}(?![a-z0-9])`, 'g')
    for (const m of masked.matchAll(re)) {
      const start = m.index ?? 0
      const end = start + m[0].length
      const negated = scopes.some((s) => start >= s.start && end <= s.end)
      brandTokens.push({ slug: b.slug, negated, start, end })
      extraSpans.push([start, end])
    }
  }
  for (const b of brandTokens) (b.negated ? avoid : have)(`brand:${b.slug}`)
  for (const scope of scopes) {
    const segment = masked.slice(scope.start, scope.end)
    for (const m of segment.matchAll(/[a-z][a-z0-9'-]{2,}/g)) {
      const token = m[0]
      const start = scope.start + (m.index ?? 0)
      if (NEGATION_STOP.has(token)) continue
      if (brandTokens.some((b) => b.start === start)) continue
      avoid(`text:${token}`)
      extraSpans.push([start, start + token.length])
      assumptions.push({
        slot: 'mustAvoid',
        value: `text:${token}`,
        confidence: 0.5,
        reason: t(
          locale,
          `「${raw.slice(start, start + token.length)}」不在型錄中，以文字排除`,
          `"${raw.slice(start, start + token.length)}" is not a catalog term; excluded by text`,
        ),
        source: 'utterance',
      })
    }
  }

  // 10. vibe = utterance minus consumed spans (browse keeps the whole sentence)
  const gone = consumed.slice()
  for (const [s, e] of extraSpans) for (let i = s; i < e; i++) gone[i] = true
  let vibe: string | undefined
  if (mode === 'browse') vibe = raw
  else {
    const kept = Array.from(raw, (ch, i) => (gone[i] ? ' ' : ch)).join('')
    const cleaned = kept
      .replace(VIBE_NOISE_ZH, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0 && !VIBE_NOISE_EN.has(w.toLowerCase().replace(/[^a-z']/g, '')))
      .join(' ')
      .replace(/[，,。.;；、！!？?:：()（）"'「」]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    vibe = cleaned.length > 0 ? cleaned : undefined
  }

  signals.explicitSlots = Array.from(explicitSlots)
  signals.modeSource = modeSource
  if (seasonSource) signals.seasonSource = seasonSource
  if (ageHint !== undefined) signals.ageHint = ageHint

  const draft: IntentExt = {
    utterance: raw.slice(0, 500),
    locale,
    mode,
    department: rec.department,
    categoryGroups: categoryGroups.slice(0, 6),
    subcategories: subcategories.slice(0, 6),
    colors,
    colorFamilies: colorFamilies.slice(0, 6),
    aesthetics: [],
    materials: materialsKept.slice(0, 4),
    patterns: patterns.slice(0, 4),
    fits: fits.slice(0, 2),
    occasion,
    season,
    budget,
    recipient: rec.recipient,
    sizes: Object.keys(sizes).length > 0 ? sizes : undefined,
    mustHave: [],
    mustAvoid: [],
    vibe,
    referenceLookId: ref.referenceLookId,
    referenceHandle: ref.referenceHandle,
    referenceRole: ref.referenceRole,
    assumptions,
    clarifications: ref.clarifications,
    confidence: 0,
    quantity,
    excludeCategoryGroups: excludeCategoryGroups.length > 0 ? excludeCategoryGroups : undefined,
    parser: 'lexicon',
    signals,
  }
  for (const key of Object.keys(draft) as Array<keyof IntentExt>) {
    if (draft[key] === undefined) delete draft[key]
  }
  return finalize(draft, ctx)
}
