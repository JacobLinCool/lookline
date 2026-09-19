import { GoogleGenAI, Modality } from '@google/genai'
import {
  isVoiceLanguageSelection,
  transcribeConfig,
  TRANSCRIBE_MODEL,
  VOICE_SESSION_MS,
} from '@/lib/voice-config'
import { getMessages } from '@/i18n/server'
import { liveAccess } from '@/server/live-access'

export async function POST(request: Request) {
  const access = await liveAccess(request, 'voice')
  if (access.response) return access.response
  const { errors } = (await getMessages()).ui
  try {
    const body: unknown = await request.json().catch(() => null)
    if (
      !body ||
      typeof body !== 'object' ||
      !('languageCodes' in body) ||
      Object.keys(body).length !== 1 ||
      !isVoiceLanguageSelection(body.languageCodes)
    )
      return Response.json({ error: errors.voiceLanguages }, { status: 400 })
    if (!process.env.GEMINI_API_KEY)
      return Response.json({ error: errors.voiceUnavailable }, { status: 503 })
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { apiVersion: 'v1alpha' },
    })
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + VOICE_SESSION_MS).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        liveConnectConstraints: {
          model: TRANSCRIBE_MODEL,
          config: { ...transcribeConfig(body.languageCodes), responseModalities: [Modality.TEXT] },
        },
        lockAdditionalFields: [],
        abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(5_000)]),
      },
    })
    if (!token.name) throw new Error('No voice session token was returned.')
    return Response.json({ token: token.name }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json(
      { error: errors.voiceConnect },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  } finally {
    access.release!()
  }
}
