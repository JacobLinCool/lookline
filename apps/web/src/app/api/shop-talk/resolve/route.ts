import { ConversationLimitError, resolveConversationFilters } from '@lookline/engine/conversation'
import { getI18n } from '@/i18n/server'
import { liveAccess } from '@/server/live-access'
import { readTalkRequest, TalkRequestError, talkHeaders } from '@/server/shop-talk-request'

export async function POST(request: Request) {
  const access = await liveAccess(request, 'filters')
  if (access.response) return access.response
  const { t } = await getI18n()
  try {
    const { base, events, revision, epoch } = await readTalkRequest(request)
    const decision = await resolveConversationFilters(base, events, { signal: request.signal })
    return Response.json({ ...decision, revision, epoch }, { headers: talkHeaders })
  } catch (error) {
    const status =
      error instanceof ConversationLimitError
        ? 413
        : error instanceof TalkRequestError
          ? error.status
          : 503
    return Response.json(
      { error: status === 413 ? t.shopTalk.full : t.shopTalk.filterError },
      { status, headers: talkHeaders },
    )
  } finally {
    access.release!()
  }
}
