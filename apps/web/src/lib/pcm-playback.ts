/** Live audio is mono signed 16-bit little-endian PCM at 24 kHz. */
export function decodePcm(encoded: string): Float32Array<ArrayBuffer> {
  const raw = atob(encoded)
  if (!raw.length || raw.length % 2) throw new Error('Invalid PCM packet')
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const samples = new Float32Array(bytes.length / 2)
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768
  return samples
}

/** Keep a short scheduling lead; contiguous packets share one sample-accurate timeline. */
export class PcmPlayback {
  private nextAt = 0
  private sources = new Set<AudioBufferSourceNode>()
  constructor(
    private context: AudioContext,
    private speaking: (value: boolean) => void,
  ) {}

  enqueue(encoded: string) {
    const samples = decodePcm(encoded)
    const buffer = this.context.createBuffer(1, samples.length, 24_000)
    buffer.copyToChannel(samples, 0)
    const source = this.context.createBufferSource()
    source.buffer = buffer
    const gain = this.context.createGain()
    source.connect(gain).connect(this.context.destination)
    const fresh = this.nextAt <= this.context.currentTime
    const at = fresh ? this.context.currentTime + 0.04 : this.nextAt
    // Fade only a new stream/underrun boundary, never every packet (which adds rhythmic gaps).
    if (fresh) {
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(1, at + Math.min(0.004, buffer.duration))
    }
    this.nextAt = at + buffer.duration
    this.sources.add(source)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      this.sources.delete(source)
      if (!this.sources.size) this.speaking(false)
    }
    source.start(at)
    this.speaking(true)
  }

  clear() {
    // onended disconnects each graph, even when a scheduled source has not started yet.
    for (const source of this.sources) source.stop()
    this.sources.clear()
    this.nextAt = 0
    this.speaking(false)
  }
}
