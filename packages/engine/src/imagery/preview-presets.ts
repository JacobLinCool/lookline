/**
 * Editorial presets for private preview images and deterministic placeholders.
 * Person-first, product second: every fragment describes art direction, lighting, lens and mood
 * for a portrait of the wearer, never a product ad. No logos, no text, no watermarks.
 */
import type { PreviewArtPreset } from '../types'

export const PREVIEW_ART_PRESETS: readonly PreviewArtPreset[] = [
  {
    slug: 'tokyo-midnight',
    name: 'Tokyo Midnight',
    labelZh: '東京午夜',
    description: 'Neon-lit back street after rain, reflections on wet asphalt, cinematic contrast.',
    prompt:
      'Night-time street portrait in a narrow Tokyo back alley after rain. Neon signage glow in cyan and magenta reflected on wet asphalt, deep shadows, cinematic contrast. Shot on a 35mm lens at f/1.8, shallow depth of field, slight film grain, handheld candid framing. Mood: restless, electric, quietly confident.',
    theme: { background: '#0b0d1a', foreground: '#f2f1f7', accent: '#ff3d8f', mood: 'electric' },
  },
  {
    slug: 'paris-editorial',
    name: 'Paris Editorial',
    labelZh: '巴黎編輯',
    description: 'Haussmann courtyard, overcast daylight, restrained luxury magazine framing.',
    prompt:
      'Daylight fashion editorial in a Parisian courtyard with pale limestone walls and tall shuttered windows. Soft overcast light, gentle shadows, muted palette. Shot on an 85mm lens at f/2.8, three-quarter length, composed with generous negative space like a luxury magazine spread. Mood: poised, effortless, unhurried.',
    theme: { background: '#f4efe6', foreground: '#1d1a17', accent: '#8a1c2b', mood: 'poised' },
  },
  {
    slug: '90s-magazine',
    name: '90s Magazine',
    labelZh: '九〇年代雜誌',
    description: 'Point-and-shoot flash, saturated colour, raw supermodel-era attitude.',
    prompt:
      'Nineties fashion magazine snapshot: direct on-camera flash, slightly overexposed skin, saturated colour and a hard shadow on a plain painted wall. Shot on a compact 28mm point-and-shoot lens, waist-up or full body, off-centre framing, visible grain. Mood: raw, playful, a little defiant.',
    theme: { background: '#f7e14b', foreground: '#141414', accent: '#e63946', mood: 'raw' },
  },
  {
    slug: 'film-still',
    name: 'Film Still',
    labelZh: '電影劇照',
    description: 'Anamorphic widescreen frame, warm tungsten interiors, a story mid-scene.',
    prompt:
      'A single frame from a feature film: anamorphic widescreen composition, warm tungsten practical lights inside a dim apartment, a window of cool blue dusk behind. Subject caught mid-gesture as if in the middle of a scene, 50mm lens, subtle halation and lens flare, 35mm film colour. Mood: intimate, melancholic, cinematic.',
    theme: { background: '#1f1712', foreground: '#f3e6d3', accent: '#e0a458', mood: 'cinematic' },
  },
  {
    slug: 'cyber-couture',
    name: 'Cyber Couture',
    labelZh: '賽博高定',
    description: 'Chrome, holographic light and a futuristic runway-in-a-void sensibility.',
    prompt:
      'Futuristic couture portrait in a dark void with chrome floor reflections and holographic rim lighting in violet and teal. Sharp studio key light, high clarity, glossy surfaces, subtle digital haze. Shot on a 70mm lens, full body, symmetrical runway-like stance. Mood: sleek, otherworldly, precise.',
    theme: { background: '#08111f', foreground: '#dff6ff', accent: '#5ef2d8', mood: 'sleek' },
  },
  {
    slug: 'street-documentary',
    name: 'Street Documentary',
    labelZh: '街頭紀實',
    description: 'Candid daylight reportage, real city textures, black-and-white-adjacent honesty.',
    prompt:
      'Candid documentary street photograph at midday on a busy city crossing: natural hard sunlight, real textures of concrete, glass and traffic, passers-by blurred by motion. Shot on a 35mm lens at f/8, full body walking towards camera, honest and unposed. Mood: alive, unfiltered, urban.',
    theme: { background: '#e9e6df', foreground: '#1a1a1a', accent: '#2f5cff', mood: 'unfiltered' },
  },
  {
    slug: 'dreamscape',
    name: 'Dreamscape',
    labelZh: '夢境',
    description: 'Soft-focus pastel haze, floating fabric, surreal golden-hour fields.',
    prompt:
      'Surreal dreamlike portrait in a wide open field at golden hour with low fog, soft pastel sky and floating fabric caught by the wind. Diffused backlight, bloom and gentle lens softness, pale rose and lilac tones. Shot on a 105mm lens at f/2, three-quarter length, floating and weightless. Mood: tender, hazy, romantic.',
    theme: { background: '#f6e7ef', foreground: '#3b2a3f', accent: '#b98bd6', mood: 'hazy' },
  },
  {
    slug: 'studio-minimal',
    name: 'Studio Minimal',
    labelZh: '極簡棚拍',
    description: 'Seamless paper backdrop, one soft key light, nothing but the wearer.',
    prompt:
      'Minimal studio portrait on a seamless warm-grey paper backdrop with a single large softbox key light from the upper left and a subtle fill. Clean, even tones, crisp fabric detail, no props. Shot on a 90mm lens at f/5.6, full body standing, centred composition. Mood: calm, exact, timeless.',
    theme: { background: '#ece9e3', foreground: '#111111', accent: '#8c8479', mood: 'calm' },
  },
  {
    slug: 'coastal-morning',
    name: 'Coastal Morning',
    labelZh: '海岸清晨',
    description: 'Salt air, whitewashed walls, first light on linen.',
    prompt:
      'Early-morning portrait on a whitewashed seaside terrace, pale turquoise water in the distance, soft low sun raking across textured plaster. Airy highlights, sea breeze in the hair, sandy and off-white tones. Shot on a 50mm lens at f/2.8, full body leaning against the wall. Mood: fresh, breezy, unhurried.',
    theme: { background: '#eef5f4', foreground: '#173b3f', accent: '#2a9d8f', mood: 'breezy' },
  },
  {
    slug: 'gallery-night',
    name: 'Gallery Night',
    labelZh: '藝廊之夜',
    description: 'White-cube opening, spot-lit concrete, black-tie meets contemporary art.',
    prompt:
      'Evening portrait at a contemporary art gallery opening: white-cube walls, polished concrete floor, narrow spotlights creating pools of light and long shadows. Neutral colour, sharp detail, an abstract sculpture out of focus behind. Shot on a 35mm lens at f/2, full body mid-conversation. Mood: cultured, sharp, magnetic.',
    theme: { background: '#141414', foreground: '#f5f5f2', accent: '#d4af37', mood: 'magnetic' },
  },
  {
    slug: 'garden-afternoon',
    name: 'Garden Afternoon',
    labelZh: '花園午後',
    description: 'Dappled light through leaves, wicker chairs, quiet English garden.',
    prompt:
      'Late-afternoon portrait in a lush walled garden with dappled sunlight through leaves, wicker chair and climbing roses. Warm green and cream tones, gentle shadows, soft bokeh. Shot on an 85mm lens at f/2, seated three-quarter length. Mood: gentle, nostalgic, sun-warmed.',
    theme: { background: '#eef2e4', foreground: '#26331f', accent: '#c26a4a', mood: 'gentle' },
  },
  {
    slug: 'concrete-brutalist',
    name: 'Concrete Brutalist',
    labelZh: '粗獷混凝土',
    description: 'Monumental raw concrete, hard geometric shadows, small figure in a big frame.',
    prompt:
      'Architectural portrait against monumental raw concrete, hard geometric shadows from the midday sun, the figure small within a wide frame of stairs and columns. Cool grey palette, high contrast, ultra-sharp. Shot on a 24mm lens at f/8, full body, strong diagonals. Mood: austere, bold, monumental.',
    theme: { background: '#c9c7c2', foreground: '#121212', accent: '#ff6b1a', mood: 'austere' },
  },
]

const PRESET_BY_SLUG: ReadonlyMap<string, PreviewArtPreset> = new Map(
  PREVIEW_ART_PRESETS.map((p) => [p.slug, p]),
)

export function findPreviewArtPreset(slug: string): PreviewArtPreset | undefined {
  return PRESET_BY_SLUG.get(slug)
}
