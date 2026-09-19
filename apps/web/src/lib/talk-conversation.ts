import type { LiveServerContent } from '@google/genai'
import {
  conversationSchema,
  type ConversationEvent,
  type ConversationMessage,
} from '@lookline/engine/conversation'
import type { FilterState } from '@lookline/engine'
import { advanceTranscript, emptyTranscript } from './transcript'

/** Owns transcript identity; fragments revise a turn rather than appending chat bubbles. */
export class TalkConversation {
  events: ConversationEvent[] = []
  private nextId = 0
  private userId?: string
  private assistantId?: string
  private input = emptyTranscript()
  private interruptedCompletion = false
  constructor(private changed: (final: boolean) => void) {}
  private id() {
    return `turn-${++this.nextId}`
  }
  private message(role: 'user' | 'assistant'): string {
    const id = this.id()
    this.events = [...this.events, { kind: 'message', id, role, text: '', status: 'partial' }]
    return id
  }
  private revise(id: string, patch: Partial<Pick<ConversationMessage, 'text' | 'status'>>) {
    this.events = this.events.map((event) =>
      event.id === id && event.kind === 'message' ? { ...event, ...patch } : event,
    )
  }
  private text(id: string) {
    const event = this.events.find((e) => e.id === id)
    return event?.kind === 'message' ? event.text : ''
  }
  validate() {
    return conversationSchema.safeParse(this.events).success
  }
  send(text: string) {
    this.finish(true)
    const event: ConversationMessage = {
      kind: 'message',
      id: this.id(),
      role: 'user',
      text,
      status: 'complete',
    }
    conversationSchema.parse([...this.events, event])
    this.events = [...this.events, event]
    this.userId = event.id
    this.changed(true)
  }
  edit(before: FilterState, after: FilterState, keywords?: string[]) {
    const values: FilterState = {}
    const cleared: Array<keyof FilterState> = []
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)]) as Set<
      keyof FilterState
    >) {
      if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue
      if (after[key] === undefined) cleared.push(key)
      else Object.assign(values, { [key]: after[key] })
    }
    if (!cleared.length && !Object.keys(values).length && keywords === undefined) return undefined
    const event: ConversationEvent = {
      kind: 'filters',
      id: this.id(),
      values,
      cleared,
      ...(keywords !== undefined ? { keywords } : {}),
    }
    conversationSchema.parse([...this.events, event])
    this.events = [...this.events, event]
    this.changed(true)
    return event
  }
  receive(content: LiveServerContent, voiceInput: boolean) {
    let changed = false
    const hasInput = Boolean(content.inputTranscription || content.interimInputTranscription)
    const hasOutput = Boolean(
      content.outputTranscription?.text || content.modelTurn?.parts?.some((p) => p.inlineData),
    )
    // Reserve the input slot before output: transcription and audio can arrive out of order.
    if ((hasInput || (hasOutput && voiceInput)) && !this.userId) this.userId = this.message('user')
    if (hasInput && this.userId) {
      const update = advanceTranscript(this.input, content)
      this.input = update.state
      this.revise(this.userId, { text: update.text })
      changed = true
    }
    if (hasOutput && !this.assistantId) this.assistantId = this.message('assistant')
    if (content.outputTranscription?.text && this.assistantId) {
      this.revise(this.assistantId, {
        text: this.text(this.assistantId) + content.outputTranscription.text,
      })
      changed = true
    }
    // A locally submitted text turn may precede the server's acknowledgement of the old interruption.
    if (content.interrupted && !this.assistantId) this.interruptedCompletion = true
    if (content.interrupted && this.assistantId) this.finish(true)
    else if (content.turnComplete) {
      if (!this.interruptedCompletion) this.finish()
      this.interruptedCompletion = false
    } else if (changed) this.changed(false)
  }
  interrupt() {
    this.finish(true)
  }
  finish(interrupted = false) {
    const active = Boolean(this.userId || this.assistantId)
    if (this.userId) this.revise(this.userId, { status: 'complete' })
    if (this.assistantId)
      this.revise(this.assistantId, { status: interrupted ? 'interrupted' : 'complete' })
    this.userId = undefined
    this.assistantId = undefined
    this.input = emptyTranscript()
    this.events = this.events.filter((e) => e.kind !== 'message' || e.text.trim())
    if (active) this.changed(true)
  }
}

/** Context updates are application events, not invented shopper speech. */
export function liveConversationTurns(events: readonly ConversationEvent[]) {
  return events.flatMap((event) => {
    if (event.kind === 'filters')
      return [
        {
          role: 'user',
          parts: [
            {
              text: `[Manual filter update; context only, do not respond]\n${JSON.stringify(event)}`,
            },
          ],
        },
      ]
    return event.text.trim()
      ? [{ role: event.role === 'assistant' ? 'model' : 'user', parts: [{ text: event.text }] }]
      : []
  })
}
