'use server'

import { eq, users } from '@lookline/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { MAX_PHOTO_BYTES, savePhoto, type ReferencePhoto } from '@/server/looks'
import { getStorage, isSafeKey } from '@/server/storage'

const SUPPORTED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function backWith(key: 'photo' | 'photoError', value: string): never {
  redirect(`/me?${key}=${encodeURIComponent(value)}`)
}

/** Replaces the signed-in user's private reference photo used by future image generation. */
export async function updateProfilePhotoAction(formData: FormData): Promise<void> {
  const user = await requireUser('/me')
  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) backWith('photoError', 'required')
  if (!SUPPORTED_PHOTO_TYPES.has(file.type)) backWith('photoError', 'type')
  if (file.size > MAX_PHOTO_BYTES) backWith('photoError', 'size')

  const photo: ReferencePhoto = {
    mimeType: file.type,
    data: Buffer.from(await file.arrayBuffer()),
  }
  try {
    const photoPath = await savePhoto(user.id, photo)
    await getDb().db.update(users).set({ photoPath }).where(eq(users.id, user.id))
    if (user.photoPath && user.photoPath !== photoPath && isSafeKey(user.photoPath)) {
      await getStorage()
        .delete(user.photoPath)
        .catch(() => {})
    }
  } catch (error) {
    console.warn('[profile] could not save the reference photo', error)
    backWith('photoError', 'save')
  }

  revalidatePath('/me')
  redirect('/me?photo=updated')
}
