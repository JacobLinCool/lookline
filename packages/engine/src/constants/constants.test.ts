import { describe, expect, it } from 'vitest'
import { AESTHETICS } from '@lookline/catalog'
import {
  AESTHETIC_AXIS_PRIOR,
  AESTHETIC_COLOR_PRIOR,
  CURRENCY_RATES,
  NEUTRAL_AXIS_ROW,
  OCCASIONS,
  OCCASION_PRIORS,
  PRIOR_AXES,
  canonicalAesthetic,
  resolveAestheticTables,
  roundTwd,
  toTwd,
} from './index'

describe('constants', () => {
  it('every catalog aesthetic slug has axis and colour rows after resolution', () => {
    const tables = resolveAestheticTables(AESTHETICS)
    expect(tables.slugs).toHaveLength(32)
    for (const a of AESTHETICS) {
      const row = tables.axisPrior[a.slug]
      expect(row).toBeDefined()
      for (const axis of PRIOR_AXES) {
        expect(row![axis]).toBeGreaterThanOrEqual(0)
        expect(row![axis]).toBeLessThanOrEqual(1)
      }
      expect(Object.keys(tables.colorPrior[a.slug] ?? {}).length).toBeGreaterThan(0)
    }
    expect(AESTHETIC_AXIS_PRIOR.minimalist!.boldness).toBeLessThan(
      AESTHETIC_AXIS_PRIOR.glam!.boldness,
    )
    expect(AESTHETIC_COLOR_PRIOR.goth!.black).toBe(1)
  })

  it('re-keys spec slugs through aliases and drops unknown rows', () => {
    const tables = resolveAestheticTables(AESTHETICS, {
      axisPrior: { 'old-money': { formality: 0.8 }, nonsense: { formality: 0.1 } },
      colorPrior: { classic: { blue: 0.9 } },
    })
    expect(tables.axisPrior['quiet-luxury']!.formality).toBe(0.8)
    expect(tables.axisPrior.nonsense).toBeUndefined()
    expect(tables.colorPrior['quiet-luxury']!.blue).toBe(0.9)
    const neutral = resolveAestheticTables([
      { ...AESTHETICS[0]!, slug: 'x', favours: undefined as never },
    ])
    expect(neutral.axisPrior.x).toEqual(NEUTRAL_AXIS_ROW)
  })

  it('canonicalAesthetic maps catalog and spec slugs', () => {
    expect(canonicalAesthetic('minimalist')).toBe('minimalist')
    expect(canonicalAesthetic('Korean Minimal')).toBe('k-street')
    expect(canonicalAesthetic('bohemian')).toBe('boho')
    expect(canonicalAesthetic('nope')).toBeUndefined()
  })

  it('occasion slugs are unique and every prior uses catalog aesthetics', () => {
    const slugs = OCCASIONS.map((o) => o.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const known = new Set(AESTHETICS.map((a) => a.slug))
    for (const slug of slugs) {
      const prior = OCCASION_PRIORS[slug]
      expect(prior).toBeDefined()
      for (const a of Object.keys(prior!.aesthetics)) expect(known.has(a)).toBe(true)
    }
  })

  it('currency conversion and rounding', () => {
    expect(CURRENCY_RATES.find((c) => c.code === 'USD')?.rate).toBe(32)
    expect(toTwd(100, 'USD')).toBe(3200)
    expect(toTwd(50, 'EUR')).toBe(1750)
    expect(toTwd(30000, 'JPY')).toBe(6300)
    expect(toTwd(150, 'USD')).toBe(4800)
    expect(toTwd(1234, 'TWD')).toBe(1234)
    expect(roundTwd(12340)).toBe(12300)
    expect(roundTwd(1234)).toBe(1250)
    expect(roundTwd(1750)).toBe(1750)
    expect(roundTwd(994)).toBe(990)
    expect(roundTwd(3)).toBe(10)
  })
})
