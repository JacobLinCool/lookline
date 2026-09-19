/** Accepted inputs for `cn`: strings, falsy values, nested arrays and `{ class: condition }` maps. */
export type ClassValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | ClassValue[]
  | Record<string, unknown>

/**
 * Join class names, skipping falsy values. Dependency-free clsx equivalent.
 * Later classes are appended, not merged; keep component base styles minimal so callers can
 * override with their own utilities.
 */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = []
  const push = (value: ClassValue): void => {
    if (!value) return
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
      out.push(String(value))
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) push(item)
      return
    }
    if (typeof value === 'object') {
      for (const [key, enabled] of Object.entries(value)) if (enabled) out.push(key)
    }
  }
  for (const input of inputs) push(input)
  return out.join(' ')
}
