/**
 * `buildLookImagePrompt`: the image-model prompt for a Look. Person first (identity preserved
 * when a reference photo is attached), then the garments as worn, then the preset's art
 * direction and the occasion, then negative guidance. No brand names or logos are ever requested.
 */
import { findSubcategory, findMaterial, findPattern } from '@lookline/catalog'
import type { Product } from '@lookline/db'
import type { StylePreset } from '../types'

export interface LookPromptInput {
  preset: StylePreset
  products: ReadonlyArray<
    Pick<Product, 'name' | 'colorName' | 'material' | 'subcategory' | 'pattern'>
  >
  ownerName: string
  occasion?: string | null
  hasReferencePhoto: boolean
}

export const PROMPT_NEGATIVE_GUIDANCE =
  'Strictly no brand logos, no labels, no lettering, no captions, no watermarks, no signatures and no text of any kind in the image; no product packaging, no price tags, no extra people, no distorted hands or faces, no nudity, no exaggerated proportions. Keep it tasteful, wearable and editorial.'

function humanize(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').trim()
}

function describeGarment(p: LookPromptInput['products'][number]): string {
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

/** A rich, self-contained prompt for the image model (a few short paragraphs, plain text). */
export function buildLookImagePrompt(input: LookPromptInput): string {
  const { preset, products, ownerName, occasion, hasReferencePhoto } = input
  const subject = hasReferencePhoto
    ? 'Photograph the person in the reference photo, keeping their identity, face, skin tone, hair and body exactly as they are.'
    : 'Photograph one adult model, natural and relaxed, with a real, individual face.'
  const garmentList =
    products.length > 0 ? products.map(describeGarment).join('; ') : 'a simple, well-cut outfit'
  const garments = `They are wearing, as a complete outfit: ${garmentList}. Every piece is clearly visible, fits naturally and moves with the body; fabric texture, colour and drape are accurate.`
  const direction = `Art direction (${preset.name}): ${preset.prompt}`
  const framing =
    'Full-body or three-quarter fashion editorial; the person is the subject and the clothes are shown as worn, never as flat product shots. Photorealistic, high detail, magazine quality, natural skin.'
  const edition = `This is ${ownerName}'s personal edition on Lookline, a single still image.`
  const paragraphs = [
    subject,
    garments,
    direction,
    describeOccasion(occasion),
    framing,
    edition,
    PROMPT_NEGATIVE_GUIDANCE,
  ]
  return paragraphs.filter((s): s is string => Boolean(s)).join('\n\n')
}
