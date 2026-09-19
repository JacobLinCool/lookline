import { describe, expect, it } from 'vitest'
import { parseIntentOffline } from './lexicon-parser'
import { FIXTURE_CTX, withUser } from './fixtures'

const rec = (u: string, ctx = FIXTURE_CTX) => {
  const r = parseIntentOffline(u, ctx)
  return {
    kind: r.recipient.kind,
    relation: r.recipient.relation,
    department: r.department,
    label: r.recipient.label,
  }
}

describe('recipient rows (§1.4.4)', () => {
  it('family and partners', () => {
    expect(rec('送爸爸一條皮帶')).toMatchObject({
      kind: 'other',
      relation: 'father',
      department: 'men',
    })
    expect(rec('a scarf for my mom')).toMatchObject({
      kind: 'other',
      relation: 'mother',
      department: 'women',
      label: 'my mom',
    })
    expect(rec('gift for my boyfriend')).toMatchObject({
      kind: 'other',
      relation: 'partner',
      department: 'men',
    })
    expect(rec('送老婆的包')).toMatchObject({
      kind: 'other',
      relation: 'spouse',
      department: 'women',
    })
    expect(rec('a watch for my husband')).toMatchObject({
      kind: 'other',
      relation: 'spouse',
      department: 'men',
    })
    expect(rec('送兒子的外套')).toMatchObject({
      kind: 'other',
      relation: 'child',
      department: 'kids',
    })
    expect(rec('送成年的兒子一件外套')).toMatchObject({ relation: 'child', department: 'men' })
    expect(rec('a hoodie for my 20 years old daughter')).toMatchObject({
      relation: 'child',
      department: 'women',
    })
    expect(rec('送姪女一件洋裝')).toMatchObject({ relation: 'child', department: 'kids' })
    expect(rec('a cap for my brother')).toMatchObject({ relation: 'sibling', department: 'men' })
    expect(rec('送姊姊圍巾')).toMatchObject({ relation: 'sibling', department: 'women' })
  })

  it('partner / friend / colleague / boss without a department ask a non-blocking question', () => {
    const r = parseIntentOffline('gift for my partner', FIXTURE_CTX)
    expect(r.recipient).toMatchObject({ kind: 'other', relation: 'partner' })
    expect(r.department).toBe('unisex')
    expect(r.clarifications.find((c) => c.slot === 'recipient.department')?.blocking).toBe(false)
    expect(parseIntentOffline('送同事的禮物', FIXTURE_CTX).recipient.relation).toBe('colleague')
    expect(parseIntentOffline('a present for my boss', FIXTURE_CTX).recipient.relation).toBe('boss')
    expect(parseIntentOffline('送朋友的生日禮物', FIXTURE_CTX).recipient).toMatchObject({
      kind: 'other',
      relation: 'friend',
    })
  })

  it('朋友婚禮 stays self', () => {
    expect(rec('朋友婚禮要穿的')).toMatchObject({ kind: 'self', department: 'women' })
  })

  it('for a guy / for her / kids / undisclosed', () => {
    expect(rec('a hoodie for a guy')).toMatchObject({
      kind: 'other',
      relation: 'unknown',
      department: 'men',
      label: 'a guy',
    })
    expect(rec('a hoodie for a guy', withUser('men'))).toMatchObject({
      kind: 'self',
      department: 'men',
    })
    expect(rec('a dress for her')).toMatchObject({ kind: 'other', department: 'women' })
    expect(rec('童裝外套')).toMatchObject({ department: 'kids' })
    expect(rec('a hoodie, rather not say who it is for')).toMatchObject({
      kind: 'undisclosed',
      department: 'unisex',
    })
  })

  it('contact names resolve as recipients', () => {
    expect(rec('a bracelet for Alice')).toMatchObject({
      kind: 'other',
      relation: 'friend',
      department: 'women',
      label: 'Alice',
    })
  })

  it('department precedence and the blocking question', () => {
    expect(rec('女裝的帽T', withUser('men'))).toMatchObject({ kind: 'self', department: 'women' })
    const r = parseIntentOffline('a black hoodie', withUser(undefined))
    expect(r.department).toBe('unisex')
    expect(r.clarifications).toEqual([
      expect.objectContaining({ slot: 'department', blocking: true }),
    ])
    expect(parseIntentOffline('a black hoodie', withUser('women')).clarifications).toEqual([])
  })
})
