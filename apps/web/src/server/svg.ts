/** Escape text for use inside SVG/XML text nodes and attributes. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Build an `image/svg+xml` response with the given cache policy. */
export function svgResponse(
  svg: string,
  options: { status?: number; cacheControl?: string } = {},
): Response {
  return new Response(svg, {
    status: options.status ?? 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': options.cacheControl ?? 'public, max-age=31536000, immutable',
    },
  })
}
