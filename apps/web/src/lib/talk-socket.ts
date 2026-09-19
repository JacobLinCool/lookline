import type { Content, LiveSendRealtimeInputParameters, LiveServerMessage } from '@google/genai'
import { SHOP_TALK_MODEL } from './shop-talk-config'

export interface TalkSocket {
  sendClientContent: (input: { turns: Content[]; turnComplete: boolean }) => void
  sendRealtimeInput: (input: LiveSendRealtimeInputParameters) => void
  close: () => void
}

/** An abortable Live handshake. The server-issued token supplies the locked session configuration. */
export function connectTalkSocket(
  token: string,
  handle: string | undefined,
  signal: AbortSignal,
  onMessage: (message: LiveServerMessage) => void,
  onDisconnect: () => void,
): Promise<TalkSocket> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    if (!token.startsWith('auth_tokens/')) throw new Error('An ephemeral token is required')
    const socket = new WebSocket(
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`,
    )
    socket.binaryType = 'arraybuffer'
    let ready = false
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      socket.onopen = null
      socket.close()
    }
    const fail = () => {
      if (closed) return
      const wasReady = ready
      close()
      if (wasReady) onDisconnect()
      else reject(new Error('Live connection failed'))
    }
    const abort = () => {
      close()
      if (!ready) reject(signal.reason)
    }
    const timeout = setTimeout(fail, 10_000)
    signal.addEventListener('abort', abort, { once: true })
    const send = (message: unknown) => {
      if (closed || socket.readyState !== WebSocket.OPEN) throw new Error('Live is disconnected')
      socket.send(JSON.stringify(message))
    }
    socket.onopen = () =>
      send({
        setup: { model: `models/${SHOP_TALK_MODEL}`, sessionResumption: handle ? { handle } : {} },
      })
    socket.onerror = fail
    socket.onclose = fail
    socket.onmessage = (event) => {
      let message: LiveServerMessage
      try {
        message = JSON.parse(
          typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data),
        )
      } catch {
        fail()
        return
      }
      if (message.setupComplete && !ready) {
        ready = true
        clearTimeout(timeout)
        resolve({
          sendClientContent: (input) => send({ clientContent: input }),
          sendRealtimeInput: (input) => send({ realtimeInput: input }),
          close,
        })
      }
      if (ready) onMessage(message)
    }
  })
}
