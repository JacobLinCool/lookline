import type { Session } from '@google/genai'
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
  constructor(
    private callbacks: Callbacks,
    languageCodes: readonly VoiceLanguageCode[],
  ) {
    this.languageCodes = [...languageCodes]
  }

  async start() {
    this.callbacks.phase('connecting')
    this.connectTimer = setTimeout(
      () => this.fail('Voice took too long to connect. Please try again.'),
      10_000,
    )
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
          onerror: () =>
            this.fail('Voice connection failed. Your saved filters are still available.'),
          onclose: () => {
            if (!this.closed) this.fail('Voice disconnected. You can reconnect or keep typing.')
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
      node.addEventListener('processorerror', () =>
        this.fail('Microphone processing failed. Please reconnect.'),
      )
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
          this.fail('Audio could not be sent. Please reconnect.')
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
      if (!this.closed)
        this.fail(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Allow microphone access to use voice filters.'
            : 'Voice could not connect. Please try again or keep typing.',
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
      this.fail('Could not finish transcription. Unconfirmed speech was not applied.')
      return
    }
    this.finishTimer = setTimeout(() => {
      if (this.transcript.interim || this.transcript.fragment)
        this.callbacks.error(
          'The last words were not finalized. Review the preview before applying.',
        )
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
