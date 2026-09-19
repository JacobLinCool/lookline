import { getSessionUser } from '@/server/auth'
import {
  cancelPreviewImage,
  getPreviewGeneration,
  queuePreviewImage,
  readPreviewGeneration,
} from '@/server/preview-generation'
import { sanitizeId } from '@/server/looks'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

async function access(ctx: { params: Promise<{ id: string }> }) {
  const id = sanitizeId((await ctx.params).id)
  const user = await getSessionUser()
  const state =
    id && user ? await readPreviewGeneration(id, user.id) : { preview: null, expired: false }
  if (state.expired)
    return {
      error: Response.json(
        { error: 'Preview expired.', status: 'expired' },
        { status: 410, headers: privateHeaders },
      ),
    }
  const preview = state.preview
  if (!user || !preview || preview.ownerId !== user.id)
    return {
      error: Response.json(
        { error: 'Preview not found.' },
        { status: 404, headers: privateHeaders },
      ),
    }
  return { preview }
}

function serialize(preview: NonNullable<Awaited<ReturnType<typeof getPreviewGeneration>>>) {
  return {
    id: preview.id,
    status: preview.imageStatus,
    provider: preview.imageProvider,
    generationId: preview.imageGenerationId,
    startedAt: preview.imageStartedAt?.toISOString() ?? null,
    error: preview.imageError,
    expiresAt: preview.expiresAt.toISOString(),
    imageUrl: `/api/previews/${preview.id}/image?v=${encodeURIComponent(preview.imagePath ?? 'composition')}`,
  }
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const result = await access(ctx)
  return result.error ?? Response.json(serialize(result.preview!), { headers: privateHeaders })
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const result = await access(ctx)
  if (result.error) return result.error
  const body: unknown = await request.json().catch(() => null)
  const stylePreset =
    body &&
    typeof body === 'object' &&
    'stylePreset' in body &&
    typeof body.stylePreset === 'string'
      ? body.stylePreset
      : undefined
  try {
    return Response.json(
      serialize(await queuePreviewImage(result.preview!.id, result.preview!.ownerId, stylePreset)),
      {
        status: 202,
        headers: privateHeaders,
      },
    )
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'The preview could not start.' },
      { status: 503, headers: privateHeaders },
    )
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const result = await access(ctx)
  if (result.error) return result.error
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== 'object' ||
    !('generationId' in body) ||
    typeof body.generationId !== 'string'
  )
    return Response.json(
      { error: 'Generation ID required.' },
      { status: 400, headers: privateHeaders },
    )
  const preview = await cancelPreviewImage(
    result.preview!.id,
    result.preview!.ownerId,
    body.generationId,
  )
  if (!preview)
    return Response.json({ error: 'Preview not found.' }, { status: 404, headers: privateHeaders })
  return Response.json(serialize(preview), { headers: privateHeaders })
}
