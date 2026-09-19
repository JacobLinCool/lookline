import { describe, expect, it, vi } from 'vitest'
import { decodePcm, PcmPlayback } from './pcm-playback'

const packet = (values: number[]) => {
  const data = new DataView(new ArrayBuffer(values.length * 2))
  values.forEach((value, i) => data.setInt16(i * 2, value, true))
  return btoa(String.fromCharCode(...new Uint8Array(data.buffer)))
}
const contextFixture = () => {
  const sources: Array<{
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    onended?: () => void
  }> = []
  const ramps: number[] = []
  const context = {
    currentTime: 1,
    destination: {},
    createBuffer: (_channels: number, length: number, rate: number) => ({
      duration: length / rate,
      copyToChannel: vi.fn(),
    }),
    createGain: () => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: (_value: number, time: number) => ramps.push(time),
      },
    }),
    createBufferSource: () => {
      const source = {
        connect: (node: unknown) => node,
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: undefined as (() => void) | undefined,
      }
      sources.push(source)
      return source
    },
  }
  const speaking = vi.fn()
  return {
    context,
    sources,
    ramps,
    speaking,
    player: new PcmPlayback(context as unknown as AudioContext, speaking),
  }
}

describe('PCM playback', () => {
  it('decodes signed little-endian samples without reinterpreting bytes or clipping', () => {
    expect([...decodePcm(packet([-32768, -16384, 0, 16384, 32767]))]).toEqual([
      -1,
      -0.5,
      0,
      0.5,
      32767 / 32768,
    ])
    expect(() => decodePcm(btoa('x'))).toThrow('Invalid PCM')
    expect(() => decodePcm('')).toThrow('Invalid PCM')
  })
  it('absorbs packet arrival jitter without gaps, overlaps or a fade on every packet', () => {
    const { context, sources, ramps, player } = contextFixture()
    const audio = packet(Array.from({ length: 2400 }, () => 2000))
    player.enqueue(audio)
    context.currentTime = 1.11
    player.enqueue(audio)
    expect(sources[0]!.start).toHaveBeenCalledWith(1.04)
    expect(sources[1]!.start.mock.calls[0]![0]).toBeCloseTo(1.14)
    expect(ramps).toHaveLength(1)
    context.currentTime = 2
    player.enqueue(audio)
    expect(sources[2]!.start).toHaveBeenCalledWith(2.04)
    expect(ramps).toHaveLength(2)
  })
  it('clears playing and scheduled audio immediately, and does not replay it after resuming', () => {
    const { context, sources, player, speaking } = contextFixture()
    const audio = packet([0, 100, 0])
    player.enqueue(audio)
    player.enqueue(audio)
    player.clear()
    expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true)
    expect(speaking).toHaveBeenLastCalledWith(false)
    context.currentTime = 4
    player.enqueue(audio)
    sources[0]!.onended?.()
    expect(speaking).toHaveBeenLastCalledWith(true)
    expect(sources[2]!.start).toHaveBeenCalledWith(4.04)
    sources[2]!.onended?.()
    expect(speaking).toHaveBeenLastCalledWith(false)
  })
})
