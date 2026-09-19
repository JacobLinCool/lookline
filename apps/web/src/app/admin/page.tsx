/*
 * Engine lab: the team's and the judges' instrument, not a consumer page. Ontology rail, intent
 * compiler with relevance-gated probabilities, image studio. Sits in "The Rack" tokens (globals.css)
 * with Inter for every control and monospace only for ontology values and raw JSON.
 */
import type { Metadata } from 'next'
import { SEARCH_INTENT_ONTOLOGY } from '@lookline/engine'
import { AdminPlayground } from '@/components/admin/playground'

export const metadata: Metadata = { title: 'Engine lab' }

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

  return (
    <AdminPlayground
      ontology={ontology}
      intentConfigured={Boolean(process.env.TYPESAFE_API_KEY)}
      imageConfigured={Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)}
    />
  )
}
