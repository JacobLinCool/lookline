/**
 * Follow-up phrase tables of ENGINE_SPEC §1.8 (dialogue state) — shared by `intent/dialogue.ts`
 * and the lexicon scanner (so the phrases consume their span in a standalone parse).
 */
export type FollowUpKind =
  | 'cheaper'
  | 'pricier'
  | 'recolor'
  | 'more-formal'
  | 'more-casual'
  | 'only-group'
  | 'whole-outfit'
  | 'for-me'
  | 'different'
  | 'not-this'

export interface FollowUpPhrase {
  kind: FollowUpKind
  terms: readonly string[]
}

export const FOLLOW_UP_PHRASES: readonly FollowUpPhrase[] = [
  {
    kind: 'cheaper',
    terms: [
      '再便宜一點',
      '再便宜一些',
      '便宜一點',
      '便宜點',
      '便宜一些',
      '可以便宜一點嗎',
      'cheaper',
      'less expensive',
      'a bit cheaper',
      'lower the budget',
    ],
  },
  {
    kind: 'pricier',
    terms: [
      '貴一點也可以',
      '可以再貴一點',
      '貴一點沒關係',
      '可以貴一點',
      '預算可以再高',
      'can go higher',
      'pricier is fine',
      'can spend more',
      'a bit more expensive is fine',
    ],
  },
  {
    kind: 'more-formal',
    terms: ['正式一點', '再正式一點', 'more formal', 'dressier', 'a bit dressier'],
  },
  {
    kind: 'more-casual',
    terms: ['休閒一點', '再休閒一點', 'more casual', 'less formal', 'a bit more casual'],
  },
  {
    kind: 'whole-outfit',
    terms: [
      '整套',
      '幫我配一套',
      '配一套',
      '配整套',
      'whole outfit',
      'full outfit',
      'the whole look',
    ],
  },
  {
    kind: 'for-me',
    terms: [
      '給我自己',
      '我自己穿',
      '我自己要穿',
      '換成我自己',
      'for me instead',
      'for myself instead',
      'for me this time',
    ],
  },
  {
    kind: 'different',
    terms: [
      '換個風格',
      '別的風格',
      '換一種風格',
      '其他風格',
      'something different',
      'different style',
      'show me something else',
    ],
  },
  {
    kind: 'not-this',
    terms: [
      '不要這個',
      '不要那件',
      '不要這件',
      '不要這套',
      'not this one',
      'not that one',
      'not this',
    ],
  },
]

/** `換成X色 / 改X色 / X色的 / make it X / in X instead / X version` — the colour is resolved by the caller. */
export const RECOLOR_PATTERNS: readonly RegExp[] = [
  /換成\s*(.{1,4}?色)/,
  /改成?\s*(.{1,4}?色)/,
  /換\s*(.{1,4}?色)的?/,
  /^(.{1,4}?色)的$/,
  /make it ([a-z\- ]{2,20})$/,
  /in ([a-z\- ]{2,20}) instead/,
  /([a-z\- ]{2,20}) version$/,
  /^([a-z\- ]{2,20}) instead$/,
]

/** `只要上衣 / 只要X / just the top / only the X` — the group is resolved by the caller. */
export const ONLY_PATTERNS: readonly RegExp[] = [
  /只要\s*(.{1,8}?)(?:就好|就可以|$|，|,)/,
  /只需要\s*(.{1,8}?)(?:就好|$|，|,)/,
  /just the ([a-z\- ]{2,20})$/,
  /only the ([a-z\- ]{2,20})$/,
  /^just ([a-z\- ]{2,20})$/,
  /^only ([a-z\- ]{2,20})$/,
]
