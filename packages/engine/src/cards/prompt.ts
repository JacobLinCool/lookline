/**
 * `buildCardImagePrompt`: the image-model prompt for a collectible card.
 *
 * A card is a Look with a named subject, so this is deliberately the same shape as
 * `buildLookImagePrompt` — reference photos first, garments copied from their own product photos,
 * then art direction and negative guidance. The one thing it does that a Look never has to is
 * keep several subjects apart: a collection edition is one artwork with one band per persona, and
 * the whole point of #37 is that each of them wears their own clothes rather than everyone's
 * being pooled into a heap. Naming, per subject, which garment images are theirs is what carries
 * that to the model.
 *
 * Reference images are attached in the order `compositeReferenceLabels` names them: every
 * garment, in subject order, then every persona photo, in the same subject order. The caller must
 * attach them in exactly that order or the labels point at the wrong pictures.
 */
import {
  PROMPT_NEGATIVE_GUIDANCE,
  compositeReferenceLabels,
  describeFillers,
  describeGarment,
  type LookPromptInput,
} from '../looks/prompt'
import type { StylePreset } from '../types'

export type CardPromptArticle = LookPromptInput['articles'][number]

export interface CardPromptSubject {
  /** The persona's display name, used only to tell subjects apart in the prompt. */
  name: string
  /**
   * What the reference photograph is of. This decides how the subject is described, and getting
   * it wrong is what makes a reference photo look ignored: told to keep a subject's "skin tone
   * and hair", an image model shown a plush toy resolves the contradiction by drawing a human
   * instead, and the photograph disappears from the result entirely.
   */
  kind: 'person' | 'avatar'
  /** A reference photo of this persona is attached (see the ordering note above). */
  hasPhoto: boolean
  /** What this subject wears. On a personal card there is one subject and it wears everything. */
  articles: readonly CardPromptArticle[]
}

export interface CardPromptInput {
  preset: StylePreset
  /** One for a personal card; one per participating persona for a collection edition. */
  subjects: readonly CardPromptSubject[]
  /** Who made the card. Named in the prompt the way a Look names its owner. */
  authorName: string
  /** The collection's title, when this artwork is an edition rather than a personal card. */
  collectionTitle?: string | null
}

/**
 * What a subject's own reference image is called. Not `Person reference`, which the Looks prompt
 * uses: a card's subject may be a toy, a pet or a drawn character, and a label claiming otherwise
 * is one more thing pushing the model to replace it with a human.
 */
export const SUBJECT_LABEL = 'Subject reference'

/**
 * The labels for a card's reference images, in the order the provider must receive them: every
 * garment with a photograph, in subject order, then every subject photograph, in the same order.
 * The caller attaches the images by this list so the prompt and the pictures cannot drift apart.
 */
export function cardReferenceLabels(subjects: readonly CardPromptSubject[]): readonly string[] {
  const garments = subjects.reduce((n, s) => n + s.articles.filter((a) => a.hasImage).length, 0)
  const people = subjects.filter((s) => s.hasPhoto).length
  return [
    ...compositeReferenceLabels(garments, 0),
    ...Array.from({ length: people }, (_, i) => `${SUBJECT_LABEL} ${i + 1}`),
  ]
}

const join = (parts: readonly string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

/**
 * How many reference images each subject contributes, and which labels are theirs. Garments and
 * photos are numbered across the whole request, not per subject, because that is the order the
 * provider receives them in.
 */
function assignLabels(subjects: readonly CardPromptSubject[]): {
  garments: string[][]
  people: (string | null)[]
} {
  const garmentCount = subjects.reduce((n, s) => n + s.articles.filter((a) => a.hasImage).length, 0)
  const labels = cardReferenceLabels(subjects)
  const personLabels = labels.slice(garmentCount)

  let garmentIndex = 0
  let personIndex = 0
  return {
    garments: subjects.map((s) =>
      s.articles.filter((a) => a.hasImage).map(() => labels[garmentIndex++]!),
    ),
    people: subjects.map((s) => (s.hasPhoto ? personLabels[personIndex++]! : null)),
  }
}

/** One paragraph per subject: who they are, and exactly what they have on. */
function describeSubject(
  subject: CardPromptSubject,
  personLabel: string | null,
  garmentLabels: readonly string[],
  solo: boolean,
): string {
  const named = solo ? 'The subject' : subject.name
  // The reference decides the subject, and saying so plainly is the whole job of this sentence:
  // anything softer and the model quietly falls back to a catalogue figure wearing the clothes.
  const who = personLabel
    ? subject.kind === 'avatar'
      ? `${named} is the character, toy or figure shown in ${personLabel}, and is the subject of this picture. Reproduce it exactly as photographed — its colours, markings, shape, proportions, face, texture and material — at its own scale and with its own body. It is not a human being: do not turn it into one, do not put a person in the frame in its place, and do not add a person beside it.`
      : `${named} is the same person shown in ${personLabel}, and is the subject of this picture. Keep their identity, face, skin tone, hair and body exactly as they are; do not replace them with a different or generic model. That image is the person only; ignore whatever they are wearing in it.`
    : subject.kind === 'avatar'
      ? `${named} is a single invented character figure rather than a human being.`
      : `${named} is one adult model, natural and relaxed, with a real, individual face.`

  let labelled = 0
  const pieces = subject.articles.map((a) => {
    const text = describeGarment(a)
    return a.hasImage ? `${garmentLabels[labelled++]}, ${text}` : text
  })
  const wearer = solo ? 'They wear' : `${subject.name} wears`
  const worn =
    pieces.length > 0
      ? `${wearer}, as one complete outfit: ${pieces.join('; ')}.${
          subject.kind === 'avatar'
            ? ' The garments are tailored to fit that figure\u2019s own body and proportions rather than a human one.'
            : ''
        }`
      : `${wearer} a simple, well-cut outfit.`
  const photographed =
    labelled > 0
      ? ' Each garment named with an attached image is reproduced exactly as photographed — its colour, material, cut, length, details and any print, graphic or lettering on it — and never substituted, restyled or given to anyone else.'
      : ''
  return `${who} ${worn}${photographed}`
}

/** A rich, self-contained prompt for the image model (a few short paragraphs, plain text). */
export function buildCardImagePrompt(input: CardPromptInput): string {
  const { preset, subjects, authorName, collectionTitle } = input
  const { garments, people } = assignLabels(subjects)
  const solo = subjects.length === 1

  const scene = solo
    ? null
    : // Without this the model merges several subjects into one figure, or drops the last of
      // them, and an edition of three reads as a portrait of one.
      `Photograph ${subjects.length} subjects together in one frame: ${join(subjects.map((s) => s.name))}. Every one of them is fully visible, side by side as a group portrait, each keeping their own outfit and their own form; no one is cropped out, merged with another or repeated.`

  const everyone = subjects.map((s, i) => describeSubject(s, people[i]!, garments[i]!, solo))

  // A full-body frame shows every slot, and a gap the model fills freely then reads as part of
  // the card. Only a personal card can say this: with several subjects the roles are per-person
  // and a single sentence about the outfit would contradict the paragraphs above.
  const fillers = solo ? describeFillers(subjects[0]!.articles) : null

  const direction = `Art direction (${preset.name}): ${preset.prompt}`
  // "Natural skin" and "model" belong to a human subject only. Left in for a card whose subject
  // is a toy or a character, they pull the picture back towards a person — which is exactly how
  // an attached reference photo ends up looking as though it was never sent.
  const anyPerson = subjects.some((s) => s.kind === 'person')
  const framing = anyPerson
    ? 'Full-body or three-quarter fashion editorial; the subjects are what the picture is of and the clothes are shown as worn, never as flat product shots. Photorealistic, high detail, magazine quality, natural skin.'
    : 'Full-body or three-quarter fashion editorial of the figure itself; it is what the picture is of and the clothes are shown as worn on it, never as flat product shots. Photorealistic, high detail, magazine quality, faithful to the reference\u2019s own materials and texture.'
  const edition = collectionTitle
    ? `This is the artwork for "${collectionTitle}", a collectible Lookline edition made by ${authorName}: a single still image.`
    : `This is a collectible Lookline card made by ${authorName}: a single still image.`

  return [scene, ...everyone, fillers, direction, framing, edition, PROMPT_NEGATIVE_GUIDANCE]
    .filter((s): s is string => Boolean(s))
    .join('\n\n')
}
