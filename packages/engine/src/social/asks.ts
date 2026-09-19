/**
 * Asks ("Which fits me better?" / "Style me"): `createAsk` writes the asks row and the ASK edge;
 * `answerAsk` writes ask_responses, the ADVISE (choose) or STYLE (style_me) edge responder →
 * asker, marks the Ask answered and emits `ask_choice` feedback for the asker (chosen / rejected)
 * and for the adviser (gift vector).
 */
import { askResponses, asks, eq, type Ask, type AskResponse, type Database } from '@lookline/db'
import type { AnswerAskInput, CreateAskInput } from '../types'
import { emitFeedback } from './feedback'
import { newId, newShareToken } from './ids'
import { insertInteraction } from './interactions'
import { resolveCreatedAt } from './time'

export async function createAsk(db: Database, input: CreateAskInput): Promise<Ask> {
  const createdAt = await resolveCreatedAt(db, input.createdAt)
  const id = newId(input.id)
  const optionArticleIds = [...new Set(input.optionArticleIds ?? [])]
  const targetUserId =
    input.targetUserId && input.targetUserId !== input.askerId ? input.targetUserId : null
  const [ask] = await db
    .insert(asks)
    .values({
      id,
      askerId: input.askerId,
      targetUserId,
      kind: input.kind,
      question: input.question,
      optionArticleIds,
      lookId: input.lookId ?? null,
      budget: input.budget ?? null,
      occasion: input.occasion ?? null,
      shareToken: newShareToken(input.shareToken),
      status: 'open',
      createdAt,
    })
    .returning()
  if (!ask) throw new Error('@lookline/engine: ask was not inserted')

  await insertInteraction(db, {
    actorUserId: input.askerId,
    type: 'ASK',
    targetUserId,
    askId: id,
    lookId: input.lookId ?? null,
    payload: { kind: input.kind, optionArticleIds, occasion: input.occasion ?? null },
    createdAt,
  })
  return ask
}

export async function answerAsk(
  db: Database,
  input: AnswerAskInput,
  scheduling: { deferFeedback?: (work: () => Promise<void>) => void } = {},
): Promise<AskResponse> {
  const [ask] = await db.select().from(asks).where(eq(asks.id, input.askId)).limit(1)
  if (!ask) throw new Error(`@lookline/engine: ask ${input.askId} not found`)

  const createdAt = await resolveCreatedAt(db, input.createdAt)
  const id = newId(input.id)
  const choiceArticleId =
    ask.kind === 'choose' && input.choiceArticleId != null ? input.choiceArticleId : null
  const styledLookId = input.styledLookId ?? null
  const responderUserId = input.responderUserId ?? null

  const [response] = await db
    .insert(askResponses)
    .values({
      id,
      askId: ask.id,
      responderUserId,
      responderName: input.responderName ?? null,
      choiceArticleId,
      styledLookId,
      comment: input.comment ?? null,
      createdAt,
    })
    .returning()
  if (!response) throw new Error('@lookline/engine: ask response was not inserted')

  if (responderUserId && responderUserId !== ask.askerId) {
    await insertInteraction(db, {
      actorUserId: responderUserId,
      type: ask.kind === 'choose' ? 'ADVISE' : 'STYLE',
      targetUserId: ask.askerId,
      askId: ask.id,
      articleId: choiceArticleId,
      lookId: ask.kind === 'choose' ? ask.lookId : (styledLookId ?? ask.lookId),
      payload: {
        responseId: id,
        kind: ask.kind,
        choiceArticleId,
        styledLookId,
        comment: input.comment ?? null,
      },
      createdAt,
    })
  }

  await db.update(asks).set({ status: 'answered' }).where(eq(asks.id, ask.id))

  const feedback = async () => {
    if (ask.kind === 'choose' && choiceArticleId != null) {
      const options = ask.optionArticleIds.includes(choiceArticleId)
        ? ask.optionArticleIds
        : [...ask.optionArticleIds, choiceArticleId]
      for (const articleId of options) {
        const chosen = articleId === choiceArticleId
        await emitFeedback(db, {
          userId: ask.askerId,
          kind: 'ask_choice',
          articleId,
          lookId: ask.lookId,
          context: { chosen, role: 'asker', askId: ask.id, responseId: id },
          createdAt,
        })
      }
      if (responderUserId && responderUserId !== ask.askerId) {
        await emitFeedback(db, {
          userId: responderUserId,
          kind: 'ask_choice',
          articleId: choiceArticleId,
          forOthers: true,
          context: { chosen: true, role: 'adviser', askId: ask.id, responseId: id },
          createdAt,
        })
      }
    } else if (styledLookId) {
      await emitFeedback(db, {
        userId: ask.askerId,
        kind: 'ask_choice',
        lookId: styledLookId,
        context: { chosen: true, role: 'asker', askId: ask.id, responseId: id },
        createdAt,
      })
    }
  }
  if (scheduling.deferFeedback) scheduling.deferFeedback(feedback)
  else await feedback()

  return response
}
