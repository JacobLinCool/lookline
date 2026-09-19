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
      // The App Router (RSC) environment runs inside workerd, so D1/R2 bindings behave like
      // production. With `remoteBindings`, the bindings marked `"remote": true` in wrangler.jsonc
      // are the real D1 database and R2 bucket rather than Miniflare's empty local ones — the
      // catalogue is 105k H&M articles and 2 GB of photographs, which no local seed reproduces.
      // Writes from `pnpm dev` land in the real database. Set CLOUDFLARE_REMOTE=0 to stay local.
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        remoteBindings: process.env.CLOUDFLARE_REMOTE !== '0',
      }),
    ],
  }
})
