/**
 * Looks module: style presets, `deriveLookStyle`, the editorial poster and the image prompt
 * (contract names in docs/CONTRACTS.md; internals split across sibling files).
 */
import type { Article } from '@lookline/db'
import type { LookPosterInput, LookStyle, StylePreset } from '../types'
import { buildLookImagePrompt as buildPrompt, type LookPromptInput } from './prompt'

export { STYLE_PRESETS, findStylePreset } from './presets'
export { deriveLookStyle } from './style'
export { renderLookPosterSvg, POSTER_WIDTH, POSTER_HEIGHT } from './poster'
export { PROMPT_NEGATIVE_GUIDANCE } from './prompt'
export { SHAPES, shapeFamilyFor, type ShapeFamily } from './shapes'
export type { LookPromptInput, LookPosterInput, LookStyle, StylePreset }

export function buildLookImagePrompt(input: {
  preset: StylePreset
  articles: ReadonlyArray<
    Pick<Article, 'name' | 'colorName' | 'material' | 'subcategory' | 'pattern'>
  >
  ownerName: string
  occasion?: string | null
  hasReferencePhoto: boolean
}): string {
  return buildPrompt(input)
}
