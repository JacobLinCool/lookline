/**
 * The print pass: what the artwork on a garment actually depicts.
 *
 * The core pass files a print under one of eight subjects, which is enough to filter on and
 * useless for spotting a trend — `character` is the same label for a dinosaur, a mouse and a
 * footballer, and those three move independently. No closed list can enumerate motifs in advance,
 * so this pass writes short free text and the clustering happens afterwards, on real data. That
 * clustering is the signal: a motif turns over in weeks where a neckline turns over in years.
 *
 * It runs only over the articles the core pass found a print on — 28 900 of 105 220 — which is
 * why it is a pass of its own rather than three more fields asked of every handbag.
 */
export const PRINT_VERSION = 'print-1'

/** Where the artwork sits. H&M's `graphical_appearance_name` splits only front from all-over. */
export const PRINT_PLACEMENTS = [
  'all-over',
  'front',
  'back',
  'chest',
  'sleeve',
  'hem',
  'pocket',
] as const

export interface PrintResult {
  /** Two to four words naming the subject: `tyrannosaurus rex`, `palm fronds`, `chequered flag`. */
  motif: string
  /** The words printed on the garment, verbatim and in their own language; `''` when none. */
  text: string
  placement: string
  /** Roughly how many colours the artwork uses, which is what a print run is costed by. */
  colourCount: number
  confidence: number
}

type Json = Record<string, unknown>

export function printJsonSchema(): Json {
  const properties: Json = {
    motif: {
      type: 'string',
      description:
        'Two to four words for what the artwork depicts, singular and lower case: ' +
        '"tyrannosaurus rex", "palm fronds", "chequered flag", "smiley face". Name the subject, ' +
        'not the style: "roses" rather than "floral print". "" when the artwork depicts nothing ' +
        'representational, such as stripes or an abstract wash.',
    },
    text: {
      type: 'string',
      description:
        'Every word printed on the garment, verbatim, in the language it is printed in, ' +
        'including numbers. "" when the garment carries no text. Do not translate or correct it.',
    },
    placement: {
      type: 'string',
      enum: [...PRINT_PLACEMENTS],
      description: 'Where the artwork sits on the garment.',
    },
    colourCount: {
      type: 'number',
      description: 'How many distinct ink colours the artwork uses, 1 to 12.',
    },
    confidence: { type: 'number', description: 'confidence in this reading, 0 to 1' },
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  }
}

export const PRINT_SYSTEM = `You are reading the artwork printed on a garment, from its product photograph.

One job: say what the print shows, in the fewest words that identify it. A merchandiser will group
thousands of these to see which motifs are rising, so the same subject must come back as the same
words every time — "palm fronds" for every palm print, not "tropical leaves" once and "palm tree
design" the next.

Rules:
- Name the subject, never the style. "roses", not "floral print". "tiger", not "animal print".
- A licensed character gets its name when the image makes it unmistakable, and its kind when it
  does not: "mickey mouse" if that is plainly what it is, otherwise "cartoon mouse".
- Copy printed words exactly as they appear, in their own language and spelling, including numbers
  and punctuation. Do not translate, tidy or complete them.
- A garment can have artwork and no text, text and no artwork, or both.
- Stripes, checks, colour blocks and plain washes depict nothing: motif is "".
- Count ink colours as a print run would: the distinct colours in the artwork, not the garment.`

export function buildPrintPrompt(a: {
  name: string
  subcategory: string
  description: string
  department: string
}): string {
  return `Read the print on this garment.

product type: ${a.subcategory}
name: ${a.name}
department: ${a.department}
description: ${a.description || '(none)'}`
}

const clamp = (x: unknown, lo: number, hi: number): number =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo

/** Normalised so the same subject clusters: lower case, collapsed spaces, four words at most. */
function normaliseMotif(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 4)
    .join(' ')
    .slice(0, 60)
}

export function parsePrint(raw: unknown): PrintResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const placement = r['placement']
  return {
    motif: normaliseMotif(r['motif']),
    // Kept verbatim: it is the garment's own words, and normalising them loses the trend.
    text: typeof r['text'] === 'string' ? r['text'].trim().slice(0, 200) : '',
    placement:
      typeof placement === 'string' && (PRINT_PLACEMENTS as readonly string[]).includes(placement)
        ? placement
        : '',
    colourCount: Math.round(clamp(r['colourCount'], 0, 12)),
    confidence: clamp(r['confidence'], 0, 1),
  }
}
