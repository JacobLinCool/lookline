/*
 * Engine lab: the team's and the judges' instrument, not a consumer page. Ontology rail, intent
 * compiler with relevance-gated probabilities, image studio. Sits in "The Rack" tokens (globals.css)
 * with Inter for every control and monospace only for ontology values and raw JSON.
 */
import type { Metadata } from 'next'
import { SEARCH_INTENT_ONTOLOGY, STYLE_PRESETS } from '@lookline/engine'
import { AdminPlayground } from '@/components/admin/playground'
import { getI18n } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.admin.title }
}

export default function AdminPage() {
  const ontology = {
    garmentTypes: [...SEARCH_INTENT_ONTOLOGY.garmentTypes],
    categorical: Object.fromEntries(
      Object.entries(SEARCH_INTENT_ONTOLOGY.categorical).map(([key, values]) => [key, [...values]]),
    ),
    ordinal: [...SEARCH_INTENT_ONTOLOGY.ordinal],
    predicateValues: Object.fromEntries(
      Object.entries(SEARCH_INTENT_ONTOLOGY.predicateValues).map(([key, values]) => [
        key,
        [...values],
      ]),
    ),
  }

  // Only the names cross to the browser; a preset's prompt is art direction the server owns.
  const presets = STYLE_PRESETS.map(({ slug, name, labelZh }) => ({ slug, name, labelZh }))

  return (
    <AdminPlayground
      ontology={ontology}
      presets={presets}
      intentConfigured={Boolean(process.env.TYPESAFE_API_KEY)}
      imageConfigured={Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)}
    />
  )
}
