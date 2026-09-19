/**
 * The piece you just added travels to the bag, so the count in the nav changes for a reason you
 * watched rather than one you have to notice. Runs on submit, not on the server's reply: the
 * latency spec asks an instant action to acknowledge within 100 ms, and a failed add still says
 * so in the form's own error line.
 *
 * Plain Web Animations API; the project carries no animation dependency.
 *
 * The node goes into `#fly-layer` from the root layout rather than onto `document.body`. React
 * owns the body, and the add itself triggers a soft navigation, which clears nodes appended there
 * while they are still in the air — the animation gets cancelled a fifth of the way through.
 */

const DURATION_MS = 520
const BOUNCE_MS = 260
/**
 * Eased at both ends. DESIGN.md's tile lift uses an expo ease-out, which suits a 4px nudge but
 * spends 60 % of this journey in its first 90 ms — the piece bolts, then crawls the rest.
 */
const FLIGHT_EASE = 'cubic-bezier(0.4, 0.05, 0.2, 1)'
/** The bag's acknowledgement is a short move, so it keeps the expo ease-out. */
const BOUNCE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** The visible bag: the top bar above `md`, the tab bar below it. */
function visibleBagTarget(): { el: Element; rect: DOMRect } | null {
  for (const el of document.querySelectorAll('[data-bag-target]')) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return { el, rect }
  }
  return null
}

export function flyProductToBag(productId: number, delay = 0): void {
  if (typeof window === 'undefined' || prefersReducedMotion()) return
  const origin = document.querySelector(`[data-product-image="${productId}"]`)
  const target = visibleBagTarget()
  if (!origin || !target) return
  const from = origin.getBoundingClientRect()
  if (from.width === 0 || from.height === 0) return

  const layer = document.getElementById('fly-layer')
  if (!layer) return

  const node = document.createElement('div')
  node.setAttribute('aria-hidden', 'true')
  Object.assign(node.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    borderRadius: '8px',
    overflow: 'hidden',
    willChange: 'transform, opacity',
  })
  const img = document.createElement('img')
  img.src = `/api/products/${productId}/image`
  img.alt = ''
  Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' })
  node.append(img)
  layer.append(node)

  const dx = target.rect.left + target.rect.width / 2 - (from.left + from.width / 2)
  const dy = target.rect.top + target.rect.height / 2 - (from.top + from.height / 2)
  // Lifted through the middle: a straight line reads as a file transfer, an arc as a thing thrown.
  node.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      {
        transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 56}px) scale(0.42)`,
        opacity: 0.95,
        offset: 0.6,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0.15 },
    ],
    { duration: DURATION_MS, delay, easing: FLIGHT_EASE, fill: 'forwards' },
  )
  // Cleared on a timer rather than from `finish`: the duration is ours, so the moment is known,
  // and not every engine delivers the completion event — the desktop app's webview reaches
  // `playState: 'finished'` without ever firing `finish` or settling `animation.finished`, which
  // would leave every added piece parked on the layer. Removing twice is harmless.
  window.setTimeout(() => {
    node.remove()
    target.el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
      { duration: BOUNCE_MS, easing: BOUNCE_EASE },
    )
  }, delay + DURATION_MS)
}

/** Several pieces at once (an outfit): staggered so they read as a handful, not a single blur. */
export function flyProductsToBag(productIds: readonly number[]): void {
  productIds.slice(0, 6).forEach((id, i) => flyProductToBag(id, i * 90))
}
