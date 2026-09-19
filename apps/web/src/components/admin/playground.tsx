'use client'

import {
  Atom,
  Braces,
  Database,
  Download,
  ImageIcon,
  Play,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type { SearchIntent } from '@lookline/engine'
import { Button, Field, Input, Notice, Select, Textarea } from '@/components/ui'
import { cn } from '@/lib/cn'
import styles from './playground.module.css'

interface Ontology {
  garmentTypes: string[]
  categorical: Record<string, string[]>
  ordinal: string[]
  predicateValues: Record<string, string[]>
}

interface OntologyGroup {
  id: string
  label: string
  kind: 'types' | 'categorical' | 'ordinal' | 'predicate'
  values: string[]
}

interface ImageResult {
  image: string
  mimeType: string
  latencyMs: number
}

const INTENT_EXAMPLES = [
  '我想找冬天通勤穿的，紅色或藍色，不要太厚，看起來俐落一點。',
  '紅色或藍色都可以，但不要黑色。',
  '夏天去海邊穿。',
  '想要高腰寬褲，不要打褶，預算三千以內。',
]

const IMAGE_EXAMPLES = [
  'Editorial fashion photograph of a sharp winter commute look in navy and burgundy, lightweight layered tailoring, clean Taipei streets after rain, natural overcast light, full-body composition.',
  'Studio catalog portrait of a high-waisted wide-leg trouser look, ivory background, precise fabric drape, subtle movement, premium contemporary fashion campaign.',
  'Playful summer beach editorial with breathable linen layers in cobalt and white, late afternoon sun, candid movement, cinematic fashion photography.',
]

const titleCase = (value: string): string =>
  value
    .replace(/^attributes\./, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())

const percent = (value: number): string => `${Math.round(value * 100)}%`
const barStyle = (value: number): CSSProperties => ({ width: `${Math.max(0, value) * 100}%` })

function sortedProbabilities(probabilities: Record<string, number>, limit = 5) {
  return Object.entries(probabilities)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function ProbabilityRows({
  probabilities,
  limit = 5,
}: {
  probabilities: Record<string, number>
  limit?: number
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {sortedProbabilities(probabilities, limit).map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1"
        >
          <span className="truncate text-[12px] text-ink" title={label}>
            {titleCase(label)}
          </span>
          <span className="tabular text-right text-[11px] text-muted">{percent(value)}</span>
          <div className={cn(styles.probabilityTrack, 'col-span-2')} aria-hidden="true">
            <div className={styles.probabilityFill} style={barStyle(value)} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Relevance({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(styles.relevanceTrack, 'w-16')} aria-hidden="true">
        <div className={styles.relevanceFill} style={barStyle(value)} />
      </div>
      <span className="tabular text-[11px] text-muted">{percent(value)}</span>
    </div>
  )
}

function OntologyRail({ ontology }: { ontology: Ontology }) {
  const groups = useMemo<OntologyGroup[]>(() => {
    const predicateGroups = Object.entries(ontology.predicateValues)
      .filter(([key]) => key.startsWith('attributes.'))
      .map(([id, values]) => ({ id, label: titleCase(id), kind: 'predicate' as const, values }))
    return [
      { id: 'garmentTypes', label: 'Garment types', kind: 'types', values: ontology.garmentTypes },
      ...Object.entries(ontology.categorical).map(([id, values]) => ({
        id,
        label: titleCase(id),
        kind: 'categorical' as const,
        values,
      })),
      { id: 'ordinal', label: 'Ordinal axes', kind: 'ordinal', values: ontology.ordinal },
      ...predicateGroups,
    ]
  }, [ontology])
  const [active, setActive] = useState('garmentTypes')
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const filtered = search
    ? groups
        .map((group) => ({
          ...group,
          values: group.values.filter(
            (value) =>
              value.toLowerCase().includes(search) || group.label.toLowerCase().includes(search),
          ),
        }))
        .filter((group) => group.values.length > 0)
    : groups.filter((group) => group.id === active)
  const totalValues = groups.reduce((sum, group) => sum + group.values.length, 0)

  return (
    <aside className={cn(styles.rail, 'flex flex-col border-r border-line bg-mist/45')}>
      <div className="border-b border-line p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px]">Ontology</h2>
            <p className="tabular mt-0.5 text-[11px] text-muted">
              {groups.length} dimensions · {totalValues} values
            </p>
          </div>
          <Database className="mt-0.5 size-4 text-muted" aria-hidden="true" />
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an attribute"
            aria-label="Search ontology"
            className="h-9 pl-9 text-[12px]"
          />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
        {!search ? (
          <nav
            className="max-h-48 overflow-y-auto border-b border-line py-2"
            aria-label="Ontology dimensions"
          >
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setActive(group.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-5 py-1.5 text-left text-[12px] transition-colors',
                  active === group.id
                    ? 'bg-card font-medium text-ink'
                    : 'text-muted hover:bg-card/70',
                )}
              >
                <span className="truncate">{group.label}</span>
                <span className="tabular text-[11px]">{group.values.length}</span>
              </button>
            ))}
          </nav>
        ) : null}

        <div className={cn(styles.railValues, 'p-5')}>
          {filtered.length > 0 ? (
            <div className="flex flex-col gap-6">
              {filtered.map((group) => (
                <section key={group.id}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-[12px] font-medium text-ink">{group.label}</h3>
                    <span className="tabular text-[11px] text-muted">{group.values.length}</span>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {group.values.map((value) => (
                      <li
                        key={value}
                        className="rounded-xs border border-line bg-card px-2 py-1 font-mono text-[11px] text-ink"
                      >
                        {value}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted">No ontology value matches “{query}”.</p>
          )}
        </div>
      </div>
    </aside>
  )
}

function IntentResults({ result, query }: { result: SearchIntent; query: string }) {
  const categoricals = Object.entries(result.categorical).toSorted(
    (a, b) => b[1].relevance - a[1].relevance,
  )

  return (
    <div className="border-t border-line">
      <div className="border-b border-line bg-card px-4 py-3">
        <p className="text-[12px] font-medium text-muted">Compiled input</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink">“{query}”</p>
      </div>
      <div className="grid grid-cols-2 border-b border-line bg-mist/40 sm:grid-cols-4">
        {[
          ['Latency', `${Math.round(result.latencyMs)} ms`],
          ['Questions', String(result.questionCount)],
          ['Candidates', String(result.candidateCount)],
          ['Unresolved', String(result.unresolved.length)],
        ].map(([label, value], index) => (
          <div key={label} className={cn('px-4 py-3', index > 0 && 'border-l border-line')}>
            <p className="text-[12px] font-medium text-muted">{label}</p>
            <p className="tabular mt-0.5 text-[16px] font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className={styles.resultGrid}>
        <section className="border-b border-line p-5 lg:border-r lg:border-b-0">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px]">Garment type prior</h3>
              <p className="mt-0.5 text-[11px] text-muted">
                {result.typeExplicitness ? 'Explicit type signal' : 'Purpose-based prior'}
              </p>
            </div>
            <Relevance value={result.typeRelevance} />
          </div>
          <ProbabilityRows probabilities={result.typePrior} limit={10} />
        </section>

        <section className="min-w-0 p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px]">Categorical constraints</h3>
              <p className="mt-0.5 text-[11px] text-muted">Ordered by relevance to this query</p>
            </div>
            <SlidersHorizontal className="size-4 text-muted" aria-hidden="true" />
          </div>
          <div className={styles.dimensionGrid}>
            {categoricals.map(([name, constraint], index) => (
              <article
                key={name}
                className={cn(
                  'border-t border-line py-4',
                  index % 2 === 0 ? 'md:pr-5' : 'md:border-l md:pl-5',
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-sans text-[12px] font-semibold">{titleCase(name)}</h4>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {constraint.combination !== 'unspecified'
                        ? titleCase(constraint.combination)
                        : constraint.explicitness
                          ? 'Explicit'
                          : 'Inferred'}
                    </p>
                  </div>
                  <Relevance value={constraint.relevance} />
                </div>
                <ProbabilityRows probabilities={constraint.probabilities} limit={3} />
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="border-t border-line p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[14px]">Ordinal axes</h3>
            <p className="mt-0.5 text-[11px] text-muted">Target position, operator and relevance</p>
          </div>
          <Atom className="size-4 text-muted" aria-hidden="true" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[12px] text-muted">
                <th className="pb-2 font-medium">Axis</th>
                <th className="pb-2 font-medium">Target</th>
                <th className="pb-2 font-medium">Relation</th>
                <th className="pb-2 font-medium">Relevance</th>
                <th className="pb-2 text-right font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.ordinal).map(([name, constraint]) => (
                <tr key={name} className="border-b border-line/70 text-[12px] last:border-0">
                  <th className="py-3 pr-5 font-medium">{titleCase(name)}</th>
                  <td className="w-[32%] py-3 pr-6">
                    <div className="flex items-center gap-3">
                      <div className={cn(styles.targetTrack, 'min-w-32 flex-1')} aria-hidden="true">
                        <span
                          className={styles.targetMarker}
                          style={{ left: `${constraint.target * 100}%` }}
                        />
                      </div>
                      <span className="tabular w-9 text-right text-[11px] text-muted">
                        {constraint.target.toFixed(2)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-5 font-mono text-[10px]">{constraint.relation}</td>
                  <td className="py-3 pr-5">
                    <Relevance value={constraint.relevance} />
                  </td>
                  <td className="py-3 text-right text-[11px] text-muted">
                    {constraint.explicitness ? 'explicit' : 'inferred'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t border-line p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[14px]">Sparse predicates</h3>
            <p className="mt-0.5 text-[11px] text-muted">
              Only explicit long-tail candidates survive
            </p>
          </div>
          <span className="tabular text-[11px] text-muted">{result.predicates.length}</span>
        </div>
        {result.predicates.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {result.predicates.map((predicate) => (
              <div
                key={`${predicate.attribute}:${predicate.value}:${predicate.polarity}`}
                className={cn(
                  'flex items-center gap-2 rounded-xs border px-2.5 py-1.5 font-mono text-[11px]',
                  predicate.polarity === 'negative'
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : 'border-line bg-card text-ink',
                )}
              >
                <span>{predicate.polarity === 'negative' ? '−' : '+'}</span>
                <span>{predicate.attribute}</span>
                <span className="text-muted">=</span>
                <span>{predicate.value}</span>
                <span className="tabular text-muted">{percent(predicate.probability)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted">No long-tail predicate was activated.</p>
        )}
      </section>

      <details className="border-t border-line p-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-medium">
          <Braces className="size-4" aria-hidden="true" />
          Raw SearchIntent JSON
        </summary>
        <pre className="mt-4 max-h-[34rem] overflow-auto rounded-md bg-ink p-4 font-mono text-[11px] leading-relaxed text-paper">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function IntentCompiler({
  configured,
  activePanel,
}: {
  configured: boolean
  activePanel: boolean
}) {
  const [query, setQuery] = useState(INTENT_EXAMPLES[0]!)
  const [result, setResult] = useState<SearchIntent | null>(null)
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      active.current?.abort()
      active.current = null
    },
    [],
  )

  function cancelRun() {
    active.current?.abort()
    active.current = null
    setBusy(false)
    setResult(null)
    setSubmittedQuery(null)
    setError(null)
  }

  function updateQuery(nextQuery: string) {
    cancelRun()
    setQuery(nextQuery.slice(0, 500))
  }

  async function run(event?: FormEvent) {
    event?.preventDefault()
    if (!query.trim() || busy) return
    active.current?.abort()
    const controller = new AbortController()
    const submitted = query.trim()
    active.current = controller
    setBusy(true)
    setResult(null)
    setSubmittedQuery(submitted)
    setError(null)
    try {
      const response = await fetch('/api/admin/search-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: submitted }),
        signal: controller.signal,
      })
      const body = (await response.json()) as SearchIntent | { error: string }
      if (!response.ok) throw new Error('error' in body ? body.error : 'Intent compilation failed.')
      if ('error' in body) throw new Error(body.error)
      if (active.current === controller) setResult(body)
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(caught instanceof Error ? caught.message : 'Intent compilation failed.')
    } finally {
      if (active.current === controller) {
        active.current = null
        setBusy(false)
      }
    }
  }

  return (
    <div role="tabpanel" id="intent-panel" aria-labelledby="intent-tab" hidden={!activePanel}>
      <form onSubmit={run} className="border-b border-line p-5 md:p-7">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[18px]">Compile a search phrase</h2>
            <p className="mt-1 text-[13px] text-muted">
              One phrase becomes a complete, relevance-gated search space.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={<RotateCcw />}
            onClick={() => {
              cancelRun()
              setQuery(INTENT_EXAMPLES[0]!)
            }}
          >
            Reset
          </Button>
        </div>

        {!configured ? (
          <Notice tone="warning" title="Intent compiler is not configured" className="mb-4">
            Add a TypeSafe API key to run live probability probes.
          </Notice>
        ) : null}
        {error ? (
          <Notice tone="error" title="Compilation failed" className="mb-4">
            {error}
          </Notice>
        ) : null}

        <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
          <Textarea
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            rows={3}
            maxLength={500}
            aria-label="Search phrase"
            className="min-h-24 flex-1 resize-none text-[16px] leading-relaxed"
          />
          <Button
            type="submit"
            size="lg"
            icon={<Play />}
            disabled={!configured || busy || !query.trim()}
            className="md:w-36"
          >
            {busy ? 'Compiling…' : 'Compile'}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {INTENT_EXAMPLES.map((example, index) => (
            <button
              key={example}
              type="button"
              onClick={() => updateQuery(example)}
              className="rounded-sm border border-line bg-card px-2.5 py-1.5 text-left text-[12px] text-muted transition-colors hover:border-ink hover:text-ink"
            >
              Example {index + 1}
            </button>
          ))}
          <span className="tabular ml-auto self-center text-[11px] text-muted">
            {query.length}/500
          </span>
        </div>
      </form>

      {busy && !result ? (
        <div
          className="grid gap-px bg-line md:grid-cols-2"
          aria-live="polite"
          aria-label="Compiling intent"
        >
          <div className="h-72 animate-pulse bg-mist/60" />
          <div className="h-72 animate-pulse bg-mist/40" />
        </div>
      ) : result && submittedQuery ? (
        <IntentResults result={result} query={submittedQuery} />
      ) : (
        <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
          <Atom className="mb-4 size-7 text-muted" aria-hidden="true" />
          <h3 className="text-[15px]">Ready for a probability trace</h3>
          <p className="mt-1 max-w-md text-[12px] text-muted">
            Run an example to see which dimensions become constraints and which stay open.
          </p>
        </div>
      )}
    </div>
  )
}

function ImageStudio({ configured, activePanel }: { configured: boolean; activePanel: boolean }) {
  const [prompt, setPrompt] = useState(IMAGE_EXAMPLES[0]!)
  const [aspectRatio, setAspectRatio] = useState<'3:4' | '1:1' | '4:5' | '9:16'>('3:4')
  const [result, setResult] = useState<ImageResult | null>(null)
  const [submittedInput, setSubmittedInput] = useState<{
    prompt: string
    aspectRatio: '3:4' | '1:1' | '4:5' | '9:16'
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      active.current?.abort()
      active.current = null
    },
    [],
  )

  function cancelGeneration() {
    active.current?.abort()
    active.current = null
    setBusy(false)
    setResult(null)
    setSubmittedInput(null)
    setError(null)
  }

  function updatePrompt(nextPrompt: string) {
    cancelGeneration()
    setPrompt(nextPrompt.slice(0, 2_000))
  }

  function updateAspectRatio(nextRatio: '3:4' | '1:1' | '4:5' | '9:16') {
    cancelGeneration()
    setAspectRatio(nextRatio)
  }

  async function generate(event: FormEvent) {
    event.preventDefault()
    if (!prompt.trim() || busy) return
    const controller = new AbortController()
    const submitted = { prompt: prompt.trim(), aspectRatio }
    active.current?.abort()
    active.current = controller
    setBusy(true)
    setResult(null)
    setSubmittedInput(submitted)
    setError(null)
    try {
      const response = await fetch('/api/admin/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitted),
        signal: controller.signal,
      })
      const body = (await response.json()) as ImageResult | { error: string }
      if (!response.ok) throw new Error('error' in body ? body.error : 'Image generation failed.')
      if ('error' in body) throw new Error(body.error)
      if (active.current === controller) setResult(body)
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(caught instanceof Error ? caught.message : 'Image generation failed.')
    } finally {
      if (active.current === controller) {
        active.current = null
        setBusy(false)
      }
    }
  }

  return (
    <div role="tabpanel" id="image-panel" aria-labelledby="image-tab" hidden={!activePanel}>
      <div className="grid min-h-[calc(100dvh-12rem)] xl:grid-cols-[25rem_minmax(0,1fr)]">
        <form
          onSubmit={generate}
          className="border-b border-line p-5 md:p-7 xl:border-r xl:border-b-0"
        >
          <div className="mb-6">
            <h2 className="text-[18px]">Generate a fashion image</h2>
            <p className="mt-1 text-[13px] text-muted">
              Test prompts against the configured image renderer.
            </p>
          </div>
          {!configured ? (
            <Notice tone="warning" title="Image generation is not configured" className="mb-5">
              Add an OpenAI or Gemini key to enable this playground.
            </Notice>
          ) : null}
          {error ? (
            <Notice tone="error" title="Generation failed" className="mb-5">
              {error}
            </Notice>
          ) : null}
          <div className="flex flex-col gap-5">
            <Field label="Prompt" htmlFor="image-prompt" hint={`${prompt.length}/2,000 characters`}>
              <Textarea
                id="image-prompt"
                value={prompt}
                onChange={(event) => updatePrompt(event.target.value)}
                rows={11}
                maxLength={2_000}
                className="resize-none"
              />
            </Field>
            <Field label="Aspect ratio" htmlFor="image-ratio">
              <Select
                id="image-ratio"
                value={aspectRatio}
                onChange={(event) =>
                  updateAspectRatio(event.target.value as '3:4' | '1:1' | '4:5' | '9:16')
                }
                options={[
                  { value: '3:4', label: '3:4 · Editorial portrait' },
                  { value: '4:5', label: '4:5 · Campaign portrait' },
                  { value: '1:1', label: '1:1 · Square' },
                  { value: '9:16', label: '9:16 · Story' },
                ]}
              />
            </Field>
            <Button
              type="submit"
              size="lg"
              icon={<ImageIcon />}
              disabled={!configured || busy || !prompt.trim()}
              full
            >
              {busy ? 'Generating…' : 'Generate image'}
            </Button>
          </div>
          <div className="mt-7 border-t border-line pt-5">
            <p className="mb-3 text-[12px] font-medium text-muted">Prompt starters</p>
            <div className="flex flex-col gap-2">
              {IMAGE_EXAMPLES.map((example, index) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => updatePrompt(example)}
                  className="border-t border-line py-2 text-left text-[11px] text-muted transition-colors first:border-0 hover:text-ink"
                >
                  {index + 1}. {example.slice(0, 74)}…
                </button>
              ))}
            </div>
          </div>
        </form>

        <div
          className={cn(styles.imageStage, 'relative flex items-center justify-center p-6 md:p-10')}
        >
          {busy ? (
            <div className="flex flex-col items-center gap-4 text-center" aria-live="polite">
              <div className="h-72 w-56 animate-pulse rounded-md bg-card shadow-lift" />
              <p className="text-[12px] text-muted">Rendering the prompt…</p>
            </div>
          ) : result && submittedInput ? (
            <div className="flex w-full flex-col items-center gap-5">
              {/* A data URL is intentionally rendered directly; generated playground images are not persisted. */}
              <img
                src={result.image}
                alt="Generated fashion experiment"
                className={styles.generatedImage}
              />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="tabular text-[11px] text-muted">
                  Generated in {(result.latencyMs / 1_000).toFixed(1)}s
                </span>
                <a
                  href={result.image}
                  download={`lookline-playground.${result.mimeType === 'image/jpeg' ? 'jpg' : result.mimeType.split('/')[1] || 'png'}`}
                  className="inline-flex h-9 items-center gap-2 rounded-sm border border-line bg-card px-3 text-[13px] font-medium transition-colors hover:border-ink"
                >
                  <Download className="size-4" aria-hidden="true" />
                  Download
                </a>
              </div>
              <div className="max-w-xl rounded-sm bg-card px-4 py-3 text-center">
                <p className="text-[12px] font-medium text-muted">
                  {submittedInput.aspectRatio} submitted prompt
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink">
                  “{submittedInput.prompt}”
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-sm rounded-md bg-card p-7 text-center shadow-lift">
              <ImageIcon className="mx-auto mb-4 size-7 text-muted" aria-hidden="true" />
              <h3 className="text-[15px]">The generated frame appears here</h3>
              <p className="mt-1 text-[12px] text-muted">
                Choose a prompt and ratio, then generate a real image without saving it to the
                catalog.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AdminPlayground({
  ontology,
  intentConfigured,
  imageConfigured,
}: {
  ontology: Ontology
  intentConfigured: boolean
  imageConfigured: boolean
}) {
  const [tab, setTab] = useState<'intent' | 'image'>('intent')
  return (
    <div className={styles.layout}>
      <OntologyRail ontology={ontology} />
      <section className={cn(styles.workbench, 'bg-paper')}>
        <header className="border-b border-line px-5 pt-7 md:px-7 md:pt-9">
          <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="display text-[28px] md:text-[34px]">Engine lab</h1>
              <p className="mt-1.5 text-[13px] text-muted">
                Ontology, intent probabilities and image generation, live.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <span
                className={cn('size-1.5 rounded-full', intentConfigured ? 'bg-ink' : 'bg-line')}
              />
              Intent
              <span
                className={cn('ml-2 size-1.5 rounded-full', imageConfigured ? 'bg-ink' : 'bg-line')}
              />
              Image
            </div>
          </div>
          <div className="flex gap-6" role="tablist" aria-label="Playground mode">
            <button
              id="intent-tab"
              type="button"
              role="tab"
              aria-selected={tab === 'intent'}
              aria-controls="intent-panel"
              onClick={() => setTab('intent')}
              className={cn(
                'flex items-center gap-2 border-b-2 py-3 text-[13px] font-medium transition-colors',
                tab === 'intent'
                  ? 'border-ink text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              <Atom className="size-4" aria-hidden="true" />
              Intent compiler
            </button>
            <button
              id="image-tab"
              type="button"
              role="tab"
              aria-selected={tab === 'image'}
              aria-controls="image-panel"
              onClick={() => setTab('image')}
              className={cn(
                'flex items-center gap-2 border-b-2 py-3 text-[13px] font-medium transition-colors',
                tab === 'image'
                  ? 'border-ink text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              <ImageIcon className="size-4" aria-hidden="true" />
              Image studio
            </button>
          </div>
        </header>
        <IntentCompiler configured={intentConfigured} activePanel={tab === 'intent'} />
        <ImageStudio configured={imageConfigured} activePanel={tab === 'image'} />
      </section>
    </div>
  )
}
