import { describe, expect, it } from 'vitest'
import { readIntentStream } from './intent-stream'

function response(bytes: Uint8Array[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of bytes) controller.enqueue(chunk)
        controller.close()
      },
    }),
  )
}

describe('intent stream transport', () => {
  it('preserves split UTF-8 characters and newline boundaries', async () => {
    const events = [{ type: 'error', message: '請重試' }, { type: 'done' }]
    const bytes = new TextEncoder().encode(
      events.map((event) => JSON.stringify(event)).join('\n') + '\n',
    )
    const received: unknown[] = []
    await readIntentStream(response(Array.from(bytes, (byte) => new Uint8Array([byte]))), (event) =>
      received.push(event),
    )
    expect(received).toEqual(events)
  })

  it('rejects a truncated response without pretending completion', async () => {
    await expect(
      readIntentStream(
        response([new TextEncoder().encode('{"type":"error","message":"retry"}\n')]),
        () => {},
      ),
    ).rejects.toThrow('connection ended early')
    await expect(readIntentStream(new Response(null, { status: 503 }), () => {})).rejects.toThrow(
      'could not be loaded',
    )
  })
})
