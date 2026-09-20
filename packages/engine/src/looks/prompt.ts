/**
 * `buildLookImagePrompt`: the image-model prompt for a Look. Person first (identity preserved
 * when a reference photo is attached), then the garments as worn — copied from their attached
 * product photos when there are any — then the preset's art direction and the occasion, then
 * negative guidance. No brand names or logos are ever requested.
 */
import { findSubcategory, findMaterial, findPattern } from '@lookline/catalog'
import type { Article } from '@lookline/db'
import type { StylePreset } from '../types'

export interface LookPromptInput {
  preset: StylePreset
  articles: ReadonlyArray<
    Pick<Article, 'name' | 'colorName' | 'material' | 'subcategory' | 'pattern'> &
      Partial<Pick<Article, 'outfitRole'>> & {
        /** A product photo of this garment is attached (see `lookReferenceLabels`). */
        hasImage?: boolean
      }
  >
  ownerName: string
  occasion?: string | null
  hasReferencePhoto: boolean
}

/**
 * Text the image itself must not carry. A garment's own print is not image text: a graphic tee
 * rendered without its graphic is the wrong garment, so prints are explicitly kept.
 */
export const PROMPT_NEGATIVE_GUIDANCE =
  'Strictly no brand logos, no labels, no lettering, no captions, no watermarks, no signatures and no text of any kind anywhere in the image, signage included; the one exception is a print, graphic or lettering that is part of a garment itself, which is kept exactly as that garment shows it. No product packaging, no price tags, no extra people, no distorted hands or faces, no nudity, no exaggerated proportions. Keep it tasteful, wearable and editorial.'

function humanize(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').trim()
}

/** "\"Name\", a navy cotton t-shirt, with a striped pattern" — shared with the card prompt. */
export function describeGarment(p: LookPromptInput['articles'][number]): string {
  const material = findMaterial(p.material)?.name ?? humanize(p.material)
  const subcategory = findSubcategory(p.subcategory)?.name ?? humanize(p.subcategory)
  const pattern =
    p.pattern && p.pattern !== 'solid'
      ? (findPattern(p.pattern)?.name ?? humanize(p.pattern))
      : null
  const bits = [
    `"${p.name}"`,
    `a ${p.colorName.toLowerCase()} ${material.toLowerCase()} ${subcategory.toLowerCase()}`,
  ]
  if (pattern) bits.push(`with a ${pattern.toLowerCase()} pattern`)
  return bits.join(', ')
}

function describeOccasion(occasion: string | null | undefined): string | null {
  if (!occasion) return null
  const clean = humanize(occasion)
  return `The setting and body language suit ${clean}.`
}

export interface CompositePromptInput {
  preset: StylePreset
  /** How many garment images are attached, in order. */
  garmentCount: number
  /** How many images of the person are attached, in order. */
  personCount: number
  occasion?: string | null
  /** Extra art direction typed by the operator; appended verbatim. */
  notes?: string | null
}

export const GARMENT_LABEL = 'Garment'
export const PERSON_LABEL = 'Person reference'

/**
 * The labels for a composite's reference images, in the order the provider receives them.
 * The prompt names the images by these labels, so the caller must attach them in this order.
 */
export function compositeReferenceLabels(
  garmentCount: number,
  personCount: number,
): readonly string[] {
  return [
    ...Array.from({ length: garmentCount }, (_, i) => `${GARMENT_LABEL} ${i + 1}`),
    ...Array.from({ length: personCount }, (_, i) => `${PERSON_LABEL} ${i + 1}`),
  ]
}

const listOf = (label: string, count: number): string =>
  Array.from({ length: count }, (_, i) => `${label} ${i + 1}`).join(', ')

/**
 * The same Look photograph, composed from attached images instead of catalog rows: the person
 * comes from their own reference images and each garment from its own image, so the model copies
 * what it is shown rather than inventing from a description.
 */
export function buildCompositePrompt(input: CompositePromptInput): string {
  const { preset, garmentCount, personCount, occasion, notes } = input
  const subject =
    personCount > 0
      ? `Photograph the same person shown in ${listOf(PERSON_LABEL, personCount)}, keeping their identity, face, skin tone, hair and body exactly as they are. Those images are the person only; ignore whatever they are wearing in them.`
      : 'Photograph one adult model, natural and relaxed, with a real, individual face.'
  const garments =
    garmentCount > 0
      ? `They are wearing, as one complete outfit, every garment shown in ${listOf(GARMENT_LABEL, garmentCount)}. Reproduce each garment exactly as photographed — its colour, material, pattern, cut, length and details — fitted naturally to the body and moving with it. Do not substitute, restyle or omit a garment, and add nothing that is not shown.`
      : 'They are wearing a simple, well-cut outfit.'
  const direction = `Art direction (${preset.name}): ${preset.prompt}`
  const framing =
    'Full-body or three-quarter fashion editorial; the person is the subject and the clothes are shown as worn, never as flat product shots. Photorealistic, high detail, magazine quality, natural skin.'
  const paragraphs = [
    subject,
    garments,
    direction,
    describeOccasion(occasion),
    notes?.trim() ? notes.trim() : null,
    framing,
    PROMPT_NEGATIVE_GUIDANCE,
  ]
  return paragraphs.filter((s): s is string => Boolean(s)).join('\n\n')
}

/**
 * The labels for a Look's reference images, in the order the provider receives them: one
 * `Garment N` per article with `hasImage`, in article order, then the person when attached.
 */
export function lookReferenceLabels(
  articles: LookPromptInput['articles'],
  hasReferencePhoto: boolean,
): readonly string[] {
  const garments = articles.filter((a) => a.hasImage).length
  return compositeReferenceLabels(garments, hasReferencePhoto ? 1 : 0)
}

type Slot = 'top' | 'bottom' | 'shoes'

/** Which body slots each outfit role covers; roles not listed cover none. */
const SLOTS_BY_ROLE: Partial<Record<Article['outfitRole'], readonly Slot[]>> = {
  top: ['top'],
  outer: ['top'],
  bottom: ['bottom'],
  'full-body': ['top', 'bottom'],
  set: ['top', 'bottom'],
  swimwear: ['top', 'bottom'],
  nightwear: ['top', 'bottom'],
  shoes: ['shoes'],
}

const FILLER: Record<Slot, string> = {
  top: 'a plain top',
  bottom: 'plain trousers or a plain skirt',
  shoes: 'simple shoes',
}

/**
 * A full-body frame shows every slot; the model fills an empty one with whatever it likes, which
 * then reads as part of the Look. Name the gaps and keep them plain. Silent when roles are unknown.
 */
export function describeFillers(articles: LookPromptInput['articles']): string | null {
  if (articles.length === 0 || articles.some((a) => !a.outfitRole)) return null
  const covered = new Set(articles.flatMap((a) => SLOTS_BY_ROLE[a.outfitRole!] ?? []))
  const missing = (['top', 'bottom', 'shoes'] as const).filter((slot) => !covered.has(slot))
  if (missing.length === 0) return null
  const pieces = missing.map((slot) => FILLER[slot]).join(', ')
  return `Anything the outfit above does not include is completed with ${pieces} in a quiet neutral colour that complements it: solid, unbranded, with no print or graphic, so the pieces listed above stay the focus.`
}

/** A rich, self-contained prompt for the image model (a few short paragraphs, plain text). */
export function buildLookImagePrompt(input: LookPromptInput): string {
  const { preset, articles, ownerName, occasion, hasReferencePhoto } = input
  const labels = lookReferenceLabels(articles, hasReferencePhoto)
  const person = hasReferencePhoto ? labels[labels.length - 1] : null
  const subject = person
    ? `Photograph the same person shown in ${person}, keeping their identity, face, skin tone, hair and body exactly as they are. That image is the person only; ignore whatever they are wearing in it.`
    : 'Photograph one adult model, natural and relaxed, with a real, individual face.'
  let garmentIndex = 0
  const garmentList =
    articles.length > 0
      ? articles
          .map((a) => {
            const text = describeGarment(a)
            return a.hasImage ? `${labels[garmentIndex++]}, ${text}` : text
          })
          .join('; ')
      : 'a simple, well-cut outfit'
  const photographed =
    garmentIndex > 0
      ? ' Each garment labelled with an attached image is reproduced exactly as photographed — its colour, material, cut, length, details and any print, graphic or lettering on it — and never substituted or restyled.'
      : ''
  const garments = `They are wearing, as a complete outfit: ${garmentList}. Every piece is clearly visible, fits naturally and moves with the body; fabric texture, colour and drape are accurate.${photographed}`
  const direction = `Art direction (${preset.name}): ${preset.prompt}`
  const framing =
    'Full-body or three-quarter fashion editorial; the person is the subject and the clothes are shown as worn, never as flat product shots. Photorealistic, high detail, magazine quality, natural skin.'
  const edition = `This is ${ownerName}'s personal edition on Lookline, a single still image.`
  const paragraphs = [
    subject,
    garments,
    describeFillers(articles),
    direction,
    describeOccasion(occasion),
    framing,
    edition,
    PROMPT_NEGATIVE_GUIDANCE,
  ]
  return paragraphs.filter((s): s is string => Boolean(s)).join('\n\n')
}
