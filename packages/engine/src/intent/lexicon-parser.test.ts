import { describe, expect, it } from 'vitest'
import { IntentSchema } from './schema'
import { parseIntentOffline } from './lexicon-parser'
import { mergeIntent } from './dialogue'
import { FIXTURE_CTX, withUser } from './fixtures'

const slots = (r: ReturnType<typeof parseIntentOffline>) => r.assumptions.map((a) => a.slot)
const clar = (r: ReturnType<typeof parseIntentOffline>) =>
  r.clarifications.map((c) => `${c.slot}[${c.blocking ? 'yes' : 'no'}]`)

const expectAxes = (r: ReturnType<typeof parseIntentOffline>, axes: Record<string, number>) => {
  for (const [k, v] of Object.entries(axes)) expect(r.axisTargets?.[k], k).toBeCloseTo(v, 3)
}

describe('§1.10 fixtures (offline parser, catalog slugs)', () => {
  it('F1 下週要去朋友婚禮，預算五千，不想太正式', () => {
    const r = parseIntentOffline('下週要去朋友婚禮，預算五千，不想太正式', FIXTURE_CTX)
    expect(r.locale).toBe('zh-TW')
    expect(r.mode).toBe('outfit')
    expect(r.occasion).toBe('wedding-guest')
    expect(r.season).toBe('autumn')
    expect(r.budget).toMatchObject({
      max: 5000,
      strictness: 'soft',
      scope: 'total',
      original: '預算五千',
    })
    expect(r.recipient.kind).toBe('self')
    expect(r.department).toBe('women')
    expect(r.aesthetics).toEqual(['quiet-luxury', 'romantic', 'glam', 'corporate-chic'])
    expect(r.colorWeights).toEqual({ neutral: 0.35, pink: 0.21, blue: 0.21 })
    expect(r.mustAvoid).toEqual(['color:white'])
    expectAxes(r, { formality: 0.575, coverage: 0.6, boldness: 0.45, warmth: 0.6 })
    expect(r.quantity).toBeUndefined()
    for (const s of [
      'season',
      'aesthetics',
      'mustAvoid',
      'axisTargets.formality',
      'budget.strictness',
      'mode',
    ]) {
      expect(slots(r), s).toContain(s)
    }
    expect(r.assumptions.find((a) => a.slot === 'season')).toMatchObject({
      value: 'autumn',
      confidence: 0.7,
      source: 'context',
    })
    expect(r.clarifications).toEqual([])
  })

  it("F2 something like Alice's look but for a guy", () => {
    const r = parseIntentOffline("something like Alice's look but for a guy", FIXTURE_CTX)
    expect(r.locale).toBe('en')
    expect(r.mode).toBe('outfit')
    expect(r.referenceHandle).toBe('Alice')
    expect(r.referenceCardId).toBe('lk_alice_01')
    expect(r.referenceRole).toBe('style-source')
    expect(r.recipient).toEqual({
      kind: 'other',
      relation: 'unknown',
      department: 'men',
      label: 'a guy',
    })
    expect(r.department).toBe('men')
    expect(r.assumptions.find((a) => a.slot === 'referenceCardId')?.confidence).toBe(0.9)
    expect(r.assumptions.find((a) => a.slot === 'recipient.kind')).toMatchObject({
      value: 'other',
      confidence: 0.8,
    })
    expect(r.assumptions.find((a) => a.slot === 'department')).toMatchObject({
      value: 'men',
      confidence: 0.8,
    })
    expect(clar(r)).toEqual(['budget.max[no]'])
  })

  it('F3 gift for my dad under $100, he likes hiking', () => {
    const r = parseIntentOffline('gift for my dad under $100, he likes hiking', FIXTURE_CTX)
    expect(r.mode).toBe('single')
    expect(r.recipient).toEqual({
      kind: 'other',
      relation: 'father',
      department: 'men',
      label: 'my dad',
    })
    expect(r.department).toBe('men')
    expect(r.occasion).toBe('hiking')
    expect(r.aesthetics).toEqual(['gorpcore', 'techwear', 'athleisure'])
    expect(r.budget).toEqual({
      max: 3200,
      strictness: 'hard',
      scope: 'per_item',
      currency: 'TWD',
      original: 'under $100',
      originalAmount: 100,
      originalCurrency: 'USD',
    })
    expect(r.giftCategoryPrior).toEqual(['outerwear', 'footwear', 'accessories', 'activewear'])
    expect(r.categoryGroups).toEqual([])
    expectAxes(r, { formality: 0.1, coverage: 0.8, boldness: 0.4, warmth: 0.6 })
    expect(r.assumptions.find((a) => a.slot === 'budget.currency')).toMatchObject({
      value: 'USD',
      confidence: 0.7,
    })
    expect(r.assumptions.find((a) => a.slot === 'categoryGroups')?.confidence).toBe(0.5)
    expect(r.assumptions.find((a) => a.slot === 'season')).toMatchObject({
      value: 'autumn',
      confidence: 0.7,
    })
    expect(clar(r)).toEqual(['categoryGroups[no]', 'budget.currency[no]'])
  })

  it('a named occasion outranks the vague one that came first', () => {
    const r = parseIntentOffline('週末去登山', FIXTURE_CTX)
    expect(r.occasion).toBe('hiking')
  })

  it('F4 幫我找一件黑色的oversize帽T，三千以內', () => {
    const r = parseIntentOffline('幫我找一件黑色的oversize帽T，三千以內', FIXTURE_CTX)
    expect(r.locale).toBe('mixed')
    expect(r.mode).toBe('single')
    expect(r.quantity).toBe(1)
    expect(r.categoryGroups).toEqual(['tops'])
    expect(r.subcategories).toEqual(['hoodie'])
    expect(r.colorFamilies).toEqual(['black'])
    expect(r.fits).toEqual(['oversized'])
    expect(r.budget).toMatchObject({ max: 3000, strictness: 'hard', scope: 'per_item' })
    expect(r.recipient.kind).toBe('self')
    expect(r.department).toBe('women')
    expect(r.aesthetics).toEqual([])
    expect(r.assumptions.find((a) => a.slot === 'department')).toMatchObject({
      value: 'women',
      confidence: 0.9,
      source: 'context',
    })
    expect(r.clarifications).toEqual([])
    expect(r.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('F5 面試要穿的，整套不要超過八千，不要牛仔褲', () => {
    const r = parseIntentOffline('面試要穿的，整套不要超過八千，不要牛仔褲', FIXTURE_CTX)
    expect(r.mode).toBe('outfit')
    expect(r.occasion).toBe('interview')
    expect(r.budget).toMatchObject({ max: 8000, strictness: 'hard', scope: 'total' })
    expect(r.mustAvoid).toEqual(['subcategory:jeans'])
    expect(r.aesthetics).toEqual(['corporate-chic', 'minimalist', 'quiet-luxury'])
    expectAxes(r, { formality: 0.8, coverage: 0.8, boldness: 0.2 })
    expect(slots(r)).toEqual(expect.arrayContaining(['aesthetics', 'colorWeights']))
  })

  it('F6 夏天去沖繩玩，要度假感，淺色，預算大概一萬', () => {
    const r = parseIntentOffline('夏天去沖繩玩，要度假感，淺色，預算大概一萬', FIXTURE_CTX)
    expect(r.mode).toBe('outfit')
    expect(r.occasion).toBe('beach')
    expect(r.season).toBe('summer')
    expect(r.aesthetics[0]).toBe('resort')
    expect(r.aesthetics).toEqual(['resort', 'coastal', 'boho'])
    expect(r.colorWeights).toEqual({
      white: 0.6,
      neutral: 0.6,
      pink: 0.5,
      blue: 0.28,
      'yellow-orange': 0.21,
    })
    expect(r.budget).toMatchObject({ min: 7500, max: 12500, strictness: 'soft', scope: 'total' })
    expectAxes(r, { formality: 0.1, coverage: 0.3, boldness: 0.6, warmth: 0.15 })
    expect(r.assumptions.find((a) => a.slot === 'mode')).toMatchObject({
      value: 'outfit',
      confidence: 0.7,
    })
    expect(slots(r)).toContain('aesthetics')
  })

  it('F7 I want a warm coat for winter, camel or grey, around 6000 NT', () => {
    const r = parseIntentOffline(
      'I want a warm coat for winter, camel or grey, around 6000 NT',
      FIXTURE_CTX,
    )
    expect(r.mode).toBe('single')
    expect(r.categoryGroups).toEqual(['outerwear'])
    expect(r.colors).toEqual(['camel'])
    expect(r.colorFamilies).toEqual(['brown', 'grey'])
    expect(r.season).toBe('winter')
    expectAxes(r, { warmth: 1.0, coverage: 0.9 })
    expect(r.budget).toMatchObject({ min: 4500, max: 7500, strictness: 'soft', scope: 'per_item' })
    expect(r.assumptions.find((a) => a.slot === 'department')?.value).toBe('women')
  })

  it('F8 送女友的生日禮物，她喜歡韓系簡約，三千左右，項鍊或耳環', () => {
    const r = parseIntentOffline(
      '送女友的生日禮物，她喜歡韓系簡約，三千左右，項鍊或耳環',
      FIXTURE_CTX,
    )
    expect(r.mode).toBe('single')
    expect(r.recipient).toMatchObject({ kind: 'other', relation: 'partner', department: 'women' })
    expect(r.department).toBe('women')
    expect(r.aesthetics).toEqual(['k-street', 'minimalist'])
    expect(r.categoryGroups).toEqual(['jewelry'])
    expect(r.subcategories).toEqual(['necklace', 'earrings'])
    expect(r.budget).toMatchObject({ min: 2250, max: 3750, strictness: 'soft', scope: 'per_item' })
    expect(r.occasion).toBeUndefined()
    expect(r.clarifications).toEqual([])
  })

  it('F9 gym fit, all black, cheap (men)', () => {
    const r = parseIntentOffline('gym fit, all black, cheap', withUser('men'))
    expect(r.mode).toBe('outfit')
    expect(r.occasion).toBe('gym')
    expect(r.colorFamilies).toEqual(['black'])
    expect(r.aesthetics).toEqual(['athleisure'])
    expect(r.budget).toMatchObject({ max: 4000, strictness: 'soft', scope: 'total' })
    expectAxes(r, { formality: 0.05, 'price-tier': 0.2 })
    expect(r.assumptions.find((a) => a.slot === 'budget')?.confidence).toBe(0.5)
  })

  it('F10 過年要穿的，紅色但不要太俗', () => {
    const r = parseIntentOffline('過年要穿的，紅色但不要太俗', FIXTURE_CTX)
    expect(r.mode).toBe('outfit')
    expect(r.occasion).toBe('lunar-new-year')
    expect(r.colorFamilies).toEqual(['red'])
    expect(r.mustAvoid).toEqual(['color:black', 'color:white'])
    expectAxes(r, { formality: 0.5, boldness: 0.4, coverage: 0.6 })
    expect(r.aesthetics).toEqual(['quiet-luxury', 'romantic', 'coquette'])
    expect(slots(r)).toEqual(expect.arrayContaining(['aesthetics', 'mustAvoid']))
    expect(clar(r)).toEqual(['budget.max[no]'])
  })

  it('F11 running shoes size 42, not Nike (no department)', () => {
    const r = parseIntentOffline('running shoes size 42, not Nike', withUser(undefined))
    expect(r.locale).toBe('en')
    expect(r.mode).toBe('single')
    expect(r.categoryGroups).toEqual(['footwear'])
    expect(r.subcategories).toEqual(['running-shoe'])
    expect(r.sizes).toEqual({ 'eu-shoe': '42' })
    expect(r.mustAvoid).toEqual(['text:nike'])
    expect(r.department).toBe('unisex')
    expect(r.assumptions.find((a) => a.slot === 'department')).toMatchObject({
      value: 'unisex',
      confidence: 0.4,
    })
    expect(r.assumptions.find((a) => a.slot === 'mustAvoid')).toMatchObject({
      value: 'text:nike',
      confidence: 0.5,
    })
    expect(clar(r)).toEqual(['department[yes]'])
  })

  it('F12 幫我爸買件襯衫，他 L 號，不要花的', () => {
    const r = parseIntentOffline('幫我爸買件襯衫，他 L 號，不要花的', FIXTURE_CTX)
    expect(r.mode).toBe('single')
    expect(r.quantity).toBe(1)
    expect(r.recipient).toMatchObject({ kind: 'other', relation: 'father', department: 'men' })
    expect(r.department).toBe('men')
    expect(r.subcategories).toEqual(['button-down-shirt'])
    expect(r.categoryGroups).toEqual(['tops'])
    expect(r.sizes).toEqual({ alpha: 'L' })
    expect(r.mustAvoid).toEqual([
      'pattern:ditsy-floral',
      'pattern:bold-floral',
      'color:multi-metallic',
    ])
    expect(r.clarifications).toEqual([])
  })

  it('F13 office outfit for summer, medium, earth tones, no polyester', () => {
    const r = parseIntentOffline(
      'office outfit for summer, medium, earth tones, no polyester',
      FIXTURE_CTX,
    )
    expect(r.mode).toBe('outfit')
    expect(r.occasion).toBe('office')
    expect(r.season).toBe('summer')
    expect(r.sizes).toEqual({ alpha: 'M' })
    expect(r.colorFamilies).toEqual([])
    expect(r.colorWeights).toEqual({
      brown: 0.8,
      neutral: 0.8,
      green: 0.5,
      black: 0.28,
      white: 0.28,
      grey: 0.28,
      blue: 0.21,
    })
    expect(r.mustAvoid).toEqual(['material:recycled-polyester'])
    expect(r.aesthetics).toEqual(['corporate-chic', 'minimalist', 'quiet-luxury', 'clean-girl'])
    expectAxes(r, { formality: 0.65, coverage: 0.7, boldness: 0.3, warmth: 0.15 })
  })

  it('F14 想跟 Jacob 一起去音樂祭，幫我配一套跟他的 look 搭的', () => {
    const r = parseIntentOffline('想跟 Jacob 一起去音樂祭，幫我配一套跟他的 look 搭的', FIXTURE_CTX)
    expect(r.mode).toBe('outfit')
    expect(r.occasion).toBe('festival')
    expect(r.referenceHandle).toBe('Jacob')
    expect(r.referenceCardId).toBe('lk_jacob_01')
    expect(r.referenceRole).toBe('coordinate-with')
    expect(r.recipient.kind).toBe('self')
    expect(r.department).toBe('women')
    expect(r.aesthetics).toEqual(['boho', 'y2k', 'streetwear', 'retro-70s'])
    expect(r.assumptions.find((a) => a.slot === 'referenceCardId')?.confidence).toBe(0.7)
    expect(r.assumptions.find((a) => a.slot === 'season')?.value).toBe('autumn')
    expect(clar(r)).toEqual(['budget.max[no]'])
  })

  it('F15 2 white tees under 800 each', () => {
    const r = parseIntentOffline('2 white tees under 800 each', FIXTURE_CTX)
    expect(r.mode).toBe('single')
    expect(r.quantity).toBe(2)
    expect(r.subcategories).toEqual(['tee'])
    expect(r.categoryGroups).toEqual(['tops'])
    expect(r.colorFamilies).toEqual(['white'])
    expect(r.budget).toMatchObject({ max: 800, strictness: 'hard', scope: 'per_item' })
  })

  it('F16 我不知道，隨便看看', () => {
    const r = parseIntentOffline('我不知道，隨便看看', FIXTURE_CTX)
    expect(r.mode).toBe('browse')
    expect(r.categoryGroups).toEqual([])
    expect(r.aesthetics).toEqual([])
    expect(r.occasion).toBeUndefined()
    expect(r.budget).toBeUndefined()
    expect(r.vibe).toBe('我不知道，隨便看看')
    expect(r.assumptions.find((a) => a.slot === 'mode')).toMatchObject({
      value: 'browse',
      confidence: 0.5,
    })
    expect(r.assumptions.find((a) => a.slot === 'department')?.value).toBe('women')
    expect(clar(r)).toEqual(['occasion[no]'])
    expect(r.confidence).toBe(0.5)
  })

  it('F17 follow-up 再便宜一點，換成藍色 on F4', () => {
    const prev = parseIntentOffline('幫我找一件黑色的oversize帽T，三千以內', FIXTURE_CTX)
    const next = parseIntentOffline('再便宜一點，換成藍色', {
      ...FIXTURE_CTX,
      previousIntent: prev,
    })
    const r = mergeIntent(prev, next, FIXTURE_CTX)
    expect(r.subcategories).toEqual(['hoodie'])
    expect(r.fits).toEqual(['oversized'])
    expect(r.quantity).toBe(1)
    expect(r.budget?.max).toBe(2400)
    expect(r.colorFamilies).toEqual(['blue'])
    expect(r.colorWeights).toEqual({ blue: 1 })
    expect(r.assumptions.find((a) => a.slot === 'budget')).toMatchObject({
      value: '上限 ×0.8',
      confidence: 0.8,
    })
    expect(r.previousUtterance).toBe(prev.utterance)
  })
})

describe('parser behaviour', () => {
  it('assumptions carry confidences in [0,1] and non-empty reasons; schema round-trips', () => {
    for (const u of [
      '下週要去朋友婚禮，預算五千，不想太正式',
      'gift for my dad under $100, he likes hiking',
      '我不知道，隨便看看',
    ]) {
      const r = parseIntentOffline(u, FIXTURE_CTX)
      for (const a of r.assumptions) {
        expect(a.confidence).toBeGreaterThanOrEqual(0)
        expect(a.confidence).toBeLessThanOrEqual(1)
        expect(a.reason.length).toBeGreaterThan(0)
      }
      const parsed = IntentSchema.parse(JSON.parse(JSON.stringify(r)))
      expect(parsed).toEqual(r)
    }
  })

  it('clause-local negation: 「不要牛仔褲，要黑色」 keeps black', () => {
    const r = parseIntentOffline('不要牛仔褲，要黑色', FIXTURE_CTX)
    expect(r.mustAvoid).toEqual(['subcategory:jeans'])
    expect(r.colorFamilies).toEqual(['black'])
    const en = parseIntentOffline('no polyester, but warm and black', FIXTURE_CTX)
    expect(en.mustAvoid).toEqual(['material:recycled-polyester'])
    expect(en.colorFamilies).toEqual(['black'])
    expect(en.axisTargets?.warmth).toBeGreaterThan(0.5)
  })

  it('negated aesthetics and modifiers flip', () => {
    const r = parseIntentOffline('不要太運動風，不要正式', FIXTURE_CTX)
    expect(r.mustAvoid).toContain('aesthetic:athleisure')
    expect(r.aesthetics).not.toContain('athleisure')
    expect(r.axisTargets?.formality).toBeLessThan(0.5)
  })

  it('longest match: 「黑色帽T」 → black + hoodie, never a hat', () => {
    const r = parseIntentOffline('黑色帽T', FIXTURE_CTX)
    expect(r.colorFamilies).toEqual(['black'])
    expect(r.subcategories).toEqual(['hoodie'])
    expect(r.categoryGroups).toEqual(['tops'])
  })

  it('brands from ctx resolve to brand tokens', () => {
    const ctx = { ...FIXTURE_CTX, brands: [{ id: 1, name: 'Northline', slug: 'northline' }] }
    expect(parseIntentOffline('a Northline hoodie', ctx).mustHave).toEqual(['brand:northline'])
    expect(parseIntentOffline('a hoodie, not Northline', ctx).mustAvoid).toEqual([
      'brand:northline',
    ])
  })

  it('attributes, allergies, quantity words and too-short avoids', () => {
    expect(
      parseIntentOffline('waterproof jacket with pockets, no logo', FIXTURE_CTX).mustHave,
    ).toEqual(['attribute:waterproof', 'attribute:pockets'])
    expect(
      parseIntentOffline('waterproof jacket with pockets, no logo', FIXTURE_CTX).mustAvoid,
    ).toEqual(['attribute:logo'])
    expect(parseIntentOffline('我對羊毛過敏，想找大衣', FIXTURE_CTX).mustAvoid).toEqual([
      'material:wool',
    ])
    const short = parseIntentOffline('洋裝不要太短', FIXTURE_CTX)
    expect(short.mustAvoid).toContain('subcategory:mini-dress')
    expect(short.axisTargets?.coverage).toBeGreaterThan(0.5)
    expect(parseIntentOffline('三四件T恤', FIXTURE_CTX).quantity).toBe(4)
  })

  it('season from temperature words and date phrases', () => {
    expect(parseIntentOffline('好熱，想找透氣的上衣', FIXTURE_CTX).season).toBe('summer')
    expect(parseIntentOffline('下個月去旅行', FIXTURE_CTX).season).toBe('autumn')
    expect(
      parseIntentOffline('下個月去旅行', { ...FIXTURE_CTX, now: undefined }).season,
    ).toBeUndefined()
    expect(
      parseIntentOffline('a coat for next week', {
        ...FIXTURE_CTX,
        now: new Date('2026-11-28T00:00:00Z'),
      }).season,
    ).toBe('winter')
  })

  it('is deterministic and idempotent', () => {
    const a = parseIntentOffline('下週要去朋友婚禮，預算五千，不想太正式', FIXTURE_CTX)
    const b = parseIntentOffline('下週要去朋友婚禮，預算五千，不想太正式', FIXTURE_CTX)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('parses a sentence in about a millisecond', () => {
    parseIntentOffline('warm up', FIXTURE_CTX)
    const t0 = performance.now()
    for (let i = 0; i < 200; i++)
      parseIntentOffline('office outfit for summer, medium, earth tones, no polyester', FIXTURE_CTX)
    expect((performance.now() - t0) / 200).toBeLessThan(15)
  })
})

describe('sleeves', () => {
  it('carries a stated sleeve as a constraint token, in either polarity', () => {
    // `fits` is matched against `articles.fit`; the sleeve lives in its own column, so it travels
    // as a mustHave token and reaches retrieval as a requirement.
    expect(parseIntentOffline('我想穿休閒風要長袖').mustHave).toContain('sleeve:long')
    expect(parseIntentOffline('long sleeve top').mustHave).toContain('sleeve:long')
    expect(parseIntentOffline('我要短袖').mustHave).toContain('sleeve:short')
    expect(parseIntentOffline('不要長袖').mustAvoid).toContain('sleeve:long')
    expect(parseIntentOffline('不要長袖').mustHave).not.toContain('sleeve:long')
  })
})

describe('negation scope in Chinese', () => {
  it('stops at 的, because the noun after it is what is being asked for', () => {
    // `不要紅色的洋裝` is a dress, just not a red one. Negating through 的 excluded dresses
    // outright and returned the opposite of the request.
    const red = parseIntentOffline('不要紅色的洋裝')
    expect(red.categoryGroups).toEqual(['dresses'])
    expect(red.mustAvoid).toEqual(['color:red'])

    const lace = parseIntentOffline('不要蕾絲邊的洋裝')
    expect(lace.categoryGroups).toEqual(['dresses'])
    expect(lace.mustAvoid).toEqual(['attribute:laceTrim'])

    const cotton = parseIntentOffline('不要棉的洋裝')
    expect(cotton.categoryGroups).toEqual(['dresses'])
    expect(cotton.mustAvoid).toContain('material:cotton-jersey')
  })

  it('keeps running when 的 hands the clause to another modifier, not a noun', () => {
    // Two refusals and no head noun. Cutting at the first 的 dropped the white, which is the
    // regression the head-noun test exists to catch.
    const both = parseIntentOffline('不要黑色的和白色的')
    expect(both.mustAvoid).toEqual(expect.arrayContaining(['color:black', 'color:white']))
    const two = parseIntentOffline('不要蕾絲的、不要雪紡的洋裝')
    expect(two.categoryGroups).toEqual(['dresses'])
    expect(two.mustAvoid).toEqual(expect.arrayContaining(['material:lace', 'material:chiffon']))
  })

  it('still negates the category when no 的 hands the clause to a head noun', () => {
    const bare = parseIntentOffline('不要洋裝')
    expect(bare.categoryGroups).toEqual([])
    expect(bare.mustAvoid).toEqual(['group:dresses'])
    // A trailing modifier with nothing after it is negated as it always was.
    expect(parseIntentOffline('不要紅色').mustAvoid).toEqual(['color:red'])
  })

  it('leaves English alone, where the structure is different', () => {
    const en = parseIntentOffline('no red dresses')
    expect(en.mustAvoid).toEqual(expect.arrayContaining(['color:red', 'group:dresses']))
  })
})
