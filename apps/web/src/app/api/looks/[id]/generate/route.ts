import { and, eq, looks } from '@lookline/db'
import { getSessionUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { getLookGeneration, queueLookImage } from '@/server/look-generation'
import { sanitizeId } from '@/server/looks'

const headers = { 'Cache-Control': 'private, no-store' }

async function access(ctx: { params: Promise<{ id: string }> }, ownerOnly: boolean) {
  const id = sanitizeId((await ctx.params).id)
  if (!id) return { error: Response.json({ error: 'Invalid Look id.' }, { status: 400, headers }) }
  const user = await getSessionUser()
  const [look] = await getDb().db.select().from(looks).where(eq(looks.id, id)).limit(1)
  if (!look || (look.visibility === 'private' && look.ownerId !== user?.id))
    return { error: Response.json({ error: 'Look not found.' }, { status: 404, headers }) }
  if (ownerOnly && look.ownerId !== user?.id)
    return {
      error: Response.json(
        { error: 'Only the owner can render this Look.' },
        { status: 403, headers },
      ),
    }
  return { look }
}

function serialize(look: NonNullable<Awaited<ReturnType<typeof getLookGeneration>>>) {
  return {
    id: look.id,
    status: look.imageStatus,
    provider: look.imageProvider,
    generationId: look.imageGenerationId,
    startedAt: look.imageStartedAt?.toISOString() ?? null,
    error: look.imageError,
    imageUrl: `/api/looks/${look.id}/image?v=${encodeURIComponent(look.imagePath ?? 'composition')}`,
  }
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const result = await access(ctx, false)
  if (result.error) return result.error
  const look = await getLookGeneration(result.look!.id)
  return Response.json(serialize(look!), { headers })
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const result = await access(ctx, true)
  if (result.error) return result.error
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== 'object' ||
    !('stylePreset' in body) ||
    typeof body.stylePreset !== 'string'
  )
    return Response.json({ error: 'Choose a style preset.' }, { status: 400, headers })
  try {
    const look = await queueLookImage(result.look!.id, { stylePreset: body.stylePreset })
    return Response.json(serialize(look), { status: 202, headers })
  } catch (error) {
    console.warn('[looks] image request failed', error)
    return Response.json(
      { error: 'Could not create the image. Please try again.' },
      { status: 503, headers },
    )
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const result = await access(ctx, true)
  if (result.error) return result.error
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== 'object' ||
    !('generationId' in body) ||
    typeof body.generationId !== 'string'
  )
    return Response.json({ error: 'Missing generation id.' }, { status: 400, headers })
  await getDb()
    .db.update(looks)
    .set({
      imageStatus: 'failed',
      imageGenerationId: null,
      imageError: 'Rendering cancelled. Your composition is saved.',
    })
    .where(and(eq(looks.id, result.look!.id), eq(looks.imageGenerationId, body.generationId)))
  return Response.json(serialize((await getLookGeneration(result.look!.id))!), { headers })
}
