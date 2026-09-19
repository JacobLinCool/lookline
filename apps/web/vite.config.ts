import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import vinext from 'vinext'
import { defineConfig } from 'vite'

export default defineConfig({
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
      config(config) {
        if (!process.env.LOOKLINE_REMOTE) return
        for (const database of config.d1_databases) database.remote = true
        for (const bucket of config.r2_buckets) bucket.remote = true
      },
    }),
  ],
})
