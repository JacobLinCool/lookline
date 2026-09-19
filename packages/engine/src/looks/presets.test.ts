import { describe, expect, it } from 'vitest'
import { STYLE_PRESETS, findStylePreset } from './presets'

const REQUIRED = [
  'tokyo-midnight',
  'paris-editorial',
  '90s-magazine',
  'film-still',
  'cyber-couture',
  'street-documentary',
  'dreamscape',
  'studio-minimal',
]

describe('STYLE_PRESETS', () => {
  it('ships at least 8 presets with unique slugs', () => {
    expect(STYLE_PRESETS.length).toBeGreaterThanOrEqual(8)
    const slugs = STYLE_PRESETS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of REQUIRED) expect(slugs).toContain(slug)
  })

  it('every preset is complete and person-first', () => {
    for (const p of STYLE_PRESETS) {
      expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.labelZh.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(10)
      expect(p.prompt.length).toBeGreaterThan(80)
      expect(p.prompt).toMatch(/lens/i)
      expect(p.prompt).toMatch(/mood/i)
      expect(p.prompt).not.toMatch(/logo|brand name|watermark/i)
      for (const key of ['background', 'foreground', 'accent'] as const) {
        expect(p.theme[key]).toMatch(/^#[0-9a-f]{6}$/i)
      }
      expect(p.theme.mood.length).toBeGreaterThan(0)
    }
  })

  it('findStylePreset resolves by slug', () => {
    expect(findStylePreset('film-still')?.name).toBe('Film Still')
    expect(findStylePreset('nope')).toBeUndefined()
  })
})
