/** `/me`: the viewer's Looks, temporary previews, Wardrobe, taste, People and Asks. */
export const me = {
  metaTitle: 'Wardrobe',
  profileMeta: (handle: string, since: string) => `@${handle} · member since ${since}`,
  newLook: 'New Look',
  allCount: (n: number) => `All ${n}`,
  sectionUnavailable: 'This part could not be loaded.',

  looks: {
    title: 'Looks',
    empty: 'No Looks yet',
    madeTogether: 'Made together',
  },

  previews: {
    title: 'Temporary previews',
    empty: 'No active previews',
    emptyDescription: 'Preview an outfit before checkout and it will stay here for 24 hours.',
    expires: (value: string) => `Expires ${value}`,
    status: {
      preparing: 'Preparing',
      ready: 'Ready',
      failed: 'Needs retry',
    },
  },

  wardrobe: {
    title: 'Wardrobe',
    empty: 'Nothing here yet',
    shop: 'Shop',
    createLook: 'Create a Look',
    forRecipient: (name: string) => `For ${name}`,
    someone: 'someone',
  },

  taste: {
    title: 'Your taste',
    stillLearning: 'Still learning. Save or buy a few pieces.',
    forOthers: 'For people you buy for',
    learnedStyles: 'Learned styles',
    interactions: (n: number) => `${n} interactions`,
    axes: 'Axes',
    noneYet: 'None yet',
    noAxes: 'No axes yet',
    weightConfidence: (weight: string, confidence: string) =>
      `weight ${weight} · confidence ${confidence}`,
    axisNames: {
      formality: 'Formality',
      warmth: 'Warmth',
      boldness: 'Boldness',
      structure: 'Structure',
      'price-tier': 'Price tier',
      coverage: 'Coverage',
      texture: 'Texture',
      trendiness: 'Trendiness',
    } as Record<string, string>,
    axisPoles: {
      formality: ['casual', 'formal'],
      warmth: ['cool', 'warm'],
      boldness: ['quiet', 'bold'],
      structure: ['soft', 'structured'],
      'price-tier': ['budget', 'luxury'],
      coverage: ['bare', 'covered'],
      texture: ['smooth', 'textured'],
      trendiness: ['classic', 'trend-led'],
    } as Record<string, [string, string]>,
    axisPolesFallback: ['low', 'high'] as [string, string],
  },

  people: {
    title: 'People',
    empty: 'No one yet. Ask a friend, or make a Look yours.',
    andMore: (n: number) => `and ${n} more`,
    kinds: {
      asks: 'Advice',
      trusts: 'Trust',
      inspired_by: 'Inspiration',
      styles: 'Styling',
      buys_for: 'Buying for',
      shops_with: 'Shopping together',
      remixed: 'Made it theirs',
    } as Record<string, string>,
    edges: {
      asksOut: (name: string) => `You ask ${name} for advice`,
      asksIn: (name: string) => `${name} asks you for advice`,
      trustsOut: (name: string) => `You act on ${name}'s advice`,
      trustsIn: (name: string) => `${name} acts on your advice`,
      inspiredOut: (name: string) => `Inspired by ${name}`,
      inspiredIn: (name: string) => `${name} is inspired by you`,
      stylesOut: (name: string) => `You style ${name}`,
      stylesIn: (name: string) => `${name} styles you`,
      buysForOut: (name: string) => `You buy for ${name}`,
      buysForIn: (name: string) => `${name} buys for you`,
      shopsWith: (name: string) => `You shop with ${name}`,
      remixedOut: (name: string) => `${name} made your Look theirs`,
      remixedIn: (name: string) => `You made ${name}'s Look yours`,
    },
  },

  asks: {
    title: 'Asks',
    youAsked: 'You asked',
    askedOfYou: 'Asked of you',
    nothingYet: 'Nothing yet',
    card: 'Card',
    answer: 'Answer',
    kinds: {
      choose: 'Which one?',
      style_me: 'Style me',
    } as Record<string, string>,
    status: {
      open: 'Open',
      answered: 'Answered',
      closed: 'Closed',
    } as Record<string, string>,
  },
}

export type MeMessages = typeof me
