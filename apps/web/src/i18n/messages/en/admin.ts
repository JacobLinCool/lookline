/**
 * Engine lab. Internal instrument, so model ids, contract versions, slot names, ontology values
 * and raw JSON stay untranslated on the page — only the labels around them live here.
 */
export const admin = {
  title: 'Engine lab',
  subtitle: 'Ontology, intent probabilities and image generation, live.',

  status: {
    intent: 'Intent',
    image: 'Image',
  },

  tabs: {
    label: 'Playground mode',
    intent: 'Intent compiler',
    image: 'Image studio',
    trends: 'Search trends',
  },

  ontology: {
    title: 'Ontology',
    summary: (dimensions: number, values: number) => `${dimensions} dimensions · ${values} values`,
    searchLabel: 'Search ontology',
    searchPlaceholder: 'Find an attribute',
    dimensionsLabel: 'Ontology dimensions',
    garmentTypes: 'Garment types',
    ordinalAxes: 'Ordinal axes',
    noMatch: (query: string) => `No ontology value matches “${query}”.`,
  },

  intent: {
    title: 'Compile a search phrase',
    description: 'One phrase becomes a complete, relevance-gated search space.',
    reset: 'Reset',
    notConfigured: 'Intent compiler is not configured',
    notConfiguredBody: 'Add a TypeSafe API key to run live probability probes.',
    failed: 'Compilation failed',
    error: 'Intent compilation failed.',
    queryLabel: 'Search phrase',
    compile: 'Compile',
    compiling: 'Compiling…',
    example: (index: number) => `Example ${index}`,
    runningLabel: 'Compiling intent',
    emptyTitle: 'Ready for a probability trace',
    emptyBody: 'Run an example to see which dimensions become constraints and which stay open.',
  },

  result: {
    compiledInput: 'Compiled input',
    latency: 'Latency',
    questions: 'Questions',
    candidates: 'Candidates',
    unresolved: 'Unresolved',
    typePrior: 'Garment type prior',
    explicitTypeSignal: 'Explicit type signal',
    purposePrior: 'Purpose-based prior',
    categorical: 'Categorical constraints',
    categoricalHint: 'Ordered by relevance to this query',
    explicit: 'Explicit',
    inferred: 'Inferred',
    combination: {
      unspecified: 'Unspecified',
      one_of: 'One Of',
      all_of: 'All Of',
      preferred_order: 'Preferred Order',
    },
    ordinalHint: 'Target position, operator and relevance',
    axis: 'Axis',
    target: 'Target',
    relation: 'Relation',
    relevance: 'Relevance',
    source: 'Source',
    sourceExplicit: 'explicit',
    sourceInferred: 'inferred',
    predicates: 'Sparse predicates',
    predicatesHint: 'Only explicit long-tail candidates survive',
    noPredicates: 'No long-tail predicate was activated.',
    rawJson: 'Raw SearchIntent JSON',
  },

  image: {
    title: 'Generate a fashion image',
    description: 'Test prompts against the configured image renderer.',
    notConfigured: 'Image generation is not configured',
    notConfiguredBody: 'Add an OpenAI or Gemini key to enable this playground.',
    failed: 'Generation failed',
    error: 'Image generation failed.',
    promptLabel: 'Prompt',
    /** With images attached the prompt is direction layered on the composite the engine builds. */
    directionLabel: 'Direction',
    promptHint: (characters: number) => `${characters}/2,000 characters`,
    garments: 'Garments',
    person: 'Person',
    addImages: 'Add images',
    removeImage: (name: string) => `Remove ${name}`,
    presetLabel: 'Style preset',
    references: 'References',
    composedPrompt: 'Composed prompt',
    renderedBy: (provider: string, model: string) => `${provider} · ${model}`,
    ratioLabel: 'Aspect ratio',
    ratios: {
      '3:4': '3:4 · Editorial portrait',
      '4:5': '4:5 · Campaign portrait',
      '1:1': '1:1 · Square',
      '9:16': '9:16 · Story',
    },
    generate: 'Generate image',
    compose: 'Compose the look',
    generating: 'Generating…',
    starters: 'Prompt starters',
    rendering: 'Rendering the prompt…',
    composing: 'Composing the look…',
    alt: 'Generated fashion experiment',
    generatedIn: (seconds: string) => `Generated in ${seconds}s`,
    download: 'Download',
    submittedPrompt: (ratio: string) => `${ratio} submitted prompt`,
    emptyTitle: 'The generated frame appears here',
    emptyBody:
      'Choose a prompt and ratio, then generate a real image without saving it to the catalog.',
    compositeEmptyBody:
      'Attach the garments and the person, then compose the Look without saving it to the catalog.',
  },

  trends: {
    title: 'What the public is searching',
    description:
      "Google's daily list for Taiwan, read as one mood and published to the home page. No term is chosen by hand.",
    refresh: 'Read today',
    refreshing: 'Reading…',
    onHome: 'On the home page',
    nothingOnHome:
      'Nothing published. Today’s list had no mood to dress, or no reading of it found pieces in the catalogue.',
    noReading:
      'The list was fetched, but nothing could be published from it. That is the filter working — try again later.',
    readFrom: 'Read from',
    empty: 'No batch yet. Read today’s list to begin.',
    failed: 'The trend source did not answer. Try again.',
    source: 'Source',
    matches: (n: number) => (n === 1 ? '1 piece' : `${n.toLocaleString('en')} pieces`),
    tokenLabel: 'Lab token',
    tokenHint: 'This deployment requires a token for actions that change the home page.',
  },
}

export type AdminMessages = typeof admin
