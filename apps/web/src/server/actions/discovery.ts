'use server'
import { revalidatePath } from 'next/cache'
import {
  inviteFriend,
  respondFriend,
  setCardVisibility,
  setPurchaseSharing,
} from '@lookline/engine/discovery'
import type { ActionResult } from '@/components/latency/instant-form'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { getI18n } from '@/i18n/server'

export async function friendAction(data: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const { t } = await getI18n()
  const { db } = getDb()
  const action = data.get('action')
  const other = data.get('other')
  const handle = data.get('handle')
  if (action === 'invite' && typeof handle === 'string' && handle.length <= 100) {
    if (!(await inviteFriend(db, user.id, handle)))
      return { ok: false, message: t.home.discovery.invitationFailed }
  } else if (
    (action === 'accept' || action === 'remove') &&
    typeof other === 'string' &&
    other.length <= 100
  ) {
    await respondFriend(db, user.id, other, action)
  } else if (action === 'sharing')
    await setPurchaseSharing(db, user.id, data.get('purchases') === 'on')
  else return { ok: false, message: t.common.error }
  revalidatePath('/me/friends')
  revalidatePath('/')
  return { ok: true }
}
export async function cardVisibilityAction(data: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const { t } = await getI18n()
  const id = data.get('id'),
    visibility = data.get('visibility')
  if (typeof id !== 'string' || !['private', 'link', 'public'].includes(String(visibility)))
    return { ok: false, message: t.common.error }
  await setCardVisibility(getDb().db, user.id, id, visibility as 'private' | 'link' | 'public')
  revalidatePath(`/cards/${id}`)
  revalidatePath('/')
  return { ok: true }
}
