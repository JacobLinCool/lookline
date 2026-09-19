import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import vinext from 'vinext'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // The repo keeps its Cloudflare credentials in the root `.env`; Vite reads those files but
  // leaves `process.env` alone, and the remote-binding proxy authenticates through `process.env`.
  Object.assign(process.env, loadEnv(mode, '../..', 'CLOUDFLARE_'))
  return {
    plugins: [
      tailwindcss(),
      // A reference photo rides to the server inside a Server Action body, so the transport limit
      // has to clear `MAX_PHOTO_BYTES` with room for the rest of the form; otherwise the framework
      // rejects the upload before the action can answer with its own message.
      vinext({
        nextConfig: { experimental: { serverActions: { bodySizeLimit: '16mb' } } },
      }),
      // The App Router (RSC) environment runs inside workerd, so D1/R2 bindings behave like production.
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        // `pnpm dev:remote` points the dev server at the real `lookline` D1 and `lookline-media`
        // bucket instead of their local simulations: every read and write is production data and
        // production billing. Mutate the bindings in place — a returned object is merged with `defu`,
        // which concatenates arrays and would bind `DB` and `STORAGE` twice.
        //
        // `pnpm dev:images` (`LOOKLINE_REMOTE=r2`) takes only the bucket. The catalogue's 105k
        // photographs are far too large to hold locally, but a seeded local D1 has the people and
        // their Looks, which production does not — and keeping D1 local means a demo cannot write
        // to it by accident.
        config(config) {
          const remote = process.env.LOOKLINE_REMOTE
          if (!remote) return
          if (remote !== 'r2') for (const database of config.d1_databases) database.remote = true
          for (const bucket of config.r2_buckets) bucket.remote = true
        },
      }),
    ],
  }
})
