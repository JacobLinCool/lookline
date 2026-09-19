/** 32-bit FNV-1a hash of a string, returned as a non-negative int32 (fits Postgres `integer`). */
export function hashString(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) & 0x7fffffff
}

/** Parse a seed param: decimal integers are used as-is, anything else is hashed. */
export function seedFromParam(param: string): number {
  if (/^\d{1,10}$/.test(param)) return Number(param) & 0x7fffffff
  return hashString(param)
}
