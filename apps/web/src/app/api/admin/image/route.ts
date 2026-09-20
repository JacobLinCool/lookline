import { buildCompositePrompt, compositeReferenceLabels, getLlm } from '@lookline/engine'
import type { ReferenceImage } from '@lookline/engine'
import { z } from 'zod'
import { getMessages } from '@/i18n/server'
import { DEFAULT_STYLE_PRESET, resolvePreviewArtPreset } from '@/server/imagery'

/**
 * Engine lab image generation, in two shapes.
 *
 * `application/json` renders a prompt as typed — the curl-friendly path. `multipart/form-data`
 * renders a composite outfit: one or more `garment` images and one or more
 * `person` images become labelled references, and the engine's own composite prompt names them.
 * Either way the composed prompt comes back with the image, because this is the lab.
 */

const ASPECT_RATIOS = ['3:4', '1:1', '4:5', '9:16'] as const
type AspectRatio = (typeof ASPECT_RATIOS)[number]

const promptSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2_000),
    aspectRatio: z.enum(ASPECT_RATIOS),
  })
  .strict()

export const MAX_IMAGES_PER_ROLE = 4
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_JSON_BYTES = 8_000
const MAX_MULTIPART_BYTES = 2 * MAX_IMAGES_PER_ROLE * MAX_IMAGE_BYTES + 64 * 1024
const headers = { 'Cache-Control': 'no-store' }

async function readImages(values: FormDataEntryValue[]): Promise<ReferenceImage[] | null> {
  const files = values.filter((value): value is File => value instanceof File && value.size > 0)
  if (files.length > MAX_IMAGES_PER_ROLE) return null
  const images: ReferenceImage[] = []
  for (const file of files) {
    if (!file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES) return null
    images.push({ mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) })
  }
  return images
}

export async function POST(request: Request) {
  const { errors } = (await getMessages()).ui
  const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data')
  try {
    const length = Number(request.headers.get('content-length'))
    if (length > (multipart ? MAX_MULTIPART_BYTES : MAX_JSON_BYTES))
      return Response.json({ error: errors.tooLarge }, { status: 413, headers })

    let prompt: string
    let aspectRatio: AspectRatio
    let referenceImages: ReferenceImage[] = []

    if (multipart) {
      const form = await request.formData().catch(() => null)
      if (!form) return Response.json({ error: errors.imagePrompt }, { status: 400, headers })
      const garments = await readImages(form.getAll('garment'))
      const people = await readImages(form.getAll('person'))
      if (!garments || !people || garments.length + people.length === 0)
        return Response.json({ error: errors.imageReferences }, { status: 400, headers })
      const ratio = String(form.get('aspectRatio') ?? '3:4')
      if (!(ASPECT_RATIOS as readonly string[]).includes(ratio))
        return Response.json({ error: errors.imagePrompt }, { status: 400, headers })
      aspectRatio = ratio as AspectRatio
      prompt = buildCompositePrompt({
        preset: resolvePreviewArtPreset(String(form.get('stylePreset') ?? DEFAULT_STYLE_PRESET)),
        garmentCount: garments.length,
        personCount: people.length,
        occasion: String(form.get('occasion') ?? '') || null,
        notes: String(form.get('notes') ?? '').slice(0, 2_000),
      })
      const labels = compositeReferenceLabels(garments.length, people.length)
      referenceImages = [...garments, ...people].map((image, index) => ({
        ...image,
        label: labels[index],
      }))
    } else {
      const parsed = promptSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success)
        return Response.json({ error: errors.imagePrompt }, { status: 400, headers })
      prompt = parsed.data.prompt
      aspectRatio = parsed.data.aspectRatio
    }

    const start = performance.now()
    const result = await getLlm().generateImage({
      prompt,
      referenceImages,
      aspectRatio,
      purpose: 'admin-playground',
      signal: request.signal,
      timeoutMs: 25_000,
    })
    if (!result?.data.length)
      return Response.json({ error: errors.imageUnavailable }, { status: 503, headers })
    return Response.json(
      {
        image: `data:${result.mimeType};base64,${result.data.toString('base64')}`,
        mimeType: result.mimeType,
        latencyMs: performance.now() - start,
        provider: result.provider,
        model: result.model,
        prompt,
        references: referenceImages.map((image) => image.label ?? ''),
      },
      { headers },
    )
  } catch (error) {
    console.warn('[admin/image] generation failed', error)
    return Response.json({ error: errors.imageFailed }, { status: 503, headers })
  }
}
