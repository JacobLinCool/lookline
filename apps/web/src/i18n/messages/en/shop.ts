import { formatNumber } from '@/server/format'

/**
 * The shop: the sentence field and its voice controls, the filter rail, the results grid, and one
 * product's page. Catalog nouns (departments, categories, colours, aesthetics, materials) are not
 * here — `@/i18n/taxonomy` reads those from the catalog. The hint chips keep their own phrases in
 * `@/components/shop/hints`, because those follow the language of the sentence, not the interface.
 */
export const shop = {
  title: 'Shop',
  loadError: 'Pieces could not be loaded.',
  /** A plain list of catalog nouns: colours in the rail, occasions on a product. */
  list: (items: readonly string[]) => items.join(', '),

  /** The sentence field above the grid, its voice controls and the question row under it. */
  sentence: {
    label: 'Filter by sentence',
    field: 'Describe what you are looking for',
    placeholder: 'A black or navy coat, under NT$3,000, nothing red…',
    unavailable: 'Filtering by sentence is unavailable right now',
    signIn: 'Sign in to filter by sentence',
    listening: 'Listening',
    connecting: 'Connecting…',
    finishing: 'Finishing…',
    reading: 'Reading…',
    speak: 'Speak',
    stop: 'Stop',
    languages: 'Voice languages',
    languagesOf: (languages: string) => `Voice languages: ${languages}`,
    nextQuestion: 'Next question',
    tooLong: 'That sentence is too long. Keep the preview or start a shorter one.',
    refreshFailed: 'Pieces could not refresh. Your previous results are still here.',
    refreshFailedShort: 'Pieces could not refresh.',
    resolveFailed: 'Filtering by sentence is unavailable.',
    unverified: 'The filter response could not be verified.',
    /** The attribute results are up; the caption search for the named motif is still running. */
    searchingCaptions: 'Looking through the photographs…',
  },

  results: {
    previous: 'Previous results',
    unavailable: 'Pieces unavailable',
    withPreview: (count: string) => `${count} · preview`,
    emptyTitle: 'No pieces match.',
    emptyDescription: 'Try another colour, a wider category or a higher price.',
  },

  filters: {
    label: 'Filters',
    active: 'Active filters',
    department: 'Department',
    category: 'Category',
    colour: 'Colour',
    style: 'Style',
    price: 'Price',
    /** Rail headings for the construction facets, keyed by `SEARCH_FACETS` id. */
    facet: {
      categoryGroup: 'Category',
      colorFamily: 'Colour',
      aesthetic: 'Style',
      material: 'Material',
      pattern: 'Pattern',
      printSubject: 'Print',
      silhouette: 'Silhouette',
      fit: 'Fit',
      length: 'Length',
      neckline: 'Neckline',
      sleeve: 'Sleeve',
      closure: 'Closure',
      detail: 'Details',
    },
    details: 'Details',
    any: 'Any',
    anyColour: 'Any colour',
    moreStyles: (n: number) => `${n} more styles`,
    moreValues: (n: number) => `${n} more`,
    none: 'None in these results',
    not: (label: string) => `Not ${label}`,
    brand: (id: number) => `Brand #${id}`,
    priceFrom: (amount: string) => `${amount} and up`,
    priceUnder: (amount: string) => `Under ${amount}`,
    withCount: (label: string, n: number) =>
      `${label} · ${formatNumber(n)} ${n === 1 ? 'piece' : 'pieces'}`,
    sort: 'Sort',
    sortField: 'Sort products',
    pricePresets: {
      under1000: 'Under NT$1,000',
      band1to3: 'NT$1,000 – 3,000',
      band3to8: 'NT$3,000 – 8,000',
      from8000: 'NT$8,000 and up',
    },
  },

  /** Keys are the `sort` values in the URL. */
  sort: {
    relevance: 'Relevance',
    popular: 'Most popular',
    trending: 'Trending in the network',
    new: 'Newest',
    price_asc: 'Price, low to high',
    price_desc: 'Price, high to low',
  },

  pagination: {
    label: 'Pagination',
    pageOf: (page: number, pages: number) => `Page ${formatNumber(page)} of ${formatNumber(pages)}`,
    previous: 'Previous page',
    next: 'Next page',
  },

  product: {
    notFound: 'Product not found',
    fallbackTitle: 'Product',
    breadcrumb: 'Breadcrumb',
    added: 'Added to your bag',
    addedCount: (n: number) => `${formatNumber(n)} pieces added to your bag`,
    openBag: 'Open bag',
    lowStock: 'Low stock',
    secondColour: 'Second colour',
    rating: (rating: string, reviews: number) =>
      `${rating} / 5 · ${formatNumber(reviews)} ${reviews === 1 ? 'review' : 'reviews'}`,
    details: 'Details',
    size: 'Size',
    oneSize: 'One size',
    quantity: 'Qty',
    soldOut: 'Sold out',
    addToBag: 'Add to bag',
  },

  /** Row names in the product's detail table; the values come from the catalog. */
  attributes: {
    material: 'Material',
    fit: 'Fit',
    silhouette: 'Silhouette',
    length: 'Length',
    neckline: 'Neckline',
    sleeve: 'Sleeve',
    closure: 'Closure',
    pattern: 'Pattern',
    printSubject: 'Print',
    details: 'Details',
    occasions: 'Occasions',
    seasons: 'Seasons',
  },

  look: {
    title: 'Wear it with',
    unavailable: 'Outfit suggestions are unavailable right now.',
    none: 'No outfit found for this piece yet.',
    alone: 'On its own',
    withPieces: (pieces: readonly string[]) => {
      const words = pieces.map((piece) => piece.toLowerCase())
      const last = words.at(-1) ?? ''
      const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${last}` : last
      return `With ${list}`
    },
    thisPiece: 'This piece',
    total: (amount: string) => `Total ${amount}`,
    addAll: (n: number) => `Add all ${n} to bag`,
    added: 'Outfit added to your bag',
    score: 'Outfit',
  },

  /** Outfit slot roles from the engine. */
  outfitRoles: {
    outer: 'Outer',
    tailoring: 'Tailoring',
    top: 'Top',
    dress: 'Dress',
    bottom: 'Bottom',
    shoes: 'Shoes',
    bag: 'Bag',
    accessory: 'Accessory',
    jewelry: 'Jewelry',
    activewear: 'Activewear',
    swimwear: 'Swimwear',
  },

  similar: 'Similar',

  /** How this piece sits with what the shopper usually chooses. */
  fit: {
    signIn: 'Sign in to see your fit',
    empty: 'Save a few pieces to see your fit.',
    score: 'Fit',
    close: 'Close to your taste',
    partly: 'Partly your taste',
    different: 'A change from what you usually pick',
    colourIsYours: (colour: string) => `${colour} is one of your colours`,
    evidence: {
      close: 'Close to the pieces you usually choose',
      partly: 'Shares some of your usual style preferences',
      different: 'Different from the pieces you usually choose',
      shares: (styles: string) => `shares ${styles} with your top aesthetics`,
      sharesNothing: 'no overlap with your top aesthetics yet',
      colourOutside: 'colour outside your usual palette',
      trend: (score: string) => `network trend score ${score} from Looks and remixes`,
      noTrend: 'no trend momentum recorded for this piece yet',
      join: (clauses: readonly string[]) => clauses.join('; '),
    },
  },

  /** What the sentence field says when speech capture cannot continue. */
  voice: {
    connectTimeout: 'Voice took too long to connect. Please try again.',
    connectionFailed: 'Voice connection failed. Your saved filters are still available.',
    disconnected: 'Voice disconnected. You can reconnect or keep typing.',
    processingFailed: 'Microphone processing failed. Please reconnect.',
    audioFailed: 'Audio could not be sent. Please reconnect.',
    permission: 'Allow microphone access to use voice filters.',
    connectFailed: 'Voice could not connect. Please try again or keep typing.',
    finishFailed: 'Could not finish transcription. Unconfirmed speech was not applied.',
    unfinalized: 'The last words were not finalized. Review the preview before applying.',
  },

  /** One question per open hint; the chip phrases live in `@/components/shop/hints`. */
  hints: {
    recipient: {
      question: 'Who is it for?',
      choices: {
        myself: 'Myself',
        partner: 'My partner',
        mum: 'My mum',
        dad: 'My dad',
        kid: 'A kid',
      },
    },
    occasion: {
      question: 'What is the occasion?',
      choices: {
        work: 'Work',
        wedding: 'Wedding',
        date: 'Date night',
        weekend: 'Weekend',
        travel: 'Travel',
      },
    },
    formality: {
      question: 'How dressed-up?',
      choices: {
        casual: 'Casual',
        smartCasual: 'Smart casual',
        business: 'Business',
        formal: 'Formal',
      },
    },
    'wedding-role': {
      question: 'Your role at the wedding?',
      choices: {
        guest: 'Guest',
        bridesmaid: 'Bridesmaid',
        groomsman: 'Groomsman',
        family: 'Family',
      },
    },
    'office-type': {
      question: 'What kind of office?',
      choices: {
        corporate: 'Corporate',
        creative: 'Creative',
        client: 'Client-facing',
        hybrid: 'Hybrid',
      },
    },
    'trip-type': {
      question: 'Where to?',
      choices: {
        city: 'City break',
        beach: 'Beach',
        mountains: 'Mountains',
        cold: 'Somewhere cold',
        flight: 'Long flight',
      },
    },
    activity: {
      question: 'Which activity?',
      choices: {
        gym: 'Gym',
        running: 'Running',
        yoga: 'Yoga',
        hiking: 'Hiking',
        swimming: 'Swimming',
      },
    },
    category: {
      question: 'What kind of piece?',
      choices: {
        outerwear: 'Outerwear',
        tops: 'Tops',
        dresses: 'Dresses',
        bottoms: 'Bottoms',
        shoes: 'Shoes',
        bags: 'Bags',
      },
    },
    budget: {
      question: 'Budget?',
      choices: {
        under1000: 'Under NT$1,000',
        under3000: 'Under NT$3,000',
        under8000: 'Under NT$8,000',
        noLimit: 'No limit',
      },
    },
    colour: {
      question: 'Any colour in mind?',
      choices: {
        black: 'Black',
        white: 'White',
        navy: 'Navy',
        beige: 'Beige',
        red: 'Red',
        green: 'Green',
      },
    },
    warmth: {
      question: 'How warm?',
      choices: {
        light: 'Light layer',
        mid: 'Mid-weight',
        heavy: 'Heavy coat',
        rainproof: 'Rainproof',
      },
    },
    length: {
      question: 'Which length?',
      choices: { mini: 'Mini', midi: 'Midi', maxi: 'Maxi' },
    },
    sleeve: {
      question: 'Sleeve length?',
      choices: { sleeveless: 'Sleeveless', short: 'Short', long: 'Long' },
    },
    'trouser-cut': {
      question: 'Trouser cut?',
      choices: { straight: 'Straight', wide: 'Wide-leg', tapered: 'Tapered', cropped: 'Cropped' },
    },
    heel: {
      question: 'Heel or flat?',
      choices: {
        flats: 'Flats',
        low: 'Low heel',
        high: 'High heel',
        sneakers: 'Sneakers',
        boots: 'Boots',
      },
    },
    'bag-size': {
      question: 'Bag size?',
      choices: { mini: 'Mini', everyday: 'Everyday', tote: 'Tote', weekender: 'Weekender' },
    },
    neckline: {
      question: 'Neckline?',
      choices: { crew: 'Crew', vNeck: 'V-neck', collared: 'Collared', offShoulder: 'Off-shoulder' },
    },
    mood: {
      question: 'Which mood?',
      choices: {
        minimalist: 'Minimalist',
        streetwear: 'Streetwear',
        preppy: 'Preppy',
        romantic: 'Romantic',
        quietLuxury: 'Quiet luxury',
        athleisure: 'Athleisure',
      },
    },
    fit: {
      question: 'How should it fit?',
      choices: { slim: 'Slim', regular: 'Regular', relaxed: 'Relaxed', oversized: 'Oversized' },
    },
    season: {
      question: 'Which season?',
      choices: { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' },
    },
    'avoid-colour': {
      question: 'Any colour to avoid?',
      choices: {
        red: 'No red',
        black: 'No black',
        white: 'No white',
        pink: 'No pink',
        yellow: 'No yellow',
      },
    },
    fabric: {
      question: 'Fabric?',
      choices: {
        cotton: 'Cotton',
        linen: 'Linen',
        wool: 'Wool',
        silk: 'Silk',
        denim: 'Denim',
        leather: 'Leather',
      },
    },
    pattern: {
      question: 'Solid or pattern?',
      choices: {
        solid: 'Solid',
        stripes: 'Stripes',
        checks: 'Checks',
        floral: 'Floral',
        prints: 'Prints',
      },
    },
    order: {
      question: 'What first?',
      choices: {
        newest: 'Newest',
        popular: 'Most popular',
        trending: 'Trending',
        cheapest: 'Cheapest',
      },
    },
    time: {
      question: 'Day or night?',
      choices: { day: 'Daytime', evening: 'Evening', both: 'Both' },
    },
    pair: {
      question: 'Pair with something you own?',
      choices: {
        jeans: 'Jeans',
        suit: 'A suit',
        skirt: 'A skirt',
        sneakers: 'Sneakers',
        boots: 'Boots',
      },
    },
    care: {
      question: 'Easy care?',
      choices: {
        machineWash: 'Machine washable',
        wrinkleFree: 'Wrinkle-free',
        quickDry: 'Quick-dry',
      },
    },
    statement: {
      question: 'Statement or basic?',
      choices: { statement: 'A statement piece', basic: 'An everyday basic' },
    },
  },
}

export type ShopMessages = typeof shop
