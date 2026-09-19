import { describe, expect, it, vi } from 'vitest'
import { TalkConversation, liveConversationTurns } from './talk-conversation'

describe('duplex conversation timeline', () => {
  it('replaces interim input, appends output fragments and maintains a single message per role', () => {
    const changed = vi.fn()
    const history = new TalkConversation(changed)
    history.receive({ interimInputTranscription: { text: '黑' } }, true)
    history.receive({ interimInputTranscription: { text: '黑色外套' } }, true)
    history.receive(
      {
        inputTranscription: { text: '黑色外套', finished: true },
        outputTranscription: { text: '想要' },
      },
      true,
    )
    history.receive({ outputTranscription: { text: '什麼材質？' }, turnComplete: true }, true)
    expect(history.events).toMatchObject([
      { role: 'user', text: '黑色外套', status: 'complete' },
      { role: 'assistant', text: '想要什麼材質？', status: 'complete' },
    ])
    expect(changed).toHaveBeenLastCalledWith(true)
  })
  it('orders delayed input before assistant output and retains interrupted text', () => {
    const history = new TalkConversation(() => {})
    history.receive({ outputTranscription: { text: '推薦棉質' } }, true)
    history.receive({ inputTranscription: { text: '幫我挑外套' } }, true)
    history.receive({ interrupted: true }, true)
    expect(history.events).toMatchObject([
      { role: 'user', text: '幫我挑外套' },
      { role: 'assistant', text: '推薦棉質', status: 'interrupted' },
    ])
  })
  it('records changed fields without erasing other dialogue and replays explicit app context', () => {
    const history = new TalkConversation(() => {})
    history.send('外套')
    const event = history.edit(
      { colorFamilies: ['black'], priceMax: 3000 },
      { priceMax: 3000, materials: ['linen'] },
    )
    expect(event).toMatchObject({
      kind: 'filters',
      values: { materials: ['linen'] },
      cleared: ['colorFamilies'],
    })
    expect(history.events).toHaveLength(2)
    expect(liveConversationTurns(history.events)[1]?.parts[0]?.text).toContain('context only')
  })
  it('does not append an oversized typed message', () => {
    const history = new TalkConversation(() => {})
    expect(() => history.send('衣'.repeat(9000))).toThrow()
    expect(history.events).toEqual([])
  })
})
