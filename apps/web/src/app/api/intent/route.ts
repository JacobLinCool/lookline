import { z } from 'zod'
import { getSessionUser } from '@/server/auth'
import { loadUserForIntent, MAX_UTTERANCE, runIntent, type IntentRun } from '@/server/intent'

export const dynamic = 'force-dynamic'

/**
 * `POST /api/intent` — Engine 01 + 02 in one call, for the README / curl demo.
 *
 *   curl -s localhost:3000/api/intent -H 'content-type: application/json' \
 *     -d '{"q":"下週要去朋友婚禮，預算五千，不想太正式"}'
 *
 * Body: `{ q, userId?, clarify?: ["slot:value"], previous?: intentSessionId }`.
 * No auth required; the cookie session user is used when present, otherwise `userId`.
 * `GET /api/intent?q=…` accepts the same fields as query parameters.
 */

const bodySchema = z.object({
  q: z.string().trim().min(1).max(MAX_UTTERANCE),
  userId: z.string().trim().min(1).max(64).optional(),
  clarify: z.array(z.string().max(120)).max(8).optional(),
  previous: z.string().trim().min(1).max(64).optional(),
})

const headers = { 'Cache-Control': 'no-store' }

function serialize(run: IntentRun) {
  const { understanding, recommendation } = run
  const parse = understanding.parse
  const result = recommendation.result
  const errors: Array<{ stage: string; capability: string; message: string }> = []
  if (!parse.ok) errors.push({ stage: 'understand', ...parse })
  if (!result.ok) errors.push({ stage: 'recommend', ...result })
  if (understanding.previousError) {
    errors.push({
      stage: 'previous',
      capability: 'intent_sessions',
      message: understanding.previousError,
    })
  }

  return {
    sessionId: understanding.sessionId,
    utterance: understanding.utterance,
    locale: understanding.locale,
    intent: parse.ok ? parse.intent : null,
    provider: parse.ok ? parse.provider : null,
    model: parse.ok ? parse.model : null,
    latencyMs: parse.ok ? parse.latencyMs : null,
    items: result.ok
      ? result.items.map((item, index) => ({
          id: item.product.id,
          name: item.product.name,
          brandName: item.brandName,
          price: item.product.price,
          position: index + 1,
          score: item.score,
          explanation: item.explanation,
        }))
      : [],
    outfits: result.ok
      ? result.outfits.map((outfit) => ({
          id: outfit.id,
          total: outfit.total,
          budget: outfit.budget ?? null,
          compatibility: outfit.compatibility,
          explanation: outfit.explanation,
          items: outfit.items.map((item) => ({
            id: item.product.id,
            name: item.product.name,
            brandName: item.brandName,
            role: item.role ?? null,
            price: item.product.price,
            score: item.score,
            explanation: item.explanation,
          })),
        }))
      : [],
    candidates: result.ok ? result.candidates : null,
    weights: result.ok ? result.weights : null,
    timings: result.ok ? result.timings : null,
    impressions: recommendation.impressions,
    errors,
  }
}

async function handle(input: unknown): Promise<Response> {
  const parsed = bodySchema.safeParse(input)
  if (!parsed.success) {
    return Response.json(
      { error: 'Expected { q: string, userId?: string, clarify?: string[], previous?: string }' },
      { status: 400, headers },
    )
  }
  const { q, userId, clarify, previous } = parsed.data
  const sessionUser = await getSessionUser()
  const user = sessionUser ?? (userId ? await loadUserForIntent(userId) : null)

  const run = await runIntent({ q, clarify, previousSessionId: previous ?? null, user })
  const status = run.understanding.parse.ok ? 200 : 503
  return Response.json(serialize(run), { status, headers })
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body must be JSON: { q, userId? }' }, { status: 400, headers })
  }
  return handle(body)
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  return handle({
    q: params.get('q') ?? '',
    userId: params.get('userId') ?? undefined,
    clarify: params.getAll('clarify'),
    previous: params.get('previous') ?? undefined,
  })
}
