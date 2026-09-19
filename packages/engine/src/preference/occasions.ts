/**
 * Occasion priors used by the evaluation's intent templates (ENGINE_SPEC §0.5, re-keyed).
 *
 * The catalog owns the 12 occasion slugs (`OCCASIONS`); the spec's aesthetic/colour priors are
 * transcribed onto those slugs with the spec's aesthetic names mapped to the catalog list
 * (classic → corporate-chic/preppy, old-money → quiet-luxury, korean-minimal → clean-girl/k-street,
 * bohemian → boho, gothic → goth, harajuku → kidcore). Occasions the spec lacks (brunch, lounge)
 * get rows in the same spirit. Not re-exported from the barrel; the intent module owns the
 * canonical `OCCASION_PRIORS`.
 */
import type { ColorFamily } from '@lookline/catalog'

export interface EvalOccasionPrior {
  formality: number
  coverage: number
  boldness: number
  aesthetics: Readonly<Record<string, number>>
  colors: Readonly<Partial<Record<ColorFamily, number>>>
  avoid?: readonly ColorFamily[]
}

export const EVAL_OCCASION_PRIORS: Readonly<Record<string, EvalOccasionPrior>> = {
  everyday: {
    formality: 0.3,
    coverage: 0.6,
    boldness: 0.35,
    aesthetics: { minimalist: 0.4, normcore: 0.4, streetwear: 0.3, 'k-street': 0.3 },
    colors: { neutral: 0.3, black: 0.3, white: 0.3 },
  },
  work: {
    formality: 0.65,
    coverage: 0.7,
    boldness: 0.3,
    aesthetics: { 'corporate-chic': 0.6, minimalist: 0.5, 'quiet-luxury': 0.4, preppy: 0.3 },
    colors: { black: 0.4, white: 0.4, grey: 0.4, neutral: 0.4, blue: 0.3 },
  },
  'date-night': {
    formality: 0.5,
    coverage: 0.5,
    boldness: 0.5,
    aesthetics: { romantic: 0.5, 'clean-girl': 0.4, 'quiet-luxury': 0.3, glam: 0.3 },
    colors: { black: 0.3, neutral: 0.3, pink: 0.2, red: 0.2 },
  },
  'wedding-guest': {
    formality: 0.75,
    coverage: 0.6,
    boldness: 0.45,
    aesthetics: {
      romantic: 0.5,
      glam: 0.4,
      'quiet-luxury': 0.4,
      'corporate-chic': 0.3,
      preppy: 0.3,
    },
    colors: { neutral: 0.5, pink: 0.3, blue: 0.3 },
    avoid: ['white'],
  },
  party: {
    formality: 0.55,
    coverage: 0.4,
    boldness: 0.7,
    aesthetics: { glam: 0.6, y2k: 0.3, streetwear: 0.3 },
    colors: { black: 0.5, 'multi-metallic': 0.4, red: 0.3 },
  },
  travel: {
    formality: 0.3,
    coverage: 0.6,
    boldness: 0.3,
    aesthetics: { minimalist: 0.4, athleisure: 0.4, gorpcore: 0.3, 'city-boy': 0.3 },
    colors: { neutral: 0.4, black: 0.3 },
  },
  workout: {
    formality: 0.05,
    coverage: 0.5,
    boldness: 0.4,
    aesthetics: { athleisure: 0.9 },
    colors: { black: 0.5, grey: 0.3 },
  },
  beach: {
    formality: 0.1,
    coverage: 0.3,
    boldness: 0.6,
    aesthetics: { resort: 0.8, coastal: 0.5, boho: 0.3 },
    colors: { white: 0.4, blue: 0.4, 'yellow-orange': 0.3 },
  },
  festival: {
    formality: 0.2,
    coverage: 0.4,
    boldness: 0.8,
    aesthetics: { boho: 0.6, y2k: 0.4, streetwear: 0.4, kidcore: 0.2 },
    colors: { 'multi-metallic': 0.4, 'yellow-orange': 0.3 },
  },
  brunch: {
    formality: 0.4,
    coverage: 0.55,
    boldness: 0.35,
    aesthetics: { coastal: 0.4, cottagecore: 0.4, 'clean-girl': 0.3, preppy: 0.3 },
    colors: { neutral: 0.4, white: 0.3, pink: 0.2 },
  },
  formal: {
    formality: 0.95,
    coverage: 0.5,
    boldness: 0.6,
    aesthetics: { glam: 0.9, 'quiet-luxury': 0.4, 'corporate-chic': 0.3 },
    colors: { black: 0.5, 'multi-metallic': 0.5, red: 0.3 },
  },
  lounge: {
    formality: 0.05,
    coverage: 0.6,
    boldness: 0.15,
    aesthetics: { athleisure: 0.5, normcore: 0.5, scandi: 0.3 },
    colors: { grey: 0.4, neutral: 0.3, white: 0.3 },
  },
}

/** Season → axis targets (§0.6). */
export const SEASON_AXES: Readonly<Record<string, { warmth: number; coverage: number }>> = {
  spring: { warmth: 0.4, coverage: 0.5 },
  summer: { warmth: 0.15, coverage: 0.3 },
  autumn: { warmth: 0.6, coverage: 0.7 },
  winter: { warmth: 0.9, coverage: 0.9 },
}
