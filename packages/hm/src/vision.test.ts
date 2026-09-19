import { describe, expect, it } from 'vitest'
import {
  AESTHETICS,
  DESIGN_DETAIL_SLUGS,
  STYLE_BLOCKS,
  aestheticIndex,
  axisIndex,
  colorFamilyIndex,
} from '@lookline/catalog'
import { materializeVision, type ImportedArticle } from './materialize'
import { motifKey } from './print-pass'
import {
  MAX_AESTHETICS,
  MAX_DESIGN_DETAILS,
  MAX_OCCASIONS,
  VISION_VOCAB,
  parseVision,
  visionJsonSchema,
  type VisionResult,
} from './vision'

const full = {
  aesthetics: [
    { slug: 'quiet-luxury', weight: 0.9 },
    { slug: 'minimalist', weight: 0.6 },
  ],
  pattern: 'solid',
  printSubject: 'none',
  designDetails: ['cableKnit', 'ribbed'],
  fit: 'oversized',
  silhouette: '',
  length: 'longline',
  neckline: 'crew',
  sleeve: 'long',
  closure: 'pull-on',
  material: 'wool',
  axes: { formality: 0.6, boldness: 0.2, structure: 0.4, coverage: 0.8, texture: 0.7 },
  occasions: ['everyday', 'work'],
  rise: '',
  shoulder: 'dropped',
  pocketStyle: 'none',
  knitGauge: 'chunky',
  padding: '',
  lookEn: 'An oatmeal cable knit with a dropped shoulder and a ribbed hem.',
  lookZh: '燕麥色麻花針織，落肩剪裁，下襬羅紋收邊。',
  stylingEn: 'Suits quiet weekday dressing, over a shirt or on its own.',
  stylingZh: '適合低調的平日穿搭，可單穿或罩在襯衫外。',
  confidence: 0.8,
  evidence: 'oversized cable knit in oatmeal, no hardware',
}

const row: ImportedArticle = {
  colorFamily: 'neutral',
  categoryGroup: 'tops',
  section: 'Womens Everyday Collection',
  seasons: ['winter'],
  occasions: ['everyday'],
  price: 899,
  trendScore: 0.4,
  material: '',
  fit: '',
  length: '',
  neckline: 'crew',
  sleeve: '',
  closure: '',
  attributes: { pockets: true },
}

describe('visionJsonSchema', () => {
  it('is strict-compatible: closed objects, every property required, no unsupported keywords', () => {
    const schema = visionJsonSchema()
    const banned = new Set([
      'maxItems',
      'minItems',
      'minimum',
      'maximum',
      'pattern',
      'format',
      'minLength',
      'maxLength',
      'uniqueItems',
    ])
    // Only keyword positions are checked: `properties` is a map of field names, and one of the
    // fields really is called `pattern`.
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (typeof node !== 'object' || node === null) return
      const o = node as Record<string, unknown>
      for (const key of Object.keys(o)) expect(banned.has(key)).toBe(false)
      if (o['type'] === 'object') {
        expect(o['additionalProperties']).toBe(false)
        const props = Object.keys((o['properties'] ?? {}) as object)
        expect((o['required'] as string[]).toSorted()).toEqual(props.toSorted())
      }
      for (const [key, value] of Object.entries(o)) {
        if (key === 'properties') Object.values(value as object).forEach(walk)
        else if (key !== 'enum' && key !== 'required') walk(value)
      }
    }
    walk(schema)
  })

  it('constrains every field to a catalog vocabulary, aesthetics included', () => {
    const props = visionJsonSchema()['properties'] as Record<string, Record<string, unknown>>
    expect(props['pattern']!['enum']).toEqual(VISION_VOCAB.patterns)
    // The blank is the "not applicable" answer, so these carry one extra value.
    expect(props['neckline']!['enum']).toEqual(['', ...VISION_VOCAB.necklines])
    const item = (props['aesthetics']!['items'] as Record<string, Record<string, unknown>>)!
    const slug = (item['properties'] as Record<string, Record<string, unknown>>)['slug']!
    expect(slug['enum']).toEqual(AESTHETICS.map((a) => a.slug))
  })
})

describe('parseVision', () => {
  it('accepts a well-formed reading unchanged', () => {
    expect(parseVision(full)).toEqual(full)
  })

  it('drops values outside the vocabulary instead of storing them', () => {
    const r = parseVision({
      ...full,
      aesthetics: [{ slug: 'cyberpunk-maximalist', weight: 1 }, ...full.aesthetics],
      pattern: 'paisley',
      neckline: 'cowl',
      material: 'polyester',
      designDetails: ['cableKnit', 'peplum'],
    })!
    expect(r.aesthetics.map((a) => a.slug)).toEqual(['quiet-luxury', 'minimalist'])
    expect(r.pattern).toBe('')
    expect(r.neckline).toBe('')
    expect(r.material).toBe('')
    expect(r.designDetails).toEqual(['cableKnit'])
  })

  it('enforces the caps and ranges the strict schema cannot express', () => {
    const r = parseVision({
      ...full,
      aesthetics: AESTHETICS.slice(0, 8).map((a) => ({ slug: a.slug, weight: 0.5 })),
      designDetails: [...DESIGN_DETAIL_SLUGS],
      occasions: [...VISION_VOCAB.occasions],
      axes: { ...full.axes, formality: 4, boldness: -2 },
      confidence: 99,
    })!
    expect(r.aesthetics).toHaveLength(MAX_AESTHETICS)
    expect(r.designDetails).toHaveLength(MAX_DESIGN_DETAILS)
    expect(r.occasions).toHaveLength(MAX_OCCASIONS)
    expect(r.axes.formality).toBe(1)
    expect(r.axes.boldness).toBe(0)
    expect(r.confidence).toBe(1)
  })

  it('sorts aesthetics by weight, drops zero-weight and duplicate slugs, and rejects non-objects', () => {
    const r = parseVision({
      ...full,
      aesthetics: [
        { slug: 'minimalist', weight: 0.3 },
        { slug: 'minimalist', weight: 0.9 },
        { slug: 'goth', weight: 0 },
        { slug: 'quiet-luxury', weight: 0.8 },
      ],
    })!
    expect(r.aesthetics).toEqual([
      { slug: 'quiet-luxury', weight: 0.8 },
      { slug: 'minimalist', weight: 0.3 },
    ])
    expect(parseVision(null)).toBeNull()
    expect(parseVision('{}')).toBeNull()
    expect(parseVision({})!.aesthetics).toEqual([])
  })
})

describe('materializeVision', () => {
  const out = materializeVision(row, full as VisionResult)

  it('writes the colour family the row already carries', () => {
    // `articles.colour_family` is the derived slug beside H&M's own master, so the vector gets
    // `neutral` rather than a raw "Beige" that matches no family and leaves the block at zero.
    expect(out.styleVector[colorFamilyIndex('neutral')]).toBe(1)
    const [from, to] = STYLE_BLOCKS.colors
    expect(out.styleVector.slice(from, to).filter((x) => x > 0)).toHaveLength(1)
  })

  it('puts the valued construction fields in attributes and the description in the column', () => {
    expect(out.attributes['shoulder']).toBe('dropped')
    expect(out.attributes['knitGauge']).toBe('chunky')
    expect(out.attributes['pocketStyle']).toBe('none')
    // A jumper has no rise and no padding, and an empty answer is not stored.
    expect(out.attributes['rise']).toBeUndefined()
    expect(out.attributes['padding']).toBeUndefined()
    // The description is indexed; the styling note stays in the payload for copy to read.
    expect(out.styleCaption).toContain('cable knit')
    expect(out.styleCaptionZh).toContain('麻花')
    expect(out.styleCaption).not.toContain('weekday')
  })

  it('writes the aesthetic block scaled by confidence and leaves the rest of it zero', () => {
    expect(out.styleVector).toHaveLength(64)
    expect(out.styleVector[aestheticIndex('quiet-luxury')]).toBeCloseTo(0.9 * 0.8, 9)
    expect(out.styleVector[aestheticIndex('minimalist')]).toBeCloseTo(0.6 * 0.8, 9)
    const [from, to] = STYLE_BLOCKS.aesthetics
    expect(out.styleVector.slice(from, to).filter((x) => x > 0)).toHaveLength(2)
    // the column keeps both tags at full strength, so a facet still finds them
    expect(out.aesthetics).toEqual(['quiet-luxury', 'minimalist'])
  })

  it('takes the visible axes from the image and leaves the measured ones measured', () => {
    expect(out.styleVector[axisIndex('coverage')]).toBe(0.8)
    expect(out.styleVector[axisIndex('texture')]).toBe(0.7)
    expect(out.styleVector[axisIndex('boldness')]).toBe(0.2)
    // winter seasons, so warmth is the fabric-and-season figure, not anything the model said
    expect(out.styleVector[axisIndex('warmth')]).toBeGreaterThanOrEqual(0.65)
    expect(out.styleVector[axisIndex('price-tier')]).toBeCloseTo(
      Math.log1p(899) / Math.log1p(9000),
      9,
    )
    expect(out.styleVector[axisIndex('trendiness')]).toBe(0.4)
  })

  it('lets the copy keep the fabric and the image fill everything it left empty', () => {
    expect(out.fit).toBe('oversized')
    expect(out.closure).toBe('pull-on')
    expect(out.material).toBe('wool')
    const named = materializeVision({ ...row, material: 'denim' }, full as VisionResult)
    expect(named.material).toBe('denim')
  })

  it('merges design details beside the regex attributes without colliding', () => {
    expect(out.attributes).toEqual({
      pockets: true,
      cableKnit: true,
      ribbed: true,
      shoulder: 'dropped',
      pocketStyle: 'none',
      knitGauge: 'chunky',
    })
    for (const key of DESIGN_DETAIL_SLUGS) {
      expect(['pockets', 'hood', 'zip', 'elasticWaist', 'lined']).not.toContain(key)
    }
  })

  it('prefers a per-item occasion list over the shelf, and keeps the shelf when there is none', () => {
    expect(out.occasions).toEqual(['everyday', 'work'])
    const quiet = materializeVision(row, { ...(full as VisionResult), occasions: [] })
    expect(quiet.occasions).toEqual(['everyday'])
  })

  it('stores no print subject for an unprinted garment', () => {
    expect(out.printSubject).toBe('')
    const tee = materializeVision(row, { ...(full as VisionResult), printSubject: 'slogan' })
    expect(tee.printSubject).toBe('slogan')
  })
})

describe('motifKey', () => {
  it('merges the variants the first readings actually produced', () => {
    // Every pair below appeared as two separate strings across 4 598 print readings.
    for (const [a, b] of [
      ['leopard', 'leopard spots'],
      ['zebra', 'zebra stripes'],
      ['snake', 'snake skin'],
      ['snake', 'snakeskin'.replace('snakeskin', 'snake scales')],
      ['paisley', 'paisley motifs'],
      ['heart', 'hearts'],
      ['flower', 'flowers'],
      ['flower', 'small flowers'],
      ['daisy', 'daisies'],
    ] as const) {
      expect(motifKey(b)).toBe(motifKey(a))
    }
  })

  it('keeps subjects that are genuinely different apart', () => {
    const keys = ['roses', 'palm fronds', 'american flag', 'nasa logo', 'tyrannosaurus rex'].map(
      motifKey,
    )
    expect(new Set(keys).size).toBe(keys.length)
    expect(motifKey('roses')).not.toBe(motifKey('flowers'))
  })

  it('is empty when the motif names a treatment rather than a subject', () => {
    expect(motifKey('abstract print')).toBe('')
    expect(motifKey('assorted patterns')).toBe('')
    expect(motifKey('')).toBe('')
  })
})
