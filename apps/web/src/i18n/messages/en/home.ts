import { common } from './common'

/**
 * The Find page: the one-sentence field, the rails under it, the understood intent as tags, and
 * the ranked pieces and outfits that come back. `engine` is Engine view only; `reasons` are the
 * short factor phrases `reasonLine` puts on a card. Catalog nouns are not here.
 */
export const home = {
  metaTitle: 'Find',

  hero: {
    title: 'What are you dressing for?',
  },

  sayIt: {
    label: 'What are you dressing for?',
    placeholder: 'A wedding next week, under NT$5,000, not too formal',
    compactLabel: 'Your sentence',
    compactPlaceholder: 'Change the sentence',
    submit: 'Find pieces',
    examplesLabel: 'Example sentences',
    /**
     * Shopper utterances, not translations: each locale gets sentences someone would actually
     * type here. One per slot — occasion and budget, a gift, a reference, a whole outfit.
     */
    examples: [
      'office party on Friday, under NT$3,000, nothing too formal',
      'gift for my dad under $100, he likes hiking',
      'something like a Tokyo streetwear look but for a woman, under NT$4,000',
      'put a date outfit together, I like minimal Korean style',
    ],
  },

  rails: {
    circle: 'Your circle, then the network',
    network: 'Looks from the network',
    trending: 'Trending now',
  },

  status: {
    finding: 'Finding pieces…',
    ready: (n: number) => `${common.count.pieces(n)} ready`,
    stillLooking: 'Still looking. Change the sentence or retry.',
    loadFailed: 'Recommendations could not be loaded. Please try again.',
  },

  refinement: {
    label: 'Updated suggestions',
    show: 'Show',
  },

  /** The understood sentence as a row of tags. */
  tags: {
    understood: 'Understood',
    budgetUnder: (amount: string) => `Under ${amount}`,
    budgetFrom: (amount: string) => `From ${amount}`,
    /** The budget question's opt-out, whose value on the wire is `none`. */
    noLimit: 'No limit',
    forRecipient: (who: string) => `For ${who}`,
    forSomeoneElse: 'For someone else',
    avoid: (thing: string) => `No ${thing.toLowerCase()}`,
  },

  items: {
    title: 'Pieces for you',
    failed: 'Pieces could not be loaded.',
    emptyTitle: 'Nothing matched everything you asked for.',
    emptyDescription: 'Loosen the budget or drop a must-have.',
    save: 'Save',
    saved: 'Saved',
    notForMe: 'Not for me',
    hidden: 'Hidden',
    signInToSave: 'Sign in to keep your picks.',
    notSaved: 'Not saved. Try again.',
  },

  outfits: {
    title: 'Outfits',
    failed: 'Outfits could not be loaded.',
    emptyTitle: 'No complete outfit within this budget.',
    emptyDescription: 'The pieces below still match on their own.',
    one: 'Outfit',
    totalOfBudget: (total: string, budget: string) => `${total} of ${budget}`,
    addAll: 'Add all to bag',
    added: 'Added to your bag',
    /** Engine outfit slots; singular and not catalog group slugs, so they live here. */
    roles: {
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
    } as Record<string, string>,
  },

  /** Optimistic form status, shared by every surface that submits without leaving the page. */
  /** Engine view only: the whole parse, slot by slot. */
  engine: {
    label: 'Engine',
    sectionTitle: 'Engine · how this was understood',
    confidence: (percent: number) => `confidence ${percent}%`,
    confidenceOf: (percent: number) => `Confidence ${percent}%`,
    assumptions: 'Assumptions',
    forYou: 'For you',
    someoneElse: 'someone else',
    forRecipient: (who: string) => `For ${who}`,
    forRecipientIn: (who: string, department: string) => `For ${who} · ${department.toLowerCase()}`,
    budgetUpTo: (amount: string) => `up to ${amount}`,
    budgetFrom: (amount: string) => `from ${amount}`,
    modes: {
      outfit: 'Whole outfit',
      single: 'Single piece',
      browse: 'Browse',
    },
    slots: {
      mode: 'Mode',
      department: 'Department',
      categories: 'Categories',
      colours: 'Colours',
      aesthetics: 'Aesthetics',
      materialsFit: 'Materials & fit',
      occasionSeason: 'Occasion & season',
      budget: 'Budget',
      recipient: 'Recipient',
      sizes: 'Sizes',
      mustHave: 'Must have',
      mustAvoid: 'Must avoid',
      vibe: 'Vibe',
    },
  },

  /** One short phrase per ranking factor, for the reason under a card. */
  discovery: {
    trending: 'Trending',
    trendingReason: 'Across the catalog, ranked by trend momentum and purchase popularity.',
    searching: (label: string) => `What people are looking up · ${label}`,
    forYou: 'For your style',
    anotherPreference: 'Another side of your taste',
    preferenceTitle: (label: string) => `Picked for you · ${label}`,
    preferenceReason: (label: string) => `Based on your preference for ${label}.`,
    recent: 'Recently viewed',
    recentReason: 'Your most recent visits, with each piece shown once.',
    friends: 'Friends lately',
    friendsReason: 'Shared purchases and public cards from the past 30 days.',
    signIn: 'Sign in to see your preferences, recent visits and friends.',
    learning:
      'Keep exploring and saving pieces you like. Your recommendations will grow from those choices.',
    noHistory: 'The pieces you open will appear here.',
    noFriends: 'Add a friend to see what they choose to share.',
    noActivity: 'No shared activity yet. Friends decide which purchases and cards to share.',
    noProducts: 'No pieces are available here yet.',
    failed: 'This row did not load. You can still explore the others.',
    browse: 'Explore pieces',
    manageFriends: 'Manage friends',
    previous: (title: string) => `Previous in ${title}`,
    next: (title: string) => `Next in ${title}`,
    bought: (name: string) => `${name} bought this`,
    made: (name: string) => `Made by ${name}`,
    friendTitle: 'Friends and sharing',
    handle: 'Friend’s account handle',
    invite: 'Send invitation',
    accept: 'Accept',
    remove: 'Remove / decline',
    pending: 'Invitation sent',
    sharePurchases: 'Share recent purchases with accepted friends',
    save: 'Save sharing',
    saved: 'Saved',
    invitationFailed: 'That account could not be invited.',
    cardVisibility: 'Card visibility',
    private: 'Only me',
    link: 'Anyone with the link',
    public: 'Public · also appears to friends',
  },
  reasons: {
    style_similarity: 'Matches the style',
    attribute_match: 'What you asked for',
    budget_fit: 'In budget',
    user_preference: 'Close to your taste',
    social_signal: 'Friends chose it',
    trend_momentum: 'Trending now',
    brand_affinity: 'A brand you buy',
    popularity_prior: 'Popular',
    diversity: 'Something different',
    compatibility: 'Goes together',
  } as Record<string, string>,
}

export type HomeMessages = typeof home
