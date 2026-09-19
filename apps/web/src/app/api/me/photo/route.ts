import { getSessionUser } from '@/server/auth'
import { getStorage, isSafeKey } from '@/server/storage'

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
}

export async function GET(): Promise<Response> {
  const user = await getSessionUser()
  if (!user) return new Response('Sign in required', { status: 401, headers: privateHeaders })
  if (!user.photoPath || !isSafeKey(user.photoPath))
    return new Response('No saved photo', { status: 404, headers: privateHeaders })

  try {
    const object = await getStorage().get(user.photoPath)
    if (!object) return new Response('No saved photo', { status: 404, headers: privateHeaders })
    return new Response(object.body, {
      headers: {
        ...privateHeaders,
        'Content-Type': object.contentType,
        'Content-Length': String(object.size),
        ETag: object.etag,
      },
    })
  } catch (error) {
    console.warn(`[lookline] could not stream saved photo for ${user.id}`, error)
    return new Response('Photo unavailable', { status: 503, headers: privateHeaders })
  }
}
