# apps/web — shell notes

Notes from the app-shell pass for the agents implementing feature pages. Nothing here changes the
cross-package contracts; items under "Contract observations" are suggestions only.

## How the shell fits together

- Runtime: the App Router runs on vinext (Vite) inside the Cloudflare Workers runtime — `vinext dev`
  starts workerd with the local D1 (`.wrangler/state`) and R2 bindings from `wrangler.jsonc`;
  `pnpm deploy` builds and publishes the Worker. `src/server/db.ts` wraps the `DB` binding,
  `src/server/storage.ts` the `STORAGE` bucket (both swappable in tests: `setDb`, `setStorage`).
- `src/app/layout.tsx` — fonts (`next/font/google`: Inter, Bricolage Grotesque), `SiteNav`, `SiteFooter`,
  the phone `TabBar`. The nav and layout read `getSessionUser()` / `bagCount()`; every route is
  therefore dynamic. The layout's opening comment is the design contract ("The Rack"); see `DESIGN.md`.
- `src/components/ui` — the UI kit (`import { … } from '@/components/ui'`). Server-compatible; the
  only client component in the shell is `components/shell/nav-links.tsx` (active-link state).
- `src/server/auth.ts` — `getSessionUser()`, `requireUser(next)`, `loginAs`, `createGuest`, `logout`.
  `requireUser` takes the current path explicitly because React Server Components have no
  pathname API; call it as `requireUser('/me')`.
- `src/server/bag.ts` — cookie bag (`ll_bag`), `getBag` / `bagCount` for reads; the write functions
  are only legal in server actions / route handlers (`src/server/actions/bag.ts` wraps them).
- `src/server/format.ts` — `formatTwd`, `formatRelative`, `pluralize`, `formatCompact`, `humanize`.
- `src/server/storage.ts` — R2 access (`getStorage().put/get/delete`, `isSafeKey`); `src/server/looks.ts`
  stores owner photos as `photos/<userId>.<ext>` and loads them back as reference photos.
- `src/server/svg.ts` — `svgResponse`, `escapeXml` for image route handlers.
- `src/lib/cn.ts` — dependency-free `cn()`; `src/lib/hash.ts` — FNV-1a for seeds.

Design tokens live in `src/app/globals.css` (`@theme`): `ink`, `paper` (the wall), `card`, `mist`
(panel), `line` (the rail), `muted`, `accent` (tag red `#c8321e`, one thing per screen),
`accent-soft`; utilities `display`, `hairline`, `tabular`, `tile-lift`, `rail-track`, `rail-item`,
`progress-line` (`eyebrow` is now a plain 12px label — never above a heading). Radii: 3px tags,
6px controls, 8px tiles. Light theme only. Engine internals render only when `isEngineView()`
(`src/server/engine-view.ts`, footer switch); one-line reasons come from `src/lib/reason.ts`.

## Decisions / workarounds

- Env: the Worker reads `process.env` (nodejs_compat) from `wrangler.jsonc` `vars` plus
  `apps/web/.dev.vars` in dev and `wrangler secret put` in production; the repo-root `.env` only
  feeds the Node scripts (seed, analytics, tests) via `loadEnv()` from `@lookline/db/node`.
- Session cookie is not marked `secure` so the demo works over plain `http://<lan-ip>:3000` in
  production mode. Add `secure: true` in `loginAs` before exposing it on a public host.
- `getSessionUser` swallows database errors (one console warning) and reports "signed out" so
  the shell still renders when D1 is misconfigured; `/login` shows the DB error explicitly.
- `users.lastSeenAt` is refreshed at most every 10 minutes from `getSessionUser`.
- Image routes: product SVG is `immutable`; `GET /api/looks/[id]/image` streams the R2 object in
  `looks.image_path` (ETag / 304) or renders the composition poster on demand when there is none;
  both are `private, no-store`. The product placeholder is a 500 as requested.
- Look drafts persist nothing to R2: only a completed provider render writes
  `looks/<id>-<generationId>.<ext>`; a stale or cancelled generation deletes its object.
- `next/font/google` is loaded from the Google CDN at runtime under vinext (no self-hosting);
  the `@theme inline` font stacks in `globals.css` fall back to Georgia / system sans.
- No new dependencies were added (`cn` is hand-written; `zod` and `nanoid` were already
  dependencies of `@lookline/web`).

## Contract observations (for package owners; not changed here)

- `@lookline/catalog` `hashSeed` is a stub, so the web app uses its own FNV-1a (`src/lib/hash.ts`)
  for guest `avatarSeed` and poster seeds. Switch to `hashSeed` once it lands if determinism across
  packages matters.
- `@lookline/engine` `STYLE_PRESETS` is empty for now, so `LookCard` humanises the preset slug.
  Pass `presetLabel` from `STYLE_PRESETS.find(p => p.slug === look.stylePreset)?.name` later.
- `LookPosterInput.editionNumber` is set to `look.depth + 1` by the image route; if the engine has
  a different notion of "edition number", the route is the place to change it.
- `Explanation.factors[].factor` is typed as `FactorName`; `FactorBreakdown` also tolerates
  unknown names (falls back to a grey swatch and the raw name) so new factors render without
  UI changes.
