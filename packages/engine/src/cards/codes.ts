/**
 * Verification codes, kept out of `rules.ts` because they need `nanoid` and `nanoid` needs
 * `crypto`: the tier bands next door are imported by the studio picker in the browser, and one
 * `node:crypto` in that file's import graph is enough to break the client bundle.
 */
import { customAlphabet } from 'nanoid'

/**
 * Codes are read off a card and typed into the verification box, so the alphabet leaves out
 * everything that fails that trip: nanoid's own `-` and `_` (which collide with the `LL-` prefix
 * and with each other in handwriting), and the 0/O, 1/I/L pairs.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const codeBody = customAlphabet(CODE_ALPHABET, 8)

/** A fresh verification code, e.g. `LL-7KQD3XJP`. Unique-indexed wherever it is stored. */
export function verificationCode(): string {
  return `LL-${codeBody()}`
}
