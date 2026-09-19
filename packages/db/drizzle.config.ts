import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.LOOKLINE_SQLITE
      ? `file:${process.env.LOOKLINE_SQLITE}`
      : 'file:../../data/lookline.sqlite',
  },
  strict: true,
  verbose: true,
})
