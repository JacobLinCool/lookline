import { loadAskByToken } from '@/components/social/data'

/**
 * `GET /api/asks/[token]` — the Ask card as JSON (what /a/[token] renders), for demos and the
 * README reproduction steps. No auth: the token is the capability, as with the page.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params
  const bundle = await loadAskByToken(token)
  if (!bundle) return Response.json({ error: 'not_found' }, { status: 404 })
  const { ask, asker, target, options, look, responses } = bundle

  const counts: Record<string, number> = {}
  for (const { response } of responses) {
    if (response.choiceProductId) {
      const key = String(response.choiceProductId)
      counts[key] = (counts[key] ?? 0) + 1
    }
  }

  return Response.json(
    {
      ask: {
        id: ask.id,
        kind: ask.kind,
        question: ask.question,
        status: ask.status,
        budget: ask.budget,
        occasion: ask.occasion,
        createdAt: ask.createdAt,
        cardPath: `/a/${encodeURIComponent(ask.shareToken)}`,
      },
      asker: {
        id: asker.id,
        handle: asker.handle,
        displayName: asker.displayName,
        avatarSeed: asker.avatarSeed,
      },
      target: target
        ? {
            id: target.id,
            handle: target.handle,
            displayName: target.displayName,
            avatarSeed: target.avatarSeed,
          }
        : null,
      look: look
        ? { id: look.id, title: look.title, sharePath: `/l/${encodeURIComponent(look.shareToken)}` }
        : null,
      options: options.map((p, i) => ({
        letter: String.fromCharCode(65 + i),
        id: p.id,
        name: p.name,
        brandName: p.brandName,
        price: p.price,
        colorName: p.colorName,
        aesthetics: p.aesthetics,
        imagePath: `/api/products/${p.id}/image`,
        votes: counts[String(p.id)] ?? 0,
      })),
      responses: responses.map(({ response, responder, styledLook }) => ({
        id: response.id,
        responder: responder
          ? {
              id: responder.id,
              handle: responder.handle,
              displayName: responder.displayName,
              isGuest: responder.isGuest,
            }
          : { id: null, handle: null, displayName: response.responderName, isGuest: true },
        choiceProductId: response.choiceProductId,
        styledLook: styledLook
          ? {
              id: styledLook.id,
              title: styledLook.title,
              sharePath: `/l/${encodeURIComponent(styledLook.shareToken)}`,
            }
          : null,
        comment: response.comment,
        createdAt: response.createdAt,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
