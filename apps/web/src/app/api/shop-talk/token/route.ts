import { z } from 'zod'
import { SHOP_TALK_MODEL, SHOP_TALK_TOKEN_MS, shopTalkConfig } from '@/lib/shop-talk-config'
import { getI18n } from '@/i18n/server'
import { liveAccess } from '@/server/live-access'
import { shopTalkPrompt } from '@/server/shop-talk-prompt'
import { readTalkJson, TalkRequestError, talkHeaders } from '@/server/shop-talk-request'

export async function POST(request: Request) {
  const access = await liveAccess(request, 'voice')
  if (access.response) return access.response
  const { t } = await getI18n()
  try {
    z.object({})
      .strict()
      .parse(await readTalkJson(request))
    if (!process.env.GEMINI_API_KEY)
      return Response.json({ error: t.shopTalk.unavailable }, { status: 503, headers: talkHeaders })
    const { responseModalities, speechConfig, ...sessionConfig } = shopTalkConfig()
    // The SDK expands repeated tools into the invalid mask "tools.0". Explicit top-level
    // masks lock the entire tool list while leaving the resumption handle client-controlled.
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]),
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(Date.now() + SHOP_TALK_TOKEN_MS).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        bidiGenerateContentSetup: {
          model: `models/${SHOP_TALK_MODEL}`,
          generationConfig: { responseModalities, speechConfig },
          ...sessionConfig,
          systemInstruction: { parts: [{ text: shopTalkPrompt() }] },
        },
        fieldMask:
          'model,generationConfig,systemInstruction,inputAudioTranscription,outputAudioTranscription,tools,contextWindowCompression',
      }),
    })
    if (!response.ok) throw new Error('Token issuance failed')
    const token = z
      .object({ name: z.string().startsWith('auth_tokens/') })
      .parse(await response.json())
    if (!token.name) throw new Error('Missing token')
    return Response.json({ token: token.name }, { headers: talkHeaders })
  } catch (error) {
    const status =
      error instanceof TalkRequestError ? error.status : error instanceof z.ZodError ? 400 : 503
    return Response.json({ error: t.shopTalk.connectionError }, { status, headers: talkHeaders })
  } finally {
    access.release!()
  }
}
