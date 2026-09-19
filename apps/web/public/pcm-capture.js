/* A 16 kHz AudioContext supplies mono samples; send 100 ms little-endian PCM packets. */
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new ArrayBuffer(3200)
    this.view = new DataView(this.buffer)
    this.used = 0
    this.port.addEventListener('message', ({ data }) => {
      if (data === 'flush') {
        this.emit()
        this.port.postMessage('flushed', [])
      }
    })
    this.port.start()
  }
  emit() {
    if (this.used) {
      const packet = this.buffer.slice(0, this.used * 2)
      this.port.postMessage(packet, [packet])
      this.used = 0
    }
  }
  process(inputs) {
    const samples = inputs[0]?.[0]
    if (samples)
      for (const sample of samples) {
        const value = Math.max(-1, Math.min(1, sample))
        this.view.setInt16(this.used++ * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
        if (this.used === 1600) this.emit()
      }
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)
