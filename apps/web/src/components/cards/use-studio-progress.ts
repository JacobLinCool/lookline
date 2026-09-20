'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface StudioProgress {
  candidates: Array<{ id: string; position: number }>
  /** Renders still running; the grid shows one filling slot for each. */
  pending: number
  /** Why the last render produced nothing, once none is running to explain an empty slot. */
  error: string | null
}

/** How often the page asks. A render takes tens of seconds, so this is not a tight loop. */
const POLL_MS = 3_000

/**
 * Follow a session's renders.
 *
 * A candidate is no longer written when the button is clicked — the image model takes tens of
 * seconds and the server action returns long before it answers — so the grid cannot learn what
 * happened from the submit. It asks instead, and stops as soon as nothing is outstanding.
 *
 * The page around the grid is server-rendered and reads the same session, so the last poll of a
 * run asks for it again; the polls in between only move pictures into the grid, which this state
 * already holds.
 */
export function useStudioProgress(sessionId: string, initial: StudioProgress): StudioProgress {
  const router = useRouter()
  const [polled, setPolled] = useState<StudioProgress | null>(null)

  // What the server last told us, by value: the page hands down a fresh object on every render,
  // so depending on its identity would throw away each poll the moment it arrived. When the
  // server's own answer changes — a refresh, another tab settling this session — it wins, and the
  // polled state is dropped rather than argued with.
  const fromServer = JSON.stringify(initial)
  const [seen, setSeen] = useState(fromServer)
  if (seen !== fromServer) {
    setSeen(fromServer)
    setPolled(null)
  }
  const progress = (seen === fromServer ? polled : null) ?? initial

  useEffect(() => {
    if (progress.pending === 0) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const response = await fetch(`/api/studio/${sessionId}/candidates`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]),
          cache: 'no-store',
        })
        if (controller.signal.aborted) return
        if (response.ok) {
          const next = (await response.json()) as StudioProgress
          setPolled(next)
          if (next.pending === 0) {
            // Everything this run was going to produce has arrived. Read the page again so the
            // server's view of the session and this grid cannot disagree from here on.
            router.refresh()
            return
          }
        }
      } catch {
        // A dropped poll is not a failed render: the next one asks again, and a render that
        // really did die is retired by the server's own staleness check.
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, POLL_MS)
    }

    timer = setTimeout(poll, POLL_MS)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [progress.pending, sessionId, router])

  return progress
}
