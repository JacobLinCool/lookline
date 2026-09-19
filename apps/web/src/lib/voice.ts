import type { Session } from '@google/genai'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'
import { CATALOGS, type Messages } from '@/i18n/messages'
import { advanceTranscript, emptyTranscript } from './transcript'
import {
  transcribeConfig,
  TRANSCRIBE_MODEL,
  VOICE_SESSION_MS,
  type VoiceLanguageCode,
} from './voice-config'

export type VoicePhase = 'connecting' | 'listening' | 'finishing' | 'idle'
interface Callbacks {
  phase: (phase: VoicePhase) => void
  transcript: (text: string, final: boolean) => void
  error: (message: string) => void
}

/** One capture session; all exits release microphone, audio graph, timers and socket. */
export class VoiceCapture {
  private controller = new AbortController()
  private stream?: MediaStream
  private audio?: AudioContext
  private node?: AudioWorkletNode
  private session?: Session
  private connectTimer?: ReturnType<typeof setTimeout>
  private audioEnded = false
  private expiry?: ReturnType<typeof setTimeout>
  private finishTimer?: ReturnType<typeof setTimeout>
  private flushTimer?: ReturnType<typeof setTimeout>
  private flushed?: () => void
  private stopping = false
  private closed = false
  private transcript = emptyTranscript()
  private languageCodes: VoiceLanguageCode[]
  /** What the shopper is told when capture cannot continue, in their language. */
  private copy: Messages['shop']['voice']
  constructor(
    private callbacks: Callbacks,
    languageCodes: readonly VoiceLanguageCode[],
    locale: Locale = DEFAULT_LOCALE,
  ) {
    this.languageCodes = [...languageCodes]
    this.copy = CATALOGS[locale].shop.voice
  }

  async start() {
    this.callbacks.phase('connecting')
    this.connectTimer = setTimeout(() => this.fail(this.copy.connectTimeout), 10_000)
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode)
        throw new Error(
          'This browser cannot stream microphone audio. You can type filters instead.',
        )
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      })
      if (this.closed) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      this.stream = media
      const audio = new AudioContext({ sampleRate: 16000 })
      this.audio = audio
      if (audio.sampleRate !== 16000)
        throw new Error('16 kHz microphone capture is unavailable in this browser.')
      await audio.resume()
      const [response, sdk] = await Promise.all([
        fetch('/api/voice/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ languageCodes: this.languageCodes }),
          signal: this.controller.signal,
        }),
        import('@google/genai'),
        audio.audioWorklet.addModule('/pcm-capture.js'),
      ])
      this.controller.signal.throwIfAborted()
      const token = await response.json()
      if (!response.ok || typeof token.token !== 'string')
        throw new Error(token.error ?? 'Voice could not connect.')
      const ai = new sdk.GoogleGenAI({
        apiKey: token.token,
        httpOptions: { apiVersion: 'v1alpha' },
      })
      const session = await ai.live.connect({
        model: TRANSCRIBE_MODEL,
        config: {
          ...transcribeConfig(this.languageCodes),
          responseModalities: [sdk.Modality.TEXT],
        },
        callbacks: {
          onmessage: (message) => {
            if (this.closed || !message.serverContent) return
            const update = advanceTranscript(this.transcript, message.serverContent)
            this.transcript = update.state
            if (
              message.serverContent.inputTranscription ||
              message.serverContent.interimInputTranscription
            )
              this.callbacks.transcript(update.text, update.finalized)
            if (this.audioEnded && update.finalized) this.cancel()
          },
          onerror: () => this.fail(this.copy.connectionFailed),
          onclose: () => {
            if (!this.closed) this.fail(this.copy.disconnected)
          },
        },
      })
      if (this.closed) {
        session.close()
        return
      }
      this.session = session
      const node = new AudioWorkletNode(audio, 'pcm-capture', {
        channelCount: 1,
        channelCountMode: 'explicit',
      })
      this.node = node
      node.addEventListener('processorerror', () => this.fail(this.copy.processingFailed))
      node.port.addEventListener('message', ({ data }: MessageEvent<ArrayBuffer | string>) => {
        if (data === 'flushed') {
          this.flushed?.()
          return
        }
        if (this.closed || !(data instanceof ArrayBuffer)) return
        try {
          const bytes = new Uint8Array(data)
          session.sendRealtimeInput({
            audio: { data: btoa(String.fromCharCode(...bytes)), mimeType: 'audio/pcm;rate=16000' },
          })
        } catch {
          this.fail(this.copy.audioFailed)
        }
      })
      node.port.start()
      const source = audio.createMediaStreamSource(media)
      const mute = audio.createGain()
      mute.gain.value = 0
      source.connect(node).connect(mute).connect(audio.destination)
      clearTimeout(this.connectTimer)
      this.callbacks.phase('listening')
      this.expiry = setTimeout(() => void this.stop(), VOICE_SESSION_MS - 5_000)
    } catch (error) {
      // Only these two lines reach the shopper; the messages thrown above stay in the console.
      if (!this.closed)
        this.fail(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? this.copy.permission
            : this.copy.connectFailed,
        )
    }
  }

  async stop() {
    if (this.closed || this.stopping) return
    if (!this.session) {
      this.cancel()
      return
    }
    this.stopping = true
    this.callbacks.phase('finishing')
    this.stream?.getTracks().forEach((track) => track.stop())
    await new Promise<void>((resolve) => {
      this.flushed = resolve
      this.node?.port.postMessage('flush', [])
      this.flushTimer = setTimeout(resolve, 300)
    })
    clearTimeout(this.flushTimer)
    this.node?.disconnect()
    if (this.audio?.state !== 'closed') void this.audio?.close()
    if (this.closed) return
    try {
      this.audioEnded = true
      this.session.sendRealtimeInput({ audioStreamEnd: true })
    } catch {
      this.fail(this.copy.finishFailed)
      return
    }
    this.finishTimer = setTimeout(() => {
      if (this.transcript.interim || this.transcript.fragment)
        this.callbacks.error(this.copy.unfinalized)
      this.cancel()
    }, 2_500)
  }

  cancel() {
    if (this.closed) return
    this.closed = true
    this.controller.abort()
    clearTimeout(this.connectTimer)
    clearTimeout(this.expiry)
    clearTimeout(this.finishTimer)
    clearTimeout(this.flushTimer)
    this.flushed?.()
    this.stream?.getTracks().forEach((track) => track.stop())
    this.node?.disconnect()
    if (this.audio?.state !== 'closed') void this.audio?.close()
    this.session?.close()
    this.callbacks.phase('idle')
  }
  private fail(message: string) {
    if (this.closed) return
    this.callbacks.error(message)
    this.cancel()
  }
}
