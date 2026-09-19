export const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe-live'
export const VOICE_SESSION_MS = 5 * 60_000

export const VOICE_LANGUAGES = [
  { code: 'cmn-Hant-TW', label: '繁體中文（台灣）' },
  { code: 'en-US', label: 'English' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'yue-Hant-HK', label: '廣東話' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'es-419', label: 'Español' },
] as const
export type VoiceLanguageCode = (typeof VOICE_LANGUAGES)[number]['code']
export const DEFAULT_VOICE_LANGUAGES: readonly VoiceLanguageCode[] = ['cmn-Hant-TW', 'en-US']
export const VOICE_LANGUAGES_STORAGE_KEY = 'lookline:voice-languages'

export function isVoiceLanguageSelection(value: unknown): value is VoiceLanguageCode[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= VOICE_LANGUAGES.length &&
    new Set(value).size === value.length &&
    value.every((code) => VOICE_LANGUAGES.some((language) => language.code === code))
  )
}

/** The token constraint and browser session must use the same language configuration. */
export function transcribeConfig(languageCodes: readonly VoiceLanguageCode[]) {
  return { inputAudioTranscription: { languageCodes: [...languageCodes] } }
}
