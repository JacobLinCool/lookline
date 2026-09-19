/**
 * Looks module: style presets, `deriveLookStyle`, the editorial poster and the image prompt
 * (contract names in docs/CONTRACTS.md; internals split across sibling files).
 */
import type { LookPosterInput, LookStyle, StylePreset } from '../types'
import type { LookPromptInput } from './prompt'

export { STYLE_PRESETS, findStylePreset } from './presets'
export { deriveLookStyle } from './style'
export { renderLookPosterSvg, POSTER_WIDTH, POSTER_HEIGHT } from './poster'
export {
  buildCompositePrompt,
  compositeReferenceLabels,
  buildLookImagePrompt,
  lookReferenceLabels,
  GARMENT_LABEL,
  PERSON_LABEL,
  PROMPT_NEGATIVE_GUIDANCE,
  type CompositePromptInput,
} from './prompt'
export { SHAPES, shapeFamilyFor, type ShapeFamily } from './shapes'
export type { LookPromptInput, LookPosterInput, LookStyle, StylePreset }
