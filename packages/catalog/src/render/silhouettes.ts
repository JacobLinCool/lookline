/**
 * Garment silhouettes for the SVG renderer (docs/specs/CATALOG_SPEC.md §9.2): 65 base ids plus
 * 31 aliases, keyed by the ids `SubcategoryDef.silhouetteId` / `silhouetteFor` produce.
 *
 * Authoring convention: 600×800 space; garments occupy x 120–480, y 110–690; footwear, bags,
 * accessories and jewelry are centred and span roughly 70 % of the width; absolute commands only
 * (`M L C Q Z`); `body` and `trim` are single (possibly compound) closed paths; `detail` and
 * `straps` may contain several open subpaths. The reference paths of §9.2 (tee, sneaker, tote)
 * are transcribed verbatim.
 */

export interface Silhouette {
  /** Filled with the primary colour, clips the pattern overlay, carries the outline. */
  body: string
  /** Stroked seams, ribbing, laces … in a darkened primary. */
  detail: string
  /** Sole / strap region (footwear, bags) filled with the secondary colour or a darkened primary. */
  trim?: string
  /** Region filled with the secondary colour (lapels, flaps, collars). */
  accent?: string
  /** Handles / chains / strings stroked in the primary colour with a dark edge. */
  straps?: string
  strapWidth?: number
  /** Button / hole / stud centres, drawn as r=5 circles in a strongly darkened primary. */
  buttons?: readonly (readonly [number, number])[]
  /** Metal parts: an SVG snippet whose `{H}` placeholder becomes the hardware colour. */
  hardware?: string
  shadowY: number
  shadowRx: number
  patternScale: number
}

// ---------------------------------------------------------------------------
// Reusable parts
// ---------------------------------------------------------------------------

const K = 0.5523 // cubic Bézier circle constant

/** Closed circle path (four cubic arcs). */
export function circlePath(cx: number, cy: number, r: number): string {
  const k = r * K
  return (
    `M${cx} ${cy - r} C${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} ` +
    `C${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} ` +
    `C${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} ` +
    `C${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} Z`
  )
}

/** Closed ellipse path (four cubic arcs). */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const kx = rx * K
  const ky = ry * K
  return (
    `M${cx} ${cy - ry} C${cx + kx} ${cy - ry} ${cx + rx} ${cy - ky} ${cx + rx} ${cy} ` +
    `C${cx + rx} ${cy + ky} ${cx + kx} ${cy + ry} ${cx} ${cy + ry} ` +
    `C${cx - kx} ${cy + ry} ${cx - rx} ${cy + ky} ${cx - rx} ${cy} ` +
    `C${cx - rx} ${cy - ky} ${cx - kx} ${cy - ry} ${cx} ${cy - ry} Z`
  )
}

interface TopOpts {
  /** Shoulder y (default 150). */
  s?: number
  /** Hem y (default 690). */
  hem?: number
  /** Half hem width offset from the waist (0 = straight, positive = flared). */
  flare?: number
  /** Sleeve cuff y (default 560). */
  cuff?: number
  /** Extra sleeve width (0 = regular, positive = wider). */
  wide?: number
}

/**
 * Long-sleeve top body: shoulders at (180,s)/(420,s), sleeves down to the cuff, side seams at
 * x 195/405, then `neck` (a path fragment from the right shoulder back toward the left) and Z.
 */
export function longSleeveBody(neck: string, o: TopOpts = {}): string {
  const s = o.s ?? 150
  const hem = o.hem ?? 690
  const f = o.flare ?? 0
  const c = o.cuff ?? 560
  const w = o.wide ?? 0
  return (
    `M180 ${s} L${115 - w} ${s + 50} L${95 - w} ${c} L${165 - w} ${c + 15} L195 320 ` +
    `L195 ${hem - 250} L${195 - f} ${hem} L${405 + f} ${hem} L405 ${hem - 250} L405 320 ` +
    `L${435 + w} ${c + 15} L${505 + w} ${c} L${485 + w} ${s + 50} L420 ${s} ${neck} Z`
  )
}

/** Short-sleeve top body (the §9.2 tee geometry with a configurable neck and hem). */
export function shortSleeveBody(neck: string, o: TopOpts = {}): string {
  const s = o.s ?? 150
  const hem = o.hem ?? 690
  const f = o.flare ?? 0
  return (
    `M180 ${s} L120 ${s + 50} L150 ${s + 150} L200 ${s + 135} L200 ${hem - 290} ` +
    `L${200 - f} ${hem} L${400 + f} ${hem} L400 ${hem - 290} L400 ${s + 135} L450 ${s + 150} ` +
    `L480 ${s + 50} L420 ${s} ${neck} Z`
  )
}

interface PantsOpts {
  waist?: number
  hem?: number
  /** Outer hem x offset from the hip line (positive = wider). */
  hemOut?: number
  /** Inner hem x offset from the crotch (positive = wider). */
  hemIn?: number
  crotch?: number
  hip?: number
}

/** Two-leg trouser body: waistband at `waist`, hips, crotch, two legs to `hem`. */
export function pantsBody(o: PantsOpts = {}): string {
  const w = o.waist ?? 160
  const h = o.hem ?? 690
  const out = o.hemOut ?? 15
  const inn = o.hemIn ?? 25
  const c = o.crotch ?? 400
  const hip = o.hip ?? 25
  return (
    `M195 ${w} L405 ${w} L${405 + hip} ${w + 170} L${430 + out} ${h} L${300 + inn} ${h} ` +
    `L302 ${c} L298 ${c} L${300 - inn} ${h} L${170 - out} ${h} L${195 - hip} ${w + 170} Z`
  )
}

/** A-line skirt body from `waist` to `hem`, side flare and a curved hem. */
export function skirtBody(waist: number, hem: number, flare: number, halfWaist = 105): string {
  const l = 300 - halfWaist
  const r = 300 + halfWaist
  return `M${l} ${waist} L${r} ${waist} L${r + flare} ${hem} Q300 ${hem + 22} ${l - flare} ${hem} Z`
}

/** Tank/dress top from thin straps down to the waist (returns the fragment up to the waist). */
const TANK_TOP =
  'M210 140 L240 140 Q240 240 300 250 Q360 240 360 140 L390 140 L390 200 Q385 320 425 340'
const TANK_TOP_CLOSE = 'L175 340 Q215 320 210 200 Z'

const CREW_NECK = 'Q360 200 300 200 Q240 200 180 150'
const CREW_NECK_145 = 'Q360 195 300 195 Q240 195 180 145'
const CREW_RIB = 'M240 145 Q300 210 360 145 Q300 185 240 145 Z'
const HEM_RIBS =
  'M230 655 L230 690 M265 655 L265 690 M300 655 L300 690 M335 655 L335 690 M370 655 L370 690'
/** Cuff seam lines for a long-sleeve body with cuff y `c` and extra sleeve width `w`. */
const cuffs = (c = 560, w = 0): string =>
  `M${100 - w} ${c - 25} L${168 - w} ${c - 13} M${500 + w} ${c - 25} L${432 + w} ${c - 13}`
const CUFFS = cuffs()
const SHIRT_COLLAR = 'M235 140 L268 118 L300 195 L332 118 L365 140'
const NOTCH_LAPELS = 'M235 135 L262 108 L300 262 Z M365 135 L338 108 L300 262 Z'
const WAIST_SEAM = 'M200 400 L400 400'

// ---------------------------------------------------------------------------
// Silhouettes
// ---------------------------------------------------------------------------

const GARMENT = { shadowY: 705, shadowRx: 150, patternScale: 1 } as const
const SHOE = { shadowY: 610, shadowRx: 210, patternScale: 0.6 } as const
const BAG = { shadowY: 660, shadowRx: 180, patternScale: 0.8 } as const

const TEE_BODY =
  'M180 150 L120 200 L150 300 L200 285 L200 690 L400 690 L400 285 L450 300 L480 200 L420 150 Q360 200 300 200 Q240 200 180 150 Z'
const TEE_DETAIL = 'M250 150 Q300 215 350 150 Q300 175 250 150 Z'

const SNEAKER_BODY =
  'M110 520 C150 440 250 420 330 400 C400 385 450 420 490 500 L490 540 L110 540 Z'
const SNEAKER_TRIM = 'M100 540 L500 540 Q510 580 480 590 L120 590 Q90 580 100 540 Z'
const THIN_SOLE = 'M95 540 L500 540 L500 565 L410 565 L410 555 L120 555 Q90 555 95 540 Z'
const HEEL_SOLE = 'M100 540 L500 540 L500 585 L400 585 L400 565 L120 565 Q95 560 100 540 Z'

const TOTE_BODY = 'M150 300 L450 300 L470 640 L130 640 Z'
const TOTE_DETAIL = 'M220 300 C220 220 260 200 300 200 C340 200 380 220 380 300 M150 340 L450 340'

const BASE: Record<string, Silhouette> = {
  // ---- tops -----------------------------------------------------------------
  tee: { body: TEE_BODY, detail: TEE_DETAIL, ...GARMENT },
  tank: {
    body: `${TANK_TOP} L425 690 L175 690 ${TANK_TOP_CLOSE}`,
    detail: 'M245 140 Q245 248 300 262 Q355 248 355 140 M175 655 L425 655',
    ...GARMENT,
  },
  shirt: {
    body: longSleeveBody('L365 140 L300 240 L235 140'),
    detail: `${SHIRT_COLLAR} M300 240 L300 690 M215 300 L275 300 L275 360 L215 360 Z ${CUFFS}`,
    buttons: [
      [300, 280],
      [300, 350],
      [300, 420],
      [300, 490],
      [300, 560],
      [300, 630],
    ],
    ...GARMENT,
  },
  blouse: {
    body: 'M190 150 Q140 180 130 260 Q130 320 190 320 L195 690 L405 690 L410 320 Q470 320 470 260 Q460 180 410 150 Q400 225 300 232 Q200 225 190 150 Z',
    detail:
      'M232 155 Q300 205 368 155 M300 232 L300 305 M280 305 L320 305 M150 300 Q190 280 192 320 M450 300 Q410 280 408 320 M195 640 Q300 660 405 640',
    ...GARMENT,
  },
  sweater: {
    body: longSleeveBody(CREW_NECK_145, { s: 145 }),
    detail: `${CREW_RIB} M195 650 L405 650 ${HEM_RIBS} ${CUFFS}`,
    ...GARMENT,
  },
  cardigan: {
    body: longSleeveBody('L300 300', { s: 145 }),
    detail: `M180 145 L294 300 L294 690 M420 145 L306 300 L306 690 M195 650 L405 650 ${HEM_RIBS} ${CUFFS}`,
    buttons: [
      [294, 345],
      [294, 415],
      [294, 485],
      [294, 555],
      [294, 625],
    ],
    ...GARMENT,
  },
  hoodie: {
    body: longSleeveBody('Q430 90 300 90 Q170 90 175 165', { s: 165 }),
    detail:
      'M215 165 Q300 100 385 165 Q300 200 215 165 Z M284 192 L278 285 M316 192 L322 285 M205 530 L395 530 L395 660 L205 660 Z M205 530 L232 575 L232 660 M395 530 L368 575 L368 660 M195 655 L405 655 ' +
      cuffs(),
    ...GARMENT,
  },
  sweatshirt: {
    body: longSleeveBody(CREW_NECK_145, { s: 145 }),
    detail: `${CREW_RIB} M195 645 L405 645 M180 145 L215 300 M420 145 L385 300 ${CUFFS}`,
    ...GARMENT,
  },
  // ---- bottoms --------------------------------------------------------------
  pants: {
    body: pantsBody(),
    detail:
      'M195 195 L405 195 M300 195 L300 262 M232 160 L234 195 M368 160 L366 195 M195 205 Q240 222 248 275 M405 205 Q360 222 352 275',
    buttons: [[300, 178]],
    ...GARMENT,
  },
  'pants-wide': {
    body: pantsBody({ hemOut: 45, hemIn: 30 }),
    detail: 'M195 195 L405 195 M300 195 L300 262 M232 160 L234 195 M368 160 L366 195',
    buttons: [[300, 178]],
    ...GARMENT,
  },
  shorts: {
    body: pantsBody({ waist: 200, hem: 500, crotch: 360, hemOut: 25, hemIn: 20 }),
    detail:
      'M195 235 L405 235 M300 235 L300 300 M232 200 L234 235 M368 200 L366 235 M195 245 Q240 262 248 310 M405 245 Q360 262 352 310',
    buttons: [[300, 218]],
    shadowY: 520,
    shadowRx: 160,
    patternScale: 1,
  },
  'skirt-mini': {
    body: skirtBody(200, 450, 50),
    detail: 'M195 232 L405 232 M300 232 L300 300',
    shadowY: 480,
    shadowRx: 170,
    patternScale: 1,
  },
  'skirt-midi': {
    body: skirtBody(180, 580, 60),
    detail: 'M195 212 L405 212 M300 212 L300 290',
    shadowY: 610,
    shadowRx: 180,
    patternScale: 1,
  },
  'skirt-maxi': {
    body: skirtBody(150, 680, 70, 100),
    detail: 'M200 182 L400 182 M300 182 L300 270',
    shadowY: 705,
    shadowRx: 190,
    patternScale: 1,
  },
  overalls: {
    body: 'M215 130 L385 130 L385 250 L410 262 L425 330 L440 690 L325 690 L302 400 L298 400 L275 690 L160 690 L175 330 L190 262 L215 250 Z',
    detail:
      'M270 165 L330 165 L330 220 L270 220 Z M190 262 L410 262 M300 262 L300 330 M225 130 Q205 90 240 60 M375 130 Q395 90 360 60',
    buttons: [
      [228, 142],
      [372, 142],
    ],
    ...GARMENT,
  },
  // ---- dresses --------------------------------------------------------------
  'dress-mini': {
    body: `${TANK_TOP} L405 400 L460 560 Q300 585 140 560 L195 400 ${TANK_TOP_CLOSE}`,
    detail: `${WAIST_SEAM} M245 140 Q245 248 300 262 Q355 248 355 140`,
    shadowY: 590,
    shadowRx: 170,
    patternScale: 1,
  },
  'dress-midi': {
    body: `${TANK_TOP} L405 400 L470 620 Q300 645 130 620 L195 400 ${TANK_TOP_CLOSE}`,
    detail: `${WAIST_SEAM} M245 140 Q245 248 300 262 Q355 248 355 140`,
    shadowY: 650,
    shadowRx: 180,
    patternScale: 1,
  },
  'dress-maxi': {
    body: `${TANK_TOP} L405 400 L480 690 Q300 712 120 690 L195 400 ${TANK_TOP_CLOSE}`,
    detail: `${WAIST_SEAM} M245 140 Q245 248 300 262 Q355 248 355 140`,
    shadowY: 705,
    shadowRx: 190,
    patternScale: 1,
  },
  jumpsuit: {
    body: `${TANK_TOP} L430 690 L325 690 L302 420 L298 420 L275 690 L170 690 ${TANK_TOP_CLOSE}`,
    detail:
      'M180 400 L420 400 M232 400 L234 425 M368 400 L366 425 M245 140 Q245 248 300 262 Q355 248 355 140',
    ...GARMENT,
  },
  // ---- outerwear ------------------------------------------------------------
  jacket: {
    body: longSleeveBody('L365 140 L300 240 L235 140', { wide: 5 }),
    detail:
      'M235 140 L270 112 L300 195 L330 112 L365 140 M300 240 L300 690 M284 240 L284 690 M205 280 L275 280 L275 340 L205 340 Z M325 280 L395 280 L395 340 L325 340 Z M195 655 L405 655 ' +
      cuffs(560, 5),
    buttons: [
      [292, 292],
      [292, 362],
      [292, 432],
      [292, 502],
      [292, 572],
      [292, 642],
      [240, 300],
      [360, 300],
    ],
    ...GARMENT,
  },
  puffer: {
    body: longSleeveBody('L425 110 Q300 90 175 110', { s: 150, cuff: 590, wide: 12 }),
    detail:
      'M195 260 L405 260 M195 340 L405 340 M195 420 L405 420 M195 500 L405 500 M195 580 L405 580 M300 150 L300 690 M118 300 L190 306 M108 400 L184 406 M100 500 L178 506 M482 300 L410 306 M492 400 L416 406 M500 500 L422 506 M195 150 Q300 175 405 150',
    ...GARMENT,
  },
  coat: {
    body: longSleeveBody('L365 135 L300 280 L235 135', { cuff: 590, flare: 20, wide: 5 }),
    detail: `${NOTCH_LAPELS} M300 280 L300 690 M200 470 L265 470 M335 470 L400 470 ${cuffs(590, 5)}`,
    buttons: [
      [283, 335],
      [317, 335],
      [283, 435],
      [317, 435],
      [283, 535],
      [317, 535],
    ],
    ...GARMENT,
  },
  trench: {
    body: longSleeveBody('L365 135 L300 280 L235 135', { cuff: 590, flare: 40, wide: 5 }),
    detail: `${NOTCH_LAPELS} M300 280 L300 690 M175 430 L425 430 L425 462 L175 462 Z M180 150 L235 145 M365 145 L420 150 ${cuffs(590, 5)}`,
    hardware:
      '<rect x="286" y="424" width="28" height="44" rx="4" fill="none" stroke="{H}" stroke-width="5"/>',
    buttons: [
      [275, 335],
      [325, 335],
      [275, 400],
      [325, 400],
      [275, 520],
      [325, 520],
    ],
    ...GARMENT,
  },
  // ---- footwear (side view, toe left) ---------------------------------------
  sneaker: {
    body: SNEAKER_BODY,
    detail: 'M250 440 L300 420 M270 470 L320 450 M290 500 L340 480',
    trim: SNEAKER_TRIM,
    ...SHOE,
  },
  'boot-ankle': {
    body: 'M110 520 C150 460 230 450 300 440 L310 330 Q390 315 470 335 L480 500 L490 540 L110 540 Z',
    detail:
      'M335 345 L343 470 L405 466 L398 342 Z M350 360 L352 455 M365 358 L367 452 M380 356 L382 450 M445 332 L450 296 M300 440 Q250 470 200 505',
    trim: HEEL_SOLE,
    ...SHOE,
  },
  'boot-knee': {
    body: 'M110 520 C150 460 230 450 300 440 L305 130 Q390 115 470 135 L480 500 L490 540 L110 540 Z',
    detail: 'M305 160 Q390 145 470 165 M322 175 L332 440 M300 440 Q250 470 200 505',
    trim: HEEL_SOLE,
    hardware: '<rect x="318" y="150" width="12" height="18" rx="2" fill="{H}"/>',
    ...SHOE,
  },
  loafer: {
    body: 'M105 525 C140 470 220 450 310 445 C400 440 460 470 490 505 L490 540 L105 540 Z',
    detail:
      'M235 472 Q300 452 375 465 M270 456 L276 484 L342 481 L346 452 M150 520 Q180 495 215 490',
    trim: THIN_SOLE,
    ...SHOE,
  },
  flat: {
    body: 'M105 530 C130 490 200 475 300 470 C400 465 460 480 490 510 L490 540 L105 540 Z',
    detail: 'M200 478 Q300 508 435 482 M283 468 L300 480 L317 468 M283 490 L300 480 L317 490',
    trim: THIN_SOLE,
    ...SHOE,
  },
  pump: {
    body: 'M100 548 C130 500 200 470 240 462 Q320 492 420 420 L445 395 L455 470 C400 486 330 516 250 536 Q170 552 100 556 Z',
    detail: 'M250 470 Q320 500 415 432 M150 522 Q185 505 225 498',
    trim: 'M100 556 Q170 552 250 536 C330 516 400 486 455 470 L460 486 L442 492 L450 640 L420 640 L406 494 C340 514 250 548 100 566 Z',
    shadowY: 660,
    shadowRx: 200,
    patternScale: 0.6,
  },
  sandal: {
    body: 'M110 545 L490 545 L490 520 L110 520 Z M180 520 Q230 448 300 458 Q370 448 420 520 Z M262 520 Q300 480 338 520 Z',
    detail: 'M198 520 Q240 470 300 476 Q360 470 402 520',
    trim: 'M100 545 L500 545 Q510 575 480 585 L120 585 Q90 575 100 545 Z',
    ...SHOE,
  },
  slide: {
    body: 'M110 545 L490 545 L490 520 L110 520 Z M160 520 Q260 420 400 445 Q440 455 440 520 Z',
    detail: 'M185 520 Q270 445 405 470',
    trim: 'M100 545 L500 545 Q510 592 480 602 L120 602 Q90 592 100 545 Z',
    ...SHOE,
  },
  // ---- bags -----------------------------------------------------------------
  tote: {
    body: TOTE_BODY,
    detail: TOTE_DETAIL,
    straps: 'M220 300 C220 220 260 200 300 200 C340 200 380 220 380 300',
    strapWidth: 10,
    ...BAG,
  },
  'shoulder-bag': {
    body: 'M140 380 L460 380 L470 620 L130 620 Z',
    accent: 'M140 380 L460 380 L456 500 Q300 522 144 500 Z',
    detail: 'M144 500 Q300 522 456 500',
    straps: 'M180 380 C170 250 250 200 300 200 C350 200 430 250 420 380',
    strapWidth: 10,
    hardware: '<circle cx="300" cy="510" r="15" fill="{H}"/>',
    ...BAG,
  },
  crossbody: {
    body: 'M160 400 L440 400 L450 610 L150 610 Z',
    accent: 'M160 400 L440 400 L442 482 L158 482 Z',
    detail: 'M158 482 L442 482',
    straps: 'M175 400 C120 200 220 120 300 120 C380 120 480 200 425 400',
    strapWidth: 7,
    hardware:
      '<circle cx="175" cy="402" r="9" fill="{H}"/><circle cx="425" cy="402" r="9" fill="{H}"/>',
    ...BAG,
  },
  clutch: {
    body: 'M120 380 L480 380 L480 580 L120 580 Z',
    accent: 'M120 380 L480 380 L300 505 Z',
    detail: 'M120 380 L300 505 L480 380',
    hardware: '<rect x="286" y="478" width="28" height="22" rx="4" fill="{H}"/>',
    shadowY: 600,
    shadowRx: 190,
    patternScale: 0.8,
  },
  'bucket-bag': {
    body: 'M170 340 Q300 362 430 340 L450 620 Q300 650 150 620 Z',
    detail:
      'M200 350 L205 402 M250 358 L253 405 M300 360 L300 406 M350 358 L347 405 M400 350 L395 402 M176 400 Q300 424 424 400',
    straps: 'M200 340 C200 240 260 220 300 220 C340 220 400 240 400 340',
    strapWidth: 9,
    hardware: '<circle cx="300" cy="418" r="8" fill="{H}"/>',
    ...BAG,
  },
  backpack: {
    body: 'M160 240 Q160 170 300 170 Q440 170 440 240 L450 640 Q300 662 150 640 Z',
    detail:
      'M200 430 L400 430 L405 620 L195 620 Z M175 300 Q300 322 425 300 M200 430 Q300 445 400 430',
    straps: 'M268 172 Q300 132 332 172',
    strapWidth: 10,
    hardware:
      '<circle cx="425" cy="302" r="7" fill="{H}"/><circle cx="400" cy="434" r="7" fill="{H}"/>',
    ...BAG,
  },
  'belt-bag': {
    body: 'M140 420 Q140 380 180 380 L420 380 Q460 380 460 420 L460 520 Q460 560 420 560 L180 560 Q140 560 140 520 Z',
    detail: 'M172 422 L428 422',
    straps: 'M140 470 L70 478 M460 470 L530 478',
    strapWidth: 14,
    hardware:
      '<rect x="56" y="458" width="30" height="40" rx="5" fill="{H}"/><circle cx="428" cy="424" r="6" fill="{H}"/>',
    shadowY: 590,
    shadowRx: 200,
    patternScale: 0.8,
  },
  duffle: {
    body: 'M130 380 Q100 380 100 420 L100 560 Q100 600 130 600 L470 600 Q500 600 500 560 L500 420 Q500 380 470 380 Z',
    detail:
      'M130 380 Q162 490 130 600 M470 380 Q438 490 470 600 M162 404 L438 404 M200 380 L200 600 M400 380 L400 600',
    straps: 'M200 380 C200 300 240 280 300 280 C360 280 400 300 400 380',
    strapWidth: 10,
    hardware: '<circle cx="438" cy="406" r="7" fill="{H}"/>',
    ...BAG,
  },
  // ---- accessories ----------------------------------------------------------
  cap: {
    body: 'M140 470 Q145 290 310 290 Q465 300 460 470 Z M140 470 L460 470 Q550 480 545 506 Q440 526 300 500 Z',
    detail:
      'M310 290 L302 470 M310 290 Q222 330 202 470 M310 290 Q398 330 416 470 M160 470 Q300 490 440 470',
    buttons: [[310, 292]],
    shadowY: 545,
    shadowRx: 200,
    patternScale: 0.8,
  },
  beanie: {
    body: `M150 500 Q150 292 300 278 Q450 292 450 500 Z M140 500 L460 500 L460 565 Q300 582 140 565 Z ${circlePath(300, 272, 30)}`,
    detail:
      'M200 500 L200 568 M250 500 L250 574 M300 500 L300 576 M350 500 L350 574 M400 500 L400 568 M300 302 L300 500 M240 320 Q235 400 250 500 M360 320 Q365 400 350 500',
    shadowY: 600,
    shadowRx: 170,
    patternScale: 0.8,
  },
  'bucket-hat': {
    body: 'M195 340 Q300 316 405 340 L420 440 L180 440 Z M180 440 L420 440 L490 446 Q530 470 500 506 Q300 536 100 506 Q70 470 110 446 Z',
    detail: 'M188 400 Q300 416 412 400 M120 470 Q300 502 480 470 M132 488 Q300 522 468 488',
    shadowY: 545,
    shadowRx: 210,
    patternScale: 0.8,
  },
  belt: {
    body: 'M90 420 Q300 360 510 420 L510 470 Q300 410 90 470 Z',
    detail: 'M100 432 Q300 373 500 432 M100 458 Q300 399 500 458',
    buttons: [
      [150, 445],
      [190, 440],
      [230, 436],
      [270, 433],
    ],
    hardware:
      '<rect x="494" y="404" width="60" height="82" rx="8" fill="none" stroke="{H}" stroke-width="10"/><rect x="520" y="412" width="8" height="64" rx="3" fill="{H}"/>',
    shadowY: 500,
    shadowRx: 230,
    patternScale: 0.6,
  },
  scarf: {
    body: 'M215 130 L285 130 L300 400 L315 130 L385 130 L375 620 Q345 640 335 690 L300 600 L265 690 Q255 640 225 620 Z',
    detail:
      'M300 400 L300 600 M240 632 L232 684 M258 648 L252 690 M360 632 L368 684 M342 648 L348 690 M225 300 L245 300 M355 300 L375 300',
    shadowY: 705,
    shadowRx: 110,
    patternScale: 0.8,
  },
  tie: {
    body: 'M300 130 L340 130 L350 175 L320 200 L360 640 L300 690 L240 640 L280 200 L250 175 L260 130 Z',
    detail: 'M255 175 L345 175 M300 200 L300 262',
    shadowY: 705,
    shadowRx: 90,
    patternScale: 0.6,
  },
  sunglasses: {
    body: 'M110 400 Q110 340 170 340 L270 340 Q300 340 300 380 L300 420 Q300 480 240 480 L170 480 Q110 480 110 420 Z M300 380 Q300 340 330 340 L430 340 Q490 340 490 400 L490 420 Q490 480 430 480 L360 480 Q300 480 300 420 Z',
    detail: 'M140 372 L176 356 M340 372 L376 356',
    straps: 'M110 362 L48 342 M490 362 L552 342',
    strapWidth: 8,
    shadowY: 505,
    shadowRx: 215,
    patternScale: 0.6,
  },
  socks: {
    body: 'M210 130 L290 130 L290 420 Q290 460 330 490 L400 540 Q430 565 395 600 Q365 620 320 585 L235 525 Q205 505 205 450 Z',
    detail:
      'M210 172 L290 172 M230 130 L230 172 M250 130 L250 172 M270 130 L270 172 M290 430 Q330 440 332 490 M345 580 Q380 585 400 560',
    shadowY: 630,
    shadowRx: 130,
    patternScale: 0.6,
  },
  'hair-clip': {
    body: 'M180 400 Q180 330 300 330 Q420 330 420 400 L420 440 Q300 480 180 440 Z',
    detail:
      'M210 466 L216 540 M250 476 L255 552 M300 480 L300 556 M350 476 L345 552 M390 466 L384 540 M200 380 Q300 360 400 380',
    hardware: '<circle cx="300" cy="412" r="9" fill="{H}"/>',
    shadowY: 575,
    shadowRx: 130,
    patternScale: 0.6,
  },
  watch: {
    body: `M255 130 L345 130 L350 320 L250 320 Z M250 480 L350 480 L345 690 L255 690 Z ${circlePath(300, 400, 96)}`,
    detail:
      'M300 400 L300 348 M300 400 L340 400 M270 170 L330 170 M270 200 L330 200 M270 230 L330 230 M270 560 L330 560 M270 590 L330 590',
    hardware:
      '<circle cx="300" cy="400" r="84" fill="{H}"/><circle cx="300" cy="400" r="70" fill="#F4F2EC"/><rect x="394" y="390" width="14" height="20" rx="3" fill="{H}"/>',
    buttons: [[300, 630]],
    shadowY: 705,
    shadowRx: 90,
    patternScale: 0.6,
  },
  // ---- jewelry ---------------------------------------------------------------
  necklace: {
    body: 'M300 520 Q342 562 342 604 Q342 652 300 652 Q258 652 258 604 Q258 562 300 520 Z',
    detail: 'M300 545 L300 625 M275 585 L325 585',
    straps: 'M150 200 Q160 420 300 520 Q440 420 450 200',
    strapWidth: 6,
    hardware: '<circle cx="300" cy="512" r="9" fill="{H}"/>',
    shadowY: 675,
    shadowRx: 90,
    patternScale: 0.6,
  },
  earrings: {
    body: `${circlePath(200, 292, 16)} ${circlePath(400, 292, 16)}`,
    detail: 'M200 308 L200 330 M400 308 L400 330',
    straps: `${circlePath(200, 390, 62)} ${circlePath(400, 390, 62)}`,
    strapWidth: 12,
    shadowY: 480,
    shadowRx: 150,
    patternScale: 0.6,
  },
  bracelet: {
    body: circlePath(300, 462, 20),
    detail: 'M180 380 Q300 352 420 380',
    straps: ellipsePath(300, 400, 150, 62),
    strapWidth: 22,
    shadowY: 510,
    shadowRx: 170,
    patternScale: 0.6,
  },
  ring: {
    body: 'M300 230 L372 302 L300 374 L228 302 Z',
    detail: 'M264 302 L336 302 M300 230 L300 374 M300 262 L340 302 L300 342 L260 302 Z',
    straps: ellipsePath(300, 450, 100, 118),
    strapWidth: 22,
    shadowY: 595,
    shadowRx: 120,
    patternScale: 0.6,
  },
  brooch: {
    body: ellipsePath(300, 400, 140, 120),
    detail:
      'M300 320 L360 400 L300 480 L240 400 Z M300 350 L338 400 L300 450 L262 400 Z M175 400 L110 445',
    hardware: '<circle cx="300" cy="400" r="20" fill="{H}"/>',
    shadowY: 545,
    shadowRx: 150,
    patternScale: 0.6,
  },
  // ---- activewear / swimwear -------------------------------------------------
  'sports-bra': {
    body: 'M195 260 L225 260 L240 390 Q300 420 360 390 L375 260 L405 260 L420 430 Q425 500 395 510 L205 510 Q175 500 180 430 Z',
    detail: 'M182 470 L418 470 M300 420 L300 470',
    shadowY: 530,
    shadowRx: 140,
    patternScale: 1,
  },
  'bikini-top': {
    body: 'M245 280 L165 470 L305 470 Z M355 280 L295 470 L435 470 Z',
    detail: 'M245 280 L235 470 M355 280 L365 470',
    straps: 'M245 280 Q300 200 355 280 M165 470 L95 484 M435 470 L505 484',
    strapWidth: 4,
    shadowY: 495,
    shadowRx: 180,
    patternScale: 1,
  },
  'bikini-bottom': {
    body: 'M175 320 L425 320 L410 400 Q330 440 300 500 Q270 440 190 400 Z',
    detail: 'M185 350 L415 350',
    straps: 'M175 320 L118 298 M175 320 L128 352 M425 320 L482 298 M425 320 L472 352',
    strapWidth: 4,
    shadowY: 520,
    shadowRx: 160,
    patternScale: 1,
  },
  'one-piece': {
    body: 'M215 200 L245 200 Q245 300 300 310 Q355 300 355 200 L385 200 L395 260 Q395 380 420 400 L410 560 Q330 600 300 660 Q270 600 190 560 L180 400 Q205 380 205 260 Z',
    detail: 'M250 200 Q250 305 300 320 Q350 305 350 200 M195 500 Q300 520 405 500',
    shadowY: 680,
    shadowRx: 150,
    patternScale: 1,
  },
  trunks: {
    body: pantsBody({ waist: 260, hem: 540, crotch: 420, hemOut: 25, hemIn: 20 }),
    detail:
      'M195 295 L405 295 M286 295 L276 342 M314 295 L324 342 M182 302 L170 520 M418 302 L430 520',
    shadowY: 560,
    shadowRx: 160,
    patternScale: 1,
  },
  // ---- loungewear -------------------------------------------------------------
  kaftan: {
    body: 'M235 130 L300 230 L365 130 L410 150 L520 330 L450 380 L470 690 L130 690 L150 380 L80 330 L190 150 Z',
    detail:
      'M235 130 L300 230 L365 130 M300 230 L294 322 M300 230 L308 330 M140 660 L460 660 M150 380 L450 380',
    shadowY: 705,
    shadowRx: 190,
    patternScale: 1,
  },
  pajama: {
    body: `${shortSleeveBody('L360 115 L300 200 L240 115', { s: 120, hem: 400 })} ${pantsBody({ waist: 430, crotch: 560 })}`,
    detail:
      'M240 115 L272 95 L300 160 L328 95 L360 115 M300 200 L300 400 M215 250 L270 250 L270 300 L215 300 Z M195 462 L405 462 M300 462 L300 520',
    buttons: [
      [300, 240],
      [300, 292],
      [300, 344],
      [300, 388],
    ],
    ...GARMENT,
  },
  nightgown: {
    body: 'M225 130 L235 130 Q245 240 300 240 Q355 240 365 130 L375 130 L390 260 L400 380 L450 690 Q300 712 150 690 L200 380 L210 260 Z',
    detail: 'M238 200 Q300 254 362 200 M160 665 Q300 686 440 665 M175 640 Q300 660 425 640',
    shadowY: 705,
    shadowRx: 170,
    patternScale: 1,
  },
  robe: {
    body: longSleeveBody('L360 140 L300 400 L240 140', { cuff: 540, flare: 20, wide: 10 }),
    accent: 'M240 140 L300 400 L360 140 L340 150 L300 340 L260 150 Z',
    detail:
      'M190 400 L410 400 L410 432 L190 432 Z M300 432 L268 560 M312 432 L342 560 M200 520 L262 520 M338 520 L400 520 ' +
      cuffs(540, 10),
    ...GARMENT,
  },
  // ---- tailoring -----------------------------------------------------------------
  blazer: {
    body: 'M170 150 L110 205 L95 560 L165 572 L190 330 L185 640 Q300 662 415 640 L410 330 L435 572 L505 560 L490 205 L430 150 L365 135 L300 330 L235 135 Z',
    accent: 'M235 135 L262 108 L300 262 L300 330 Z M365 135 L338 108 L300 262 L300 330 Z',
    detail:
      'M235 135 L262 108 L300 262 M365 135 L338 108 L300 262 M300 330 L300 640 M200 470 L265 470 L265 492 L200 492 Z M335 470 L400 470 L400 492 L335 492 Z M215 300 L262 300 ' +
      cuffs(),
    buttons: [
      [300, 385],
      [300, 455],
    ],
    ...GARMENT,
  },
  waistcoat: {
    body: 'M215 140 L245 140 L300 320 L355 140 L385 140 L390 200 Q385 300 425 330 L410 610 L300 650 L190 610 L175 330 Q215 300 210 200 Z',
    detail:
      'M300 320 L300 650 M205 500 L260 500 M340 500 L395 500 M235 400 L232 470 M365 400 L368 470',
    buttons: [
      [300, 362],
      [300, 422],
      [300, 482],
      [300, 542],
      [300, 602],
    ],
    shadowY: 670,
    shadowRx: 150,
    patternScale: 1,
  },
}

// ---------------------------------------------------------------------------
// Aliases (same body as the base unless noted, different detail)
// ---------------------------------------------------------------------------

const base = (id: string): Silhouette => {
  const s = BASE[id]
  if (!s) throw new Error(`render/silhouettes: missing base silhouette ${id}`)
  return s
}

const ALIASES: Record<string, Silhouette> = {
  'tee-long': {
    ...base('tee'),
    body: longSleeveBody(CREW_NECK),
    detail: `${TEE_DETAIL} ${cuffs()}`,
  },
  'tee-fitted': {
    ...base('tee'),
    body: 'M185 150 L125 205 L150 300 L205 285 L195 420 L205 690 L395 690 L405 420 L395 285 L450 300 L475 205 L415 150 Q360 195 300 195 Q240 195 185 150 Z',
    detail: 'M250 150 Q300 210 350 150 Q300 175 250 150 Z M205 285 L252 162 M395 285 L348 162',
  },
  'tank-cropped': {
    ...base('tank'),
    body: `${TANK_TOP} L425 470 L175 470 ${TANK_TOP_CLOSE}`,
    detail: 'M245 140 Q245 248 300 262 Q355 248 355 140 M175 448 L425 448',
    shadowY: 495,
    shadowRx: 140,
  },
  'tank-bodysuit': {
    ...base('tank'),
    body: `${TANK_TOP} L430 560 Q430 640 380 670 L340 690 L260 690 L220 670 Q170 640 170 560 ${TANK_TOP_CLOSE}`,
    detail:
      'M245 140 Q245 248 300 262 Q355 248 355 140 M175 560 Q205 640 260 690 M425 560 Q395 640 340 690',
  },
  'shirt-overshirt': {
    ...base('shirt'),
    body: longSleeveBody('L365 140 L300 240 L235 140', { wide: 8 }),
    detail: `${SHIRT_COLLAR} M300 240 L300 690 M200 300 L280 300 L280 380 L200 380 Z M320 300 L400 300 L400 380 L320 380 Z M200 322 L280 322 M320 322 L400 322 ${cuffs(560, 8)}`,
    buttons: [
      [300, 290],
      [300, 380],
      [300, 470],
      [300, 560],
      [300, 650],
      [240, 312],
      [360, 312],
    ],
  },
  'sweater-turtle': {
    ...base('sweater'),
    body: longSleeveBody('L410 100 Q300 76 190 100', { s: 145 }),
    detail: `M190 120 Q300 98 410 120 M190 138 Q300 116 410 138 M195 650 L405 650 ${HEM_RIBS} ${CUFFS}`,
  },
  'pants-cargo': {
    ...base('pants'),
    body: pantsBody({ hemOut: 25, hemIn: 20 }),
    detail:
      'M195 195 L405 195 M300 195 L300 262 M188 390 L258 390 L262 490 L192 490 Z M188 412 L258 412 M342 390 L412 390 L408 490 L338 490 Z M342 412 L412 412 M195 205 Q240 222 248 275 M405 205 Q360 222 352 275',
    buttons: [
      [300, 178],
      [225, 402],
      [375, 402],
    ],
  },
  'pants-fitted': {
    ...base('pants'),
    body: pantsBody({ hemOut: -25, hemIn: 12, hip: 15 }),
    detail: 'M195 195 L405 195 M205 330 L215 690 M395 330 L385 690 M300 195 L300 262',
    buttons: [],
  },
  'pants-cuff': {
    ...base('pants'),
    body: pantsBody({ hemOut: -15, hemIn: 15 }),
    detail:
      'M195 195 L405 195 M286 195 L278 255 M314 195 L322 255 M185 650 L285 650 M315 650 L415 650 M195 205 Q240 222 248 275 M405 205 Q360 222 352 275',
    buttons: [],
  },
  'shorts-fitted': {
    ...base('shorts'),
    body: pantsBody({ waist: 200, hem: 560, crotch: 360, hemOut: -20, hemIn: 12, hip: 15 }),
    detail: 'M195 235 L405 235 M205 370 L212 560 M395 370 L388 560',
    buttons: [],
    shadowY: 580,
  },
  'skirt-midi-pleated': {
    ...base('skirt-midi'),
    detail:
      'M195 212 L405 212 M232 212 L198 580 M266 212 L250 580 M300 212 L300 580 M334 212 L350 580 M368 212 L402 580',
  },
  'skirt-midi-pencil': {
    ...base('skirt-midi'),
    body: 'M200 180 L400 180 L415 580 Q300 596 185 580 Z',
    detail: 'M200 212 L400 212 M300 480 L300 580 M245 212 L240 270 M355 212 L360 270',
  },
  'dress-midi-placket': {
    ...base('dress-midi'),
    body: 'M175 150 L120 200 L150 300 L200 285 L200 400 L130 620 Q300 645 470 620 L400 400 L400 285 L450 300 L480 200 L425 150 L370 145 L300 210 L230 145 Z',
    detail:
      'M230 145 L262 125 L300 180 L338 125 L370 145 M300 210 L300 620 M200 400 L400 400 L400 428 L200 428 Z',
    buttons: [
      [300, 250],
      [300, 310],
      [300, 370],
      [300, 470],
      [300, 530],
      [300, 590],
    ],
  },
  'dress-midi-straps': {
    ...base('dress-midi'),
    body: 'M225 130 L235 130 Q245 232 300 232 Q355 232 365 130 L375 130 L390 250 L395 360 L420 620 Q300 640 180 620 L205 360 L210 250 Z',
    detail: 'M238 200 Q300 250 362 200 M200 500 L235 620',
  },
  'dress-midi-wrap': {
    ...base('dress-midi'),
    body: 'M180 150 L120 200 L150 300 L200 285 L200 400 L140 620 Q300 645 460 620 L400 400 L400 285 L450 300 L480 200 L420 150 L300 300 Z',
    detail:
      'M300 300 L372 400 M200 400 L400 400 M232 400 L205 492 M256 400 L242 498 M300 300 Q300 500 250 620',
  },
  'dress-midi-column': {
    ...base('dress-midi'),
    body: `${TANK_TOP} L410 620 Q300 634 190 620 ${TANK_TOP_CLOSE}`,
    detail:
      'M185 400 L415 400 M250 340 L245 420 M350 340 L355 420 M245 140 Q245 248 300 262 Q355 248 355 140',
  },
  'dress-maxi-gown': {
    ...base('dress-maxi'),
    body: 'M205 170 Q255 130 300 178 Q345 130 395 170 L400 400 L500 690 Q300 716 100 690 L200 400 Z',
    detail: 'M200 400 L400 400 M300 405 L282 690 M345 405 L405 690 M255 405 L195 690',
    shadowRx: 210,
  },
  'jacket-rib': {
    ...base('jacket'),
    body: longSleeveBody('Q380 178 300 178 Q220 178 180 150', { wide: 6 }),
    detail: `M232 150 Q300 190 368 150 M300 182 L300 690 M296 210 L304 210 M296 250 L304 250 M296 290 L304 290 M195 650 L405 650 ${HEM_RIBS} M130 330 L162 330 L162 392 ${cuffs(560, 6)}`,
    buttons: [],
  },
  'jacket-asym': {
    ...base('jacket'),
    body: longSleeveBody('L365 140 L300 262 L235 140', { wide: 6 }),
    accent: 'M235 140 L300 262 L300 200 L262 150 Z M365 140 L300 262 L300 200 L338 150 Z',
    detail:
      'M235 140 L300 262 L365 140 M300 262 L352 322 L342 690 M190 650 L410 650 M110 420 L150 420 L152 470 M120 205 Q140 255 175 260 ' +
      cuffs(560, 6),
    buttons: [
      [252, 176],
      [348, 176],
      [205, 665],
      [395, 665],
    ],
  },
  'jacket-hood': {
    ...base('jacket'),
    body: longSleeveBody('Q430 90 300 90 Q170 90 175 165', { s: 165, wide: 6 }),
    detail:
      'M215 165 Q300 100 385 165 Q300 200 215 165 Z M284 192 L278 285 M316 192 L322 285 M300 200 L300 690 M205 560 L270 560 M330 560 L395 560 M195 655 L405 655 ' +
      cuffs(560, 6),
    buttons: [],
  },
  'jacket-zip': {
    ...base('jacket'),
    body: longSleeveBody('L420 108 L180 108', { s: 150 }),
    detail: `M195 150 Q300 176 405 150 M300 108 L300 690 M128 205 L110 545 M144 205 L126 545 M472 205 L490 545 M456 205 L474 545 M195 650 L405 650 ${CUFFS}`,
    buttons: [],
  },
  'coat-hood': {
    ...base('coat'),
    body: longSleeveBody('Q435 85 300 85 Q165 85 170 165', {
      s: 165,
      cuff: 590,
      flare: 20,
      wide: 8,
    }),
    detail:
      'M215 165 Q300 100 385 165 Q300 200 215 165 Z M300 200 L300 690 M195 500 L270 500 L270 600 L195 600 Z M330 500 L405 500 L405 600 L330 600 Z M185 420 L415 420 ' +
      cuffs(590, 8),
    buttons: [
      [300, 260],
      [300, 340],
      [300, 560],
      [300, 640],
    ],
  },
  'sneaker-high': {
    ...base('sneaker'),
    body: 'M110 520 C150 440 240 425 320 405 L335 310 Q400 290 470 310 L490 500 L490 540 L110 540 Z',
    detail:
      'M250 440 L300 420 M270 470 L320 450 M290 500 L340 480 M342 420 L404 406 M347 380 L409 366 M352 340 L414 326 M110 520 Q170 470 222 480',
  },
  'sneaker-runner': {
    ...base('sneaker'),
    body: 'M105 520 C140 460 230 440 320 415 C390 395 450 430 490 500 L490 540 L105 540 Z',
    detail:
      'M180 500 Q300 440 470 470 M230 522 Q330 484 482 502 M300 430 L350 418 M310 460 L360 448',
    trim: 'M95 540 L505 540 Q515 592 480 602 L120 602 Q85 592 95 540 Z',
  },
  'loafer-laces': {
    ...base('loafer'),
    detail:
      'M270 458 L332 452 M275 478 L337 472 M280 498 L342 492 M195 482 Q230 462 265 458 M150 520 Q180 495 215 490',
  },
  'boot-ankle-laces': {
    ...base('boot-ankle'),
    detail:
      'M332 352 L402 346 M334 384 L404 378 M336 416 L406 410 M338 448 L408 442 M300 440 Q250 470 200 505 M445 332 L450 296',
  },
  'pump-straps': {
    ...base('pump'),
    detail:
      'M255 466 L300 522 M330 448 L290 530 M445 395 L452 350 L478 356 M250 470 Q320 500 415 432',
  },
  'slide-fluffy': {
    ...base('slide'),
    detail:
      'M160 520 Q176 486 192 506 Q208 466 226 492 Q244 448 262 478 Q280 436 300 466 Q320 428 340 458 Q360 428 380 452 Q400 430 418 458 Q436 452 440 520',
  },
  'shoulder-bag-mini': {
    ...base('shoulder-bag'),
    body: 'M190 430 L410 430 L418 600 L182 600 Z',
    accent: 'M190 430 L410 430 L407 512 Q300 528 193 512 Z',
    detail: 'M193 512 Q300 528 407 512',
    straps: 'M215 430 C205 320 260 280 300 280 C340 280 395 320 385 430',
    strapWidth: 7,
    hardware: '<circle cx="300" cy="520" r="11" fill="{H}"/>',
    shadowY: 620,
    shadowRx: 130,
  },
  'blazer-suit': {
    ...base('blazer'),
    detail:
      'M235 135 L262 108 L300 262 M365 135 L338 108 L300 262 M300 330 L300 640 M270 140 L300 240 L330 140 M200 470 L265 470 L265 492 L200 492 Z M335 470 L400 470 L400 492 L335 492 Z M215 300 L262 300 L258 286 L220 286 Z ' +
      cuffs(),
  },
  'blazer-satin': {
    ...base('blazer'),
    accent:
      'M235 135 Q300 210 300 330 Q300 210 365 135 L340 135 Q300 200 300 300 Q300 200 260 135 Z',
    detail:
      'M235 135 Q300 210 300 330 Q300 210 365 135 M300 330 L300 640 M200 470 L265 470 M335 470 L400 470 M280 152 L320 152 L300 166 Z ' +
      cuffs(),
    buttons: [[300, 400]],
  },
}

/** 65 base silhouettes + 31 aliases (§9.2 says 30 but lists 31), keyed by silhouette id. */
export const SILHOUETTES: Readonly<Record<string, Silhouette>> = { ...BASE, ...ALIASES }

export const SILHOUETTE_BASE_KEYS: readonly string[] = Object.keys(BASE)
export const SILHOUETTE_ALIAS_KEYS: readonly string[] = Object.keys(ALIASES)

/** Neutral generic garment used for unknown silhouette ids (a plain tee shape, no ribbing). */
export const GENERIC_SILHOUETTE: Silhouette = {
  body: TEE_BODY,
  detail: 'M245 150 Q300 205 355 150',
  ...GARMENT,
}

/** Silhouette for an id, falling back to the generic garment; never throws. */
export function resolveSilhouette(id: string | null | undefined): Silhouette {
  return (id && SILHOUETTES[id]) || GENERIC_SILHOUETTE
}

// ---------------------------------------------------------------------------
// silhouetteFor (§9.2)
// ---------------------------------------------------------------------------

/** Static subcategory → silhouette id map (§9.2); attribute-dependent variants are applied by `silhouetteFor`. */
export const SUBCATEGORY_SILHOUETTE: Readonly<Record<string, string>> = {
  tee: 'tee',
  'performance-tee': 'tee-fitted',
  'rash-guard': 'tee-fitted',
  'tank-top': 'tank',
  camisole: 'tank',
  'crop-top': 'tank-cropped',
  bodysuit: 'tank-bodysuit',
  'polo-shirt': 'shirt',
  'button-down-shirt': 'shirt',
  'linen-shirt': 'shirt',
  'dress-shirt': 'shirt',
  overshirt: 'shirt-overshirt',
  blouse: 'blouse',
  'crewneck-sweater': 'sweater',
  turtleneck: 'sweater-turtle',
  cardigan: 'cardigan',
  hoodie: 'hoodie',
  sweatshirt: 'sweatshirt',
  jeans: 'pants',
  chinos: 'pants',
  'tailored-trousers': 'pants',
  'wide-leg-trousers': 'pants-wide',
  'cargo-pants': 'pants-cargo',
  leggings: 'pants-fitted',
  'training-tights': 'pants-fitted',
  joggers: 'pants-cuff',
  sweatpants: 'pants-cuff',
  'casual-shorts': 'shorts',
  'running-shorts': 'shorts',
  'lounge-shorts': 'shorts',
  'bike-shorts': 'shorts-fitted',
  'mini-skirt': 'skirt-mini',
  'midi-skirt': 'skirt-midi',
  'maxi-skirt': 'skirt-maxi',
  'pleated-skirt': 'skirt-midi-pleated',
  'pencil-skirt': 'skirt-midi-pencil',
  overalls: 'overalls',
  'mini-dress': 'dress-mini',
  'midi-dress': 'dress-midi',
  'knit-dress': 'dress-midi',
  'maxi-dress': 'dress-maxi',
  'shirt-dress': 'dress-midi-placket',
  'slip-dress': 'dress-midi-straps',
  'wrap-dress': 'dress-midi-wrap',
  'sheath-dress': 'dress-midi-column',
  'evening-gown': 'dress-maxi-gown',
  jumpsuit: 'jumpsuit',
  'denim-jacket': 'jacket',
  'bomber-jacket': 'jacket-rib',
  'biker-jacket': 'jacket-asym',
  windbreaker: 'jacket-hood',
  'fleece-jacket': 'jacket-zip',
  'track-jacket': 'jacket-zip',
  'puffer-jacket': 'puffer',
  parka: 'coat-hood',
  'wool-coat': 'coat',
  'trench-coat': 'trench',
  sneaker: 'sneaker',
  'running-shoe': 'sneaker-runner',
  loafer: 'loafer',
  derby: 'loafer-laces',
  'ballet-flat': 'flat',
  'chelsea-boot': 'boot-ankle',
  'ankle-boot': 'boot-ankle',
  'combat-boot': 'boot-ankle-laces',
  'hiking-boot': 'boot-ankle-laces',
  'knee-high-boot': 'boot-knee',
  pump: 'pump',
  'heeled-sandal': 'pump-straps',
  'flat-sandal': 'sandal',
  slide: 'slide',
  slipper: 'slide-fluffy',
  tote: 'tote',
  'shoulder-bag': 'shoulder-bag',
  'mini-bag': 'shoulder-bag-mini',
  crossbody: 'crossbody',
  clutch: 'clutch',
  'bucket-bag': 'bucket-bag',
  backpack: 'backpack',
  'belt-bag': 'belt-bag',
  duffle: 'duffle',
  'baseball-cap': 'cap',
  beanie: 'beanie',
  'bucket-hat': 'bucket-hat',
  belt: 'belt',
  watch: 'watch',
  scarf: 'scarf',
  tie: 'tie',
  sunglasses: 'sunglasses',
  socks: 'socks',
  'hair-clip': 'hair-clip',
  necklace: 'necklace',
  earrings: 'earrings',
  bracelet: 'bracelet',
  ring: 'ring',
  brooch: 'brooch',
  'sports-bra': 'sports-bra',
  'bikini-top': 'bikini-top',
  'bikini-bottom': 'bikini-bottom',
  'one-piece': 'one-piece',
  'swim-trunks': 'trunks',
  'cover-up': 'kaftan',
  'pajama-set': 'pajama',
  nightgown: 'nightgown',
  robe: 'robe',
  blazer: 'blazer',
  waistcoat: 'waistcoat',
  'two-piece-suit': 'blazer-suit',
  tuxedo: 'blazer-satin',
}

export interface SilhouetteColumnInput {
  fit?: string | null
  length?: string | null
  sleeve?: string | null
}

/**
 * Resolves the silhouette id for a subcategory (§9.2): the static map plus the attribute-dependent
 * variants (`tee` + long sleeve → `tee-long`; trousers with a wide/flared fit → `pants-wide`;
 * pleated skirt with `length = mini` → `skirt-mini`; sneaker with `height = high` → `sneaker-high`).
 * Unknown subcategories resolve to `generic`, which `renderProductSvg` draws as a neutral garment.
 */
export function silhouetteFor(
  subcategory: string,
  attributes: Readonly<Record<string, string | number | boolean>> = {},
  columns: SilhouetteColumnInput = {},
): string {
  const id = SUBCATEGORY_SILHOUETTE[subcategory]
  if (!id) return SILHOUETTES[subcategory] ? subcategory : 'generic'
  switch (subcategory) {
    case 'tee':
      return columns.sleeve === 'long' ? 'tee-long' : id
    case 'jeans':
    case 'chinos':
    case 'tailored-trousers':
      return columns.fit === 'wide' || columns.fit === 'flared' ? 'pants-wide' : id
    case 'pleated-skirt':
      return columns.length === 'mini' ? 'skirt-mini' : id
    case 'sneaker':
      return attributes['height'] === 'high' ? 'sneaker-high' : id
    default:
      return id
  }
}
