/**
 * Chart colours derived from the design tokens (globals.css — "The Rack"). Charts here are small
 * multiples (one series per panel, identity in the title) or two-series comparisons, so no
 * categorical palette is needed: ink for data, tag red for the single emerging status, muted for
 * baselines, the rail colour for grids.
 */
export const CHART = {
  ink: '#171717',
  accent: '#c8321e',
  muted: '#6d6e69',
  line: '#d6d5cf',
  mist: '#efeeea',
  paper: '#f7f6f3',
  card: '#ffffff',
} as const

/** Swatch per colour family (style-space dims 32–43). */
export const COLOR_FAMILY_SWATCH: Record<string, string> = {
  black: '#171717',
  white: '#f4f2ee',
  grey: '#8d8a80',
  neutral: '#c9b99a',
  brown: '#6b4a2e',
  red: '#a8322b',
  pink: '#d98aa0',
  'yellow-orange': '#d9a032',
  green: '#5f6b4a',
  blue: '#4d5f73',
  purple: '#6f4f8a',
  'multi-metallic': 'linear-gradient(135deg, #c9b99a, #8d8a80 50%, #d9a032)',
}
