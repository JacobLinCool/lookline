/**
 * The manufacturer-facing dashboard: momentum, propagation, the people whose Looks travel and the
 * 開款 / 備料 recommendations. Aesthetic, category, colour and silhouette names are not here —
 * `@/i18n/taxonomy` reads those from the catalog.
 */
export const trends = {
  title: 'Trends',
  forMakalot: 'For Makalot',
  exportCsv: 'Export CSV',

  window: {
    range: (from: string, to: string, updated: string) => `${from} – ${to} · updated ${updated}`,
    lastDays: (days: number) => `Last ${days} days`,
  },

  unavailable: {
    title: 'Trend data is unavailable right now.',
    body: 'Start the database and reload.',
  },

  headline: {
    looks: 'Looks created',
    remixes: 'Remixes',
    asks: 'Asks',
    togethers: 'Together editions',
    shares: 'Shares',
    purchasesFromLooks: 'Purchases from Looks',
    purchasesFromLooksHint: (purchases: string, share: string) =>
      `of ${purchases} purchases (${share})`,
    gmvFromLooks: 'GMV from Looks',
    gmvFromLooksHint: 'attributed to a Look',
    activePeople: 'Active people',
    crossClusterRemixes: 'Cross-cluster remixes',
    crossClusterRemixesHint: 'of remixes crossed a taste cluster',
    lineageDepth: 'Average lineage depth',
    lineageDepthHint: 'root to deepest Look',
  },

  sections: {
    momentum: 'Aesthetic momentum',
    emerging: 'Emerging now',
    byDimension: 'Momentum by dimension',
    categories: 'Categories',
    colours: 'Colours',
    silhouettes: 'Silhouettes',
    heat: 'Aesthetic × category',
    propagation: 'Propagation',
    propagationNote: 'The Looks that travelled furthest.',
    seeds: 'People whose Looks travel',
    clusters: 'Taste clusters',
    manufacturing: 'What to develop next · 開款 / 備料',
  },

  /** Figures measured the same way on every table. */
  metric: {
    momentum: 'Momentum',
    volume: 'Volume',
    velocity: 'Velocity',
    crossCluster: 'Cross-cluster',
    conversion: 'Conversion',
    gmv: 'GMV',
  },

  dimension: {
    aesthetic: 'Aesthetic',
    category: 'Category',
    color: 'Colour',
    silhouette: 'Silhouette',
    aesthetic_category: 'Aesthetic × category',
    detail: 'Detail',
  },

  status: {
    emerging: 'Emerging',
    rising: 'Rising',
    fading: 'Fading',
    stable: 'Stable',
  },

  table: {
    name: 'Name',
    aesthetic: 'Aesthetic',
    status: 'Status',
    empty: 'No signals in this window.',
  },

  chart: {
    emerging: 'emerging',
    weightedEvents: (events: number) => `${events} weighted events`,
  },

  emerging: {
    empty: 'No emerging trends in this period.',
  },

  heat: {
    aesthetic: 'Aesthetic',
    cell: (pair: string, momentum: number, volume: number, emerging: boolean) =>
      `${pair}: momentum ${momentum}, volume ${volume}${emerging ? ', emerging' : ''}`,
    noSignal: (pair: string) => `${pair}: no signal`,
    legend: 'Darker = stronger momentum · * emerging',
    empty: 'No aesthetic × category signals in this window.',
  },

  propagation: {
    rootOf: (looks: string) => `Root of ${looks}`,
    people: 'People',
    clusters: 'Clusters',
    purchases: 'Purchases',
    seeTree: 'See the tree',
    empty: 'No lineage has more than one Look yet.',
  },

  seeds: {
    person: 'Person',
    cluster: 'Cluster',
    remixesCaused: 'Remixes caused',
    downstreamPurchases: 'Downstream purchases',
    downstreamGmv: 'Downstream GMV',
    clustersReached: 'Clusters reached',
    empty: 'No Look has been remixed or bought from yet.',
  },

  clusters: {
    meta: (id: number, people: string, share: string | null) =>
      `Cluster ${id} · ${people}${share ? ` · ${share}` : ''}`,
    unlabelled: 'Unlabelled',
    empty: 'No taste groups to show yet.',
  },

  manufacturing: {
    rank: '#',
    group: 'Group',
    signal: 'Signal',
    confidence: 'Confidence',
    projectedDemand: 'Projected demand',
    demandUnit: 'sessions / 28 d',
    rationale: 'Rationale',
    evidence: 'Evidence',
    noEvidence: 'No evidence recorded.',
    empty: 'No development or stocking recommendations right now.',
    signals: {
      develop: 'Develop · 開款',
      stock: 'Stock · 備料',
      watch: 'Watch · 觀察',
    } as Record<string, string>,
    /** The fields behind one recommendation. */
    evidenceFields: {
      score: 'Score',
      demand14d: 'Demand 14d',
      demandIntents14d: 'Demand intents 14d',
      supply: 'Supply',
      lowStockShare: 'Low stock share',
      searchGap: 'Search gap',
      velocity: 'Velocity',
      conversion: 'Conversion',
      crossCluster: 'Cross cluster',
      clusters: 'Clusters',
      remixes14d: 'Remixes 14d',
      purchases14d: 'Purchases 14d',
      daysConsistent: 'Days consistent',
      dominantSilhouette: 'Dominant silhouette',
      topRootLooks: 'Top root looks',
      sampleIntents: 'Sample intents',
      topProducts: 'Top products',
      clusterLabels: 'Cluster labels',
    } as Record<string, string>,
  },

  lineage: {
    kind: {
      edition: 'Look',
      remix: 'Made it theirs',
      together: 'Together',
    },
    thisLook: 'This Look',
    velocityValue: (looksPerDay: string) => `${looksPerDay} Looks/day`,
    stats: {
      depth: 'Depth',
      nodes: 'Looks in tree',
      people: 'People touched',
      clusters: 'Taste clusters reached',
      shares: 'Shares',
      asks: 'Asks',
      remixes: 'Remixes',
      purchases: 'Purchases',
      gmv: 'Downstream GMV',
      velocity: 'Velocity',
      shareToRemix: 'Share → remix',
      remixToPurchase: 'Remix → purchase',
      firstLook: 'First Look',
      latestLook: 'Latest Look',
    },
  },
}

export type TrendsMessages = typeof trends
