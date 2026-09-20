import { describe, expect, it, test } from 'vitest'
import { formatRelative } from '@/server/format'
import { DEFAULT_LOCALE, LOCALES, localeFromTag, matchLocale, type Locale } from './config'
import { CATALOGS } from './messages'
import {
  aestheticLabel,
  categoryGroupLabel,
  colorFamilyLabel,
  colorNameLabel,
  departmentLabel,
  facetLabel,
  occasionLabel,
  subcategoryLabel,
} from './taxonomy'

type Node = Record<string, unknown>

/** Every leaf as `a.b.c` → the value, so two catalogs can be compared key for key. */
function leaves(node: Node, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of leaves(value as Node, path)) out.set(k, v)
    } else {
      out.set(path, value)
    }
  }
  return out
}

describe('locale selection', () => {
  it('reads Accept-Language by descending quality', () => {
    expect(matchLocale('zh-TW,zh;q=0.9,en-US;q=0.8')).toBe('zh-TW')
    expect(matchLocale('en-US,en;q=0.9')).toBe('en')
    expect(matchLocale('fr-FR,fr;q=0.9,zh-TW;q=0.4')).toBe('zh-TW')
    expect(matchLocale('en;q=0.4,zh-TW;q=0.9')).toBe('zh-TW')
    expect(matchLocale('')).toBe(DEFAULT_LOCALE)
    expect(matchLocale(null)).toBe(DEFAULT_LOCALE)
  })
  it('keeps Traditional Chinese apart from Simplified and from unknown languages', () => {
    expect(localeFromTag('zh-Hant-TW')).toBe('zh-TW')
    expect(localeFromTag('zh-HK')).toBe('zh-TW')
    expect(localeFromTag('zh-CN')).toBeNull()
    expect(localeFromTag('zh-Hans')).toBeNull()
    expect(localeFromTag('ja-JP')).toBeNull()
    expect(matchLocale('zh-CN,zh;q=0.9')).toBe('zh-TW')
    expect(matchLocale('zh-CN')).toBe(DEFAULT_LOCALE)
  })
})

describe('message catalogs', () => {
  const english = leaves(CATALOGS.en as unknown as Node)
  it.each(LOCALES.filter((l) => l !== 'en'))('%s carries every English key', (locale: Locale) => {
    const other = leaves(CATALOGS[locale] as unknown as Node)
    expect([...other.keys()].toSorted()).toEqual([...english.keys()].toSorted())
  })
  it.each(LOCALES)('%s has a usable value at every key', (locale: Locale) => {
    for (const [path, value] of leaves(CATALOGS[locale] as unknown as Node)) {
      if (typeof value === 'function') {
        expect(value.length, path).toBeGreaterThan(0)
        continue
      }
      expect(typeof value, path).toBe('string')
      expect(String(value).trim(), path).not.toBe('')
    }
  })
  it('keeps the same shape at every key, so a function never becomes a bare string', () => {
    const chinese = leaves(CATALOGS['zh-TW'] as unknown as Node)
    for (const [path, value] of english) {
      expect(typeof chinese.get(path), path).toBe(typeof value)
      if (typeof value === 'function')
        expect((chinese.get(path) as (...args: never[]) => string).length, path).toBe(value.length)
    }
  })
  it('writes Chinese in Traditional characters, not Simplified', () => {
    const simplified = /[国际际这个发这么产传们时间买卖单说话语这样华东级]/u
    for (const [path, value] of leaves(CATALOGS['zh-TW'] as unknown as Node)) {
      if (typeof value !== 'string') continue
      expect(simplified.test(value), `${path}: ${value}`).toBe(false)
    }
  })
})

describe('catalog nouns', () => {
  it('reads Traditional Chinese labels straight from the catalog', () => {
    expect(departmentLabel('zh-TW', 'women')).toBe('女裝')
    expect(departmentLabel('en', 'women')).toBe('Women')
    expect(categoryGroupLabel('zh-TW', 'outerwear')).toBe('外套')
    expect(colorFamilyLabel('zh-TW', 'blue')).toBe('藍')
    expect(aestheticLabel('zh-TW', 'minimalist')).toBe('極簡')
    expect(occasionLabel('zh-TW', 'wedding-guest')).toBe('婚禮賓客')
    expect(subcategoryLabel('zh-TW', 'tee')).toBe('T恤')
  })
  it('resolves a slug whose facet is unknown, and humanizes one it has never seen', () => {
    expect(facetLabel('zh-TW', 'quiet-luxury')).toBe('低調奢華')
    expect(facetLabel('zh-TW', 'color:navy')).toBe('海軍藍')
    expect(facetLabel('en', 'color:navy')).toBe('Navy')
    expect(facetLabel('zh-TW', 'a-line')).toBe('傘狀')
    expect(facetLabel('zh-TW', 'not-a-real-slug')).toBe('Not a real slug')
  })
})

describe('relative time', () => {
  const now = new Date('2026-09-19T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms)
  it('captions the same instant in each language', () => {
    expect(formatRelative(ago(10_000), 'en', now)).toBe('just now')
    expect(formatRelative(ago(10_000), 'zh-TW', now)).toBe('剛剛')
    expect(formatRelative(ago(5 * 60_000), 'zh-TW', now)).toBe('5 分鐘前')
    expect(formatRelative(ago(3 * 3_600_000), 'zh-TW', now)).toBe('3 小時前')
    expect(formatRelative(ago(24 * 3_600_000), 'zh-TW', now)).toBe('昨天')
    expect(formatRelative(ago(3 * 24 * 3_600_000), 'zh-TW', now)).toBe('3 天前')
    expect(formatRelative(ago(21 * 24 * 3_600_000), 'zh-TW', now)).toBe('3 週前')
  })
  it('falls back to English when no language is given', () => {
    expect(formatRelative(ago(5 * 60_000), undefined, now)).toBe('5 min ago')
  })
})

/**
 * H&M's colour vocabulary is a modifier and a hue, which the catalogue's whole names do not cover.
 * Half the catalogue used to print its English name into a Traditional Chinese page.
 */
describe('colorNameLabel', () => {
  test.each([
    ['Black', '黑'],
    ['Off White', '米白'],
    ['Dark Blue', '深藍'],
    ['Light Pink', '淺粉'],
    ['Greenish Khaki', '偏綠卡其'],
    ['Yellowish Brown', '偏黃棕'],
    ['Greyish Beige', '偏灰米色'],
    ['Other Turquoise', '其他綠松'],
    ['Yellow', '黃'],
    ['Transparent', '透明'],
    ['Bronze/Copper', '古銅'],
  ])('reads %s in Traditional Chinese', (name, expected) => {
    expect(colorNameLabel('zh-TW', name)).toBe(expected)
  })

  test('keeps H&M’s own name in English', () => {
    expect(colorNameLabel('en', 'Dark Blue')).toBe('Dark Blue')
  })

  test('leaves an unrecorded colour alone rather than inventing one', () => {
    expect(colorNameLabel('zh-TW', '')).toBe('')
    expect(colorNameLabel('zh-TW', 'Chartreuse Mist')).toBe('Chartreuse mist')
  })
})
