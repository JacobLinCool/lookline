'use server'

import { redirect } from 'next/navigation'
import { createGuest, loginAs, logout, safeNextPath } from '@/server/auth'

/** `<form action={loginAsAction}>` with hidden `userId` and optional `next`. */
export async function loginAsAction(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') ?? '').trim()
  const next = safeNextPath(formData.get('next'))
  if (!userId) redirect(`/login?error=missing&next=${encodeURIComponent(next)}`)
  try {
    await loginAs(userId)
  } catch (error) {
    console.error('[lookline] loginAs failed', error)
    redirect(`/login?error=unknown&next=${encodeURIComponent(next)}`)
  }
  redirect(next)
}

/** `<form action={guestLoginAction}>` with `displayName` and optional `next`. */
export async function guestLoginAction(formData: FormData): Promise<void> {
  const displayName = String(formData.get('displayName') ?? '')
  const next = safeNextPath(formData.get('next'))
  try {
    await createGuest(displayName)
  } catch (error) {
    console.error('[lookline] createGuest failed', error)
    redirect(`/login?error=guest&next=${encodeURIComponent(next)}`)
  }
  redirect(next)
}

/** Sign out and return to the home page. */
export async function logoutAction(): Promise<void> {
  await logout()
  redirect('/')
}
