export const SHOP_TALK_MODEL = 'gemini-3.8-live'
export const SHOP_TALK_TOKEN_MS = 30 * 60_000
export const SHOP_TALK_BODY_BYTES = 64 * 1024

/** Shared by the token constraint and browser connection; only Google Search is enabled. */
export const shopTalkConfig = () => ({
  responseModalities: ['AUDIO' as const],
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  tools: [{ googleSearch: {} }],
  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
  contextWindowCompression: { slidingWindow: {} },
})
