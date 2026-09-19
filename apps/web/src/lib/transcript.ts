export interface TranscriptState {
  committed: string
  fragment: string
  interim: string
}
export const emptyTranscript = (): TranscriptState => ({ committed: '', fragment: '', interim: '' })
export interface TranscriptContent {
  interimInputTranscription?: { text?: string }
  inputTranscription?: { text?: string; finished?: boolean }
}
const join = (...parts: string[]) => parts.filter(Boolean).join(' ').trim()
export function advanceTranscript(state: TranscriptState, content: TranscriptContent) {
  const next = { ...state }
  let finalized = false
  if (content.interimInputTranscription) next.interim = content.interimInputTranscription.text ?? ''
  if (content.inputTranscription) {
    next.fragment += content.inputTranscription.text ?? ''
    next.interim = ''
    if (content.inputTranscription.finished !== false) {
      next.committed = join(next.committed, next.fragment)
      next.fragment = ''
      finalized = true
    }
  }
  return { state: next, text: join(next.committed, next.fragment, next.interim), finalized }
}
