import { cookies } from 'next/headers'
import { z } from 'zod'

/**
 * Cookie-based shopping bag. `ll_bag` holds JSON `[{ productId, size, qty }]` (max 20 lines).
 * Reading works anywhere on the server; writing (`addToBag`, `removeFromBag`, `setBagQty`,
 * `clearBag`) is only allowed from server actions and route handlers.
 */

export const BAG_COOKIE = 'll_bag'
export const BAG_MAX_LINES = 20
export const BAG_MAX_QTY = 10
const BAG_TTL_SECONDS = 30 * 24 * 60 * 60

const lineSchema = z.object({
  productId: z.number().int().positive(),
  size: z.string().max(24).nullable(),
  qty: z.number().int().min(1).max(BAG_MAX_QTY),
})
const bagSchema = z.array(lineSchema).max(BAG_MAX_LINES)

export type BagLine = z.infer<typeof lineSchema>

export type BagResult =
  | { ok: true; lines: BagLine[] }
  | { ok: false; reason: 'full' | 'invalid'; lines: BagLine[] }

/** Parse a raw cookie value; anything malformed yields an empty bag. */
export function parseBag(raw: string | undefined): BagLine[] {
  if (!raw) return []
  try {
    const parsed = bagSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/** Current bag lines for this request. */
export async function getBag(): Promise<BagLine[]> {
  const store = await cookies()
  return parseBag(store.get(BAG_COOKIE)?.value)
}

/** Total quantity across lines (the nav badge). */
export async function bagCount(): Promise<number> {
  const lines = await getBag()
  return lines.reduce((sum, line) => sum + line.qty, 0)
}

async function writeBag(lines: BagLine[]): Promise<void> {
  const store = await cookies()
  if (lines.length === 0) {
    store.delete(BAG_COOKIE)
    return
  }
  store.set({
    name: BAG_COOKIE,
    value: JSON.stringify(lines),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: BAG_TTL_SECONDS,
  })
}

const sameLine = (a: BagLine, productId: number, size: string | null): boolean =>
  a.productId === productId && a.size === size

/** Add `qty` (default 1) of a product/size; merges into an existing line. */
export async function addToBag(input: {
  productId: number
  size?: string | null
  qty?: number
}): Promise<BagResult> {
  return addManyToBag([input])
}

/** Validate every line before committing an outfit; a full bag never accepts half an outfit. */
export async function addManyToBag(
  inputs: { productId: number; size?: string | null; qty?: number }[],
): Promise<BagResult> {
  const lines = await getBag()
  const proposed = lines.map((line) => ({ ...line }))
  if (!inputs.length || inputs.length > BAG_MAX_LINES)
    return { ok: false, reason: 'invalid', lines }
  for (const input of inputs) {
    const parsed = lineSchema.safeParse({
      productId: input.productId,
      size: input.size ?? null,
      qty: input.qty ?? 1,
    })
    if (!parsed.success) return { ok: false, reason: 'invalid', lines }
    const line = parsed.data
    const existing = proposed.find((item) => sameLine(item, line.productId, line.size))
    if (existing) existing.qty = Math.min(BAG_MAX_QTY, existing.qty + line.qty)
    else {
      if (proposed.length >= BAG_MAX_LINES) return { ok: false, reason: 'full', lines }
      proposed.push(line)
    }
  }
  await writeBag(proposed)
  return { ok: true, lines: proposed }
}

/** Remove one line (product + size). Omit `size` to remove every line of that product. */
export async function removeFromBag(productId: number, size?: string | null): Promise<BagLine[]> {
  const lines = (await getBag()).filter((l) =>
    size === undefined ? l.productId !== productId : !sameLine(l, productId, size),
  )
  await writeBag(lines)
  return lines
}

/** Set an exact quantity; `qty <= 0` removes the line. */
export async function setBagQty(
  productId: number,
  size: string | null,
  qty: number,
): Promise<BagLine[]> {
  if (!Number.isInteger(qty) || qty <= 0) return removeFromBag(productId, size)
  const lines = await getBag()
  const existing = lines.find((l) => sameLine(l, productId, size))
  if (existing) existing.qty = Math.min(BAG_MAX_QTY, qty)
  else if (lines.length < BAG_MAX_LINES) {
    lines.push({ productId, size, qty: Math.min(BAG_MAX_QTY, qty) })
  }
  await writeBag(lines)
  return lines
}

/** Empty the bag (after checkout). */
export async function clearBag(): Promise<void> {
  await writeBag([])
}
