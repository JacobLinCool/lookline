/** Shared UI kit and page-level states that are not owned by one surface. */
export const ui = {
  siteDescription:
    'Say what you are dressing for. Buy real pieces. Turn them into a Look your friends can pick up.',
  notFoundTitle: 'Nothing here',
  notFoundDescription: 'This page does not exist, or the Look was never shared.',
  notFoundAction: 'Back to Find',
  engineUnavailable: 'The engine did not answer.',
  imageOf: (name: string) => `${name}, product image`,
  avatarOf: (name: string) => `${name}, avatar`,
  removeFilter: (label: string) => `Remove filter ${label}`,
  priceFrom: (amount: string) => `From ${amount}`,
  was: (amount: string) => `was ${amount}`,

  /** Engine view only: the ranking factors behind a result. */
  factors: {
    style_similarity: 'Style match',
    attribute_match: 'Attributes',
    budget_fit: 'Budget fit',
    user_preference: 'Your taste',
    social_signal: 'Social signal',
    trend_momentum: 'Trend momentum',
    brand_affinity: 'Brand affinity',
    popularity_prior: 'Popularity',
    diversity: 'Diversity',
    compatibility: 'Compatibility',
  } as Record<string, string>,
  /** Where a Look came from, under the owner's name on a card. */
  lineage: {
    after: (handle: string) => `Inspired by @${handle}`,
    with: (handle: string) => `With @${handle}`,
  },

  /** `InstantForm`, the optimistic mutation shared by shop, looks and bag. */
  instantForm: {
    syncing: (confirmation: string) => `${confirmation} · syncing`,
    failed: 'This change could not be saved. Please retry.',
  },

  score: 'Score',
  noFactors: 'No factors recorded.',

  /**
   * Service failures a route handler hands back for the page to show. They are captions on a
   * retry, not explanations; the developer-facing contract messages stay in English.
   */
  errors: {
    tooLarge: 'Request too large.',
    invalidRequest: 'Invalid filter request.',
    wrongOrigin: 'Use this service from Lookline.',
    signInRequired: 'Sign in to use live filters and voice.',
    slowDown: 'Please pause briefly before trying again.',
    filtersUnavailable: 'Live filters are temporarily unavailable. Please try again.',
    keywordsUnavailable:
      'Keyword search is temporarily unavailable. Attribute filters still apply.',
    productsUnavailable: 'Products could not be loaded. Please try again.',
    sentenceTooLong: 'Enter a sentence of up to 500 characters.',
    recommendationsUnavailable: 'Recommendations could not be loaded. Please try again.',
    invalidLookId: 'Invalid Look id.',
    lookNotFound: 'Look not found.',
    lookOwnerOnly: 'Only the owner can render this Look.',
    choosePreset: 'Choose a style preset.',
    missingGenerationId: 'Missing generation id.',
    lookImageFailed: 'Could not create the image. Please try again.',
    voiceLanguages: 'Select at least one supported voice language.',
    voiceUnavailable: 'Voice is temporarily unavailable. You can keep typing.',
    voiceConnect: 'Voice could not connect. You can keep typing or try again.',
    searchPhrase: 'Enter a search phrase between 1 and 500 characters.',
    intentCompiler:
      'The intent compiler is unavailable. Check the TypeSafe configuration and retry.',
    imagePrompt: 'Enter a prompt between 1 and 2,000 characters and choose a valid ratio.',
    imageUnavailable:
      'Image generation is unavailable. Check the configured image provider and retry.',
    imageReferences: 'Attach up to 4 garment images and 4 person images, each 8 MB or smaller.',
    textModelMissing: 'No text model is configured. Add a provider key to apps/web/.dev.vars.',
    searchTrendsUnavailable: 'Search trends could not be loaded. Check the source and retry.',
    searchTrendGone: 'That trend is no longer in the current batch. Refresh and try again.',
    labToken: 'This action needs the lab token.',
    imageFailed: 'The image could not be generated. Review the prompt and try again.',
  },
}

export type UiMessages = typeof ui
