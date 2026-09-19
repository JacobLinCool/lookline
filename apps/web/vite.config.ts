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
    }),
  ],
})
