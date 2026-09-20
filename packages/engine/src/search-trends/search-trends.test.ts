import { describe, expect, it } from 'vitest'
import { parseTrendsRss, withoutSource, type StyleDirection } from './index'

const RSS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0"><channel>
<item>
  <title>名古屋亞運</title>
  <ht:approx_traffic>100+</ht:approx_traffic>
  <link>https://trends.google.com/a</link>
  <ht:news_item_title>亞運&#12295;開幕式110人大團出場 中華隊拚首金</ht:news_item_title>
  <ht:news_item_url>https://news.example/a</ht:news_item_url>
</item>
<item>
  <title>x</title>
  <ht:approx_traffic>1000+</ht:approx_traffic>
  <ht:news_item_title><![CDATA[The Nike KD 6 x Paris Saint-Germain Is Out Now]]></ht:news_item_title>
  <ht:news_item_url>https://news.example/b</ht:news_item_url>
</item>
</channel></rss>`

const direction = (partial: Partial<StyleDirection>): StyleDirection => ({
  label: '運動機能風',
  styleQuery: '運動風 機能外套 黑色',
  rationale: '大型賽事期間，剪裁俐落的機能單品最好搭。',
  ...partial,
})

describe('parseTrendsRss', () => {
  it('reads rank, heat and the news context off each item', () => {
    const rows = parseTrendsRss(RSS)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      rank: 1,
      signal: '名古屋亞運',
      heat: '100+',
      newsTitle: '亞運〇開幕式110人大團出場 中華隊拚首金', // numeric entity decoded
      sourceUrl: 'https://news.example/a',
    })
    expect(rows[1]?.newsTitle).toBe('The Nike KD 6 x Paris Saint-Germain Is Out Now') // CDATA
    expect(rows[1]?.sourceUrl).toBe('https://news.example/b')
  })

  it('returns nothing rather than throwing on a feed it cannot read', () => {
    expect(parseTrendsRss('<html>Attention Required! | Cloudflare</html>')).toEqual([])
  })
})

describe('withoutSource', () => {
  const batch = parseTrendsRss(RSS)

  it('keeps a direction that talks only about clothes', () => {
    expect(withoutSource([direction({})], batch)).toHaveLength(1)
  })

  it('drops a direction whose rationale quotes a trending term', () => {
    const leaked = direction({ rationale: '名古屋亞運開幕，運動風正熱。' })
    expect(withoutSource([leaked], batch)).toEqual([])
  })

  it('drops a direction naming a brand that only appeared in a news headline', () => {
    const leaked = direction({ label: 'Nike 球鞋風', styleQuery: 'nike 運動鞋' })
    expect(withoutSource([leaked], batch)).toEqual([])
  })

  it('vetoes across the whole batch, not just the signal being dressed', () => {
    // The sporting mood is read off item 1; the leak is a word from item 2's headline.
    const leaked = direction({ rationale: 'Paris 街頭的球場風格正熱。' })
    expect(withoutSource([leaked], batch)).toEqual([])
  })

  it('cannot catch a name the batch never spelled that way', () => {
    // The documented ceiling: verbatim quoting only. "巴黎聖日耳曼" transliterates a headline that
    // says "Paris Saint-Germain", shares no token with it, and passes. Only the instructions stop
    // this one — which is why they forbid transliterating and paraphrasing, not just naming.
    const transliterated = direction({ rationale: '巴黎聖日耳曼聯名帶動的球場風格。' })
    expect(withoutSource([transliterated], batch)).toHaveLength(1)
  })

  it('does not let a short or common source word veto an unrelated direction', () => {
    // 'x' is one character and 'is'/'out' are under the Latin minimum: none may act as a name.
    const clean = direction({ label: '極簡黑白', styleQuery: 'minimal black white' })
    expect(
      withoutSource([clean], [{ signal: 'x', newsTitle: 'The KD 6 Is Out Now' }]),
    ).toHaveLength(1)
  })

  it('matches a Chinese name as a substring, since the tokens carry no spaces', () => {
    const leaked = direction({ rationale: '這波古裝熱潮來自蘭香如故的討論。' })
    expect(withoutSource([leaked], [{ signal: '蘭香如故', newsTitle: null }])).toEqual([])
  })
})
