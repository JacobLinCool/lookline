import { getLlm } from '@lookline/engine'
import { extractConversationKeywords } from '@lookline/engine/conversation'
import { getI18n } from '@/i18n/server'
import { liveAccess } from '@/server/live-access'
import { readTalkRequest, TalkRequestError, talkHeaders } from '@/server/shop-talk-request'

export async function POST(request: Request) {
  const access = await liveAccess(request, 'keywords')
  if (access.response) return access.response
  const { t } = await getI18n()
  try {
    const { base, events, revision, epoch } = await readTalkRequest(request)
    const result = await extractConversationKeywords(base, events, {
      llm: getLlm(),
      signal: request.signal,
    })
    if (!result) throw new Error('Keyword extraction failed')
    return Response.json({ ...result, revision, epoch }, { headers: talkHeaders })
  } catch (error) {
    return Response.json(
      { error: t.shopTalk.keywordError },
      { status: error instanceof TalkRequestError ? error.status : 503, headers: talkHeaders },
    )
  } finally {
    access.release!()
  }
}
