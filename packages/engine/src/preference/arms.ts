/**
 * Blend-weight arms of the contextual bandit (ENGINE_SPEC §4.4) in the array form the bandit
 * indexes by position. The canonical weights live in `src/recommend/weights.ts` (recommend
 * module); this file only adapts them.
 */
import type { FactorName } from '../types'
import { ARMS as ARM_WEIGHTS, ARM_NAMES, DEFAULT_WEIGHTS, type ArmName } from '../recommend/weights'

export type { ArmName }
export { ARM_NAMES, DEFAULT_WEIGHTS }

export interface Arm {
  name: ArmName
  weights: Record<FactorName, number>
}

/** Arms in table order (`balanced` first = default); positive weights of each sum to 1.00. */
export const ARMS: readonly Arm[] = ARM_NAMES.map((name) => ({ name, weights: ARM_WEIGHTS[name] }))

export function armIndexByName(name: string): number {
  return ARMS.findIndex((a) => a.name === name)
}

export function armByName(name: string): Arm | undefined {
  return ARMS.find((a) => a.name === name)
}
