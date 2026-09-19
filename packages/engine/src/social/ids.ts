/** Runtime id generation (the one place in the social module allowed to be non-deterministic). */
import { nanoid } from 'nanoid'

export function newId(override?: string): string {
  return override ?? nanoid()
}

export function newShareToken(override?: string): string {
  return override ?? nanoid(16)
}
