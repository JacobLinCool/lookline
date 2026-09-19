import type { LiveServerMessage } from '@google/genai'
import type { ConversationEvent } from '@lookline/engine/conversation'
import { connectTalkSocket, type TalkSocket } from './talk-socket'
import { liveConversationTurns, type TalkConversation } from './talk-conversation'

export type TalkPhase = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'ended'
type LiveCallbacks = {
  phase: (phase: TalkPhase) => void
  microphone: (enabled: boolean) => void
  speaker: (enabled: boolean) => void
  speaking: (speaking: boolean) => void
  error: (kind: 'connectionError' | 'permissionError' | 'audioError') => void
}

/** Browser-only duplex audio. Tokens are ephemeral; permanent keys never enter the browser. */
export class ShopTalkLive {
  private session?: TalkSocket
  private connecting?: Promise<void>
  private controller = new AbortController()
  private generation = 0
  private handle?: string
  private closed = false
  private capture?: AudioContext
  private worklet?: AudioWorkletNode
  private stream?: MediaStream
  private microphone = false
  private micGeneration = 0
  private output?: AudioContext
  private speaker = false
  private nextAudioAt = 0
  private playing = new Set<AudioBufferSourceNode>()
  private expiry?: ReturnType<typeof setTimeout>
  private pendingContext: ConversationEvent[] = []
  constructor(
    private history: TalkConversation,
    private base: object,
    private callbacks: LiveCallbacks,
  ) {}

  async connect() {
    if (this.session) return
    if (this.connecting) return this.connecting
    this.closed = false
    this.controller = new AbortController()
    this.connecting = this.open().finally(() => {
      this.connecting = undefined
    })
    return this.connecting
  }
  private async open(): Promise<void> {
    this.callbacks.phase('connecting')
    const generation = ++this.generation
    const signal = this.controller.signal
    try {
      const response = await fetch('/api/shop-talk/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      })
      const data = await response.json()
      if (!response.ok || typeof data.token !== 'string') throw new Error('Token unavailable')
      const handle = this.handle
      const session = await connectTalkSocket(
        data.token,
        handle,
        signal,
        (message) => {
          if (generation === this.generation && !this.closed) this.receive(message)
        },
        () => {
          if (generation === this.generation && !this.closed) this.failed()
        },
      )
      signal.throwIfAborted()
      if (generation !== this.generation || this.closed) {
        session.close()
        return
      }
      this.session = session
      if (!handle)
        session.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [
                { text: `[Initial shopping filters; context only]\n${JSON.stringify(this.base)}` },
              ],
            },
            ...liveConversationTurns(this.history.events),
          ],
          turnComplete: false,
        })
      else if (this.pendingContext.length)
        session.sendClientContent({
          turns: liveConversationTurns(this.pendingContext),
          turnComplete: false,
        })
      this.pendingContext = []
      this.callbacks.phase('connected')
      // Mint a fresh token before the ephemeral credential expires, preserving the session handle.
      this.expiry = setTimeout(() => void this.resume(), 25 * 60_000)
    } catch {
      if (generation !== this.generation || this.closed) return
      // A rejected resumption handle is retried once with the exact recorded conversation.
      if (this.handle && !signal.aborted) {
        this.handle = undefined
        return this.open()
      }
      this.failed()
      throw new Error('Live connection failed')
    }
  }
  private receive(message: LiveServerMessage) {
    if (message.sessionResumptionUpdate)
      this.handle = message.sessionResumptionUpdate.resumable
        ? message.sessionResumptionUpdate.newHandle
        : undefined
    if (message.goAway) {
      void this.resume()
      return
    }
    const content = message.serverContent
    if (!content) return
    if (content.interrupted) this.clearPlayback()
    this.history.receive(content, this.microphone)
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/pcm'))
        this.play(part.inlineData.data)
    }
    if (content.turnComplete && !this.playing.size) this.callbacks.speaking(false)
  }
  private async resume() {
    if (this.closed || this.connecting) return
    const mic = this.microphone
    this.generation++
    this.session?.close()
    this.session = undefined
    clearTimeout(this.expiry)
    this.clearPlayback()
    this.stopMicrophone()
    try {
      await this.connect()
      if (mic && !this.closed) await this.setMicrophone(true)
    } catch {
      /* open reports the disconnected state; the user can retry. */
    }
  }
  async send(text: string) {
    await this.connect()
    if (!this.session || this.closed) throw new Error('Not connected')
    this.clearPlayback()
    this.history.send(text)
    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true,
    })
  }
  context(event: ConversationEvent) {
    if (this.session)
      this.session.sendClientContent({ turns: liveConversationTurns([event]), turnComplete: false })
    else this.pendingContext.push(event)
  }
  async setSpeaker(enabled: boolean) {
    this.speaker = enabled
    this.callbacks.speaker(enabled)
    if (!enabled) {
      this.clearPlayback()
      return
    }
    try {
      this.output ??= new AudioContext()
      await this.output.resume()
    } catch {
      this.speaker = false
      this.callbacks.speaker(false)
      this.callbacks.error('audioError')
    }
  }
  private play(encoded: string) {
    if (!this.speaker || !this.output || this.output.state !== 'running') return
    const raw = atob(encoded)
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0))
    if (bytes.byteLength % 2) return
    const view = new DataView(bytes.buffer)
    const buffer = this.output.createBuffer(1, bytes.byteLength / 2, 24_000)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768
    const source = this.output.createBufferSource()
    source.buffer = buffer
    source.connect(this.output.destination)
    const at = Math.max(this.output.currentTime, this.nextAudioAt)
    this.nextAudioAt = at + buffer.duration
    this.playing.add(source)
    source.onended = () => {
      source.disconnect()
      this.playing.delete(source)
      if (!this.playing.size) this.callbacks.speaking(false)
    }
    source.start(at)
    this.callbacks.speaking(true)
  }
  private clearPlayback() {
    for (const source of this.playing) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
    this.playing.clear()
    this.nextAudioAt = 0
    this.callbacks.speaking(false)
  }
  async setMicrophone(enabled: boolean) {
    if (!enabled) {
      this.stopMicrophone()
      return
    }
    if (this.microphone) return
    this.closed = false
    const generation = ++this.micGeneration
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      })
      if (generation !== this.micGeneration || this.closed) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      this.stream = stream
      const capture = new AudioContext({ sampleRate: 16_000 })
      this.capture = capture
      if (capture.sampleRate !== 16_000) throw new Error('16kHz capture required')
      await capture.resume()
      await Promise.all([capture.audioWorklet.addModule('/pcm-capture.js'), this.connect()])
      if (generation !== this.micGeneration || this.closed) return
      const worklet = new AudioWorkletNode(capture, 'pcm-capture')
      this.worklet = worklet
      const source = capture.createMediaStreamSource(stream)
      const silent = capture.createGain()
      silent.gain.value = 0
      source.connect(worklet).connect(silent).connect(capture.destination)
      worklet.onprocessorerror = () => {
        this.stopMicrophone()
        this.callbacks.error('audioError')
      }
      worklet.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        if (!this.microphone || !(data instanceof ArrayBuffer)) return
        try {
          this.session?.sendRealtimeInput({
            audio: {
              data: btoa(String.fromCharCode(...new Uint8Array(data))),
              mimeType: 'audio/pcm;rate=16000',
            },
          })
        } catch {
          this.failed()
        }
      }
      this.microphone = true
      this.callbacks.microphone(true)
    } catch (error) {
      if (generation !== this.micGeneration || this.closed) return
      this.stopMicrophone()
      this.callbacks.error(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'permissionError'
          : 'audioError',
      )
    }
  }
  private stopMicrophone() {
    this.micGeneration++
    const wasEnabled = this.microphone
    this.microphone = false
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = undefined
    this.worklet?.disconnect()
    this.worklet = undefined
    if (this.capture?.state !== 'closed') void this.capture?.close()
    this.capture = undefined
    if (wasEnabled) {
      try {
        this.session?.sendRealtimeInput({ audioStreamEnd: true })
      } catch {
        /* Socket already closed. */
      }
    }
    this.callbacks.microphone(false)
  }
  private failed() {
    this.generation++
    this.controller.abort()
    this.session?.close()
    this.session = undefined
    clearTimeout(this.expiry)
    this.stopMicrophone()
    this.clearPlayback()
    this.history.finish(true)
    this.callbacks.phase('disconnected')
    this.callbacks.error('connectionError')
  }
  close() {
    this.closed = true
    this.generation++
    this.controller.abort()
    clearTimeout(this.expiry)
    this.stopMicrophone()
    this.clearPlayback()
    this.session?.close()
    this.session = undefined
    if (this.output?.state !== 'closed') void this.output?.close()
    this.output = undefined
    this.speaker = false
    this.callbacks.speaker(false)
    this.history.finish(true)
    this.callbacks.phase('ended')
  }
}
