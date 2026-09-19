import { conversationRequestSchema } from '@lookline/engine/conversation'
import { SHOP_TALK_BODY_BYTES } from '@/lib/shop-talk-config'

export class TalkRequestError extends Error {
  constructor(public status: number) {
    super('Invalid conversation request')
  }
}

/** Enforce actual streamed bytes, including requests without Content-Length. */
export async function readTalkJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new TalkRequestError(400)
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > SHOP_TALK_BODY_BYTES) {
        await reader.cancel()
        throw new TalkRequestError(413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new TalkRequestError(400)
  }
}

export async function readTalkRequest(request: Request) {
  const parsed = conversationRequestSchema.safeParse(await readTalkJson(request))
  if (!parsed.success)
    throw new TalkRequestError(
      parsed.error.issues.some((issue) => issue.message.includes('Conversation is full'))
        ? 413
        : 400,
    )
  return parsed.data
}

export const talkHeaders = { 'Cache-Control': 'no-store' }
