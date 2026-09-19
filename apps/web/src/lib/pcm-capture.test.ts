import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it('captures 100ms mono PCM packets, clips safely, and never monitors input through the speaker', () => {
  const packets: ArrayBuffer[] = []
  let Processor: new () => {
    process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean
  }
  runInNewContext(readFileSync(new URL('../../public/pcm-capture.js', import.meta.url), 'utf8'), {
    AudioWorkletProcessor: class {
      port = {
        addEventListener() {},
        start() {},
        postMessage(data: ArrayBuffer) {
          packets.push(data)
        },
      }
    },
    registerProcessor(_name: string, constructor: typeof Processor) {
      Processor = constructor
    },
  })
  const processor = new Processor!()
  const input = Float32Array.from({ length: 1600 }, (_, i) => [0, 0.5, -0.5, 2, -2][i % 5]!)
  const output = new Float32Array(1600)
  processor.process([[input]], [[output]])
  expect(packets).toHaveLength(1)
  expect(packets[0]!.byteLength).toBe(3200)
  const data = new DataView(packets[0]!)
  expect(Array.from({ length: 5 }, (_, i) => data.getInt16(i * 2, true))).toEqual([
    0, 16384, -16384, 32767, -32768,
  ])
  expect(output.every((sample) => sample === 0)).toBe(true)
})
