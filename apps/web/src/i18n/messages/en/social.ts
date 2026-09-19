import { formatNumber } from '@/server/format'

/**
 * The surfaces two people share: a Look opened from a chat, Together, and
 * the prototype tour. Product nouns stay as they are — Lookline, Look, Look Card, Circle — and
 * catalog nouns come from `@/i18n/taxonomy`, never from here.
 */
export const social = {
  /** The name a signed-out reader gives before acting. */
  guest: {
    name: 'Your name',
    namePlaceholder: 'Alice',
    signIn: 'Sign in with a profile',
  },

  share: {
    link: 'Link',
    shareLink: 'Share link',
    copyPrompt: 'Copy this link',
  },

  keptStyle: {
    keeps: 'Keeps',
  },

  bag: {
    add: 'Add to bag',
    open: 'Open bag',
    added: 'Added to your bag.',
    confirmation: 'Added to your bag',
  },

  sharedLook: {
    metaTitle: 'Shared Look',
    nameError: 'Add your name first.',
    likeError: 'Your like was not saved. Try again.',
    likeSaved: (name: string) => `${name} will see you liked it.`,
    openLook: 'Open Look',
    makeItMine: 'Make it mine',
    stylePerson: (name: string) => `Style ${name}`,
    like: 'Like',
    liked: 'Liked',
    inThisLook: 'In this Look',
    noPieces: 'No pieces attached.',
  },

  together: {
    title: 'Together',
    description: (owner: string | null) =>
      owner
        ? `Combine Looks for an occasion · starting from ${owner}'s Look`
        : 'Combine Looks for an occasion',
    who: 'Who',
    noLooks: 'No Looks yet',
    personLook: (name: string) => `${name}'s Look`,
    noNetwork: "No one in your network yet. Paste a friend's Look link below.",
    lookLink: "Or a friend's Look link",
    occasion: 'Occasion',
    occasionPlaceholder: 'Choose an occasion',
    note: 'Note (optional)',
    notePlaceholder: 'Kenting in October',
    style: 'Style (optional)',
    titleField: 'Title (optional)',
    titlePlaceholder: (name: string, occasion: string) => `${name} & … · ${occasion}`,
    create: 'Create Together',
    lookTitle: (names: readonly string[], occasion: string) =>
      `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} · ${occasion}`,
    errors: {
      occasion: 'Choose an occasion.',
      participants: 'Add at least one other person.',
      token: 'That link is not a shared Look. Paste the /l/… link or its token.',
      products: 'The chosen Looks have no pieces.',
      noLook: (who: string) => `${who} has no Look yet.`,
      thatPerson: 'That person',
      look: 'The Look was not saved. Try again.',
      people: 'Your people could not be loaded. Add a friend by their Look link instead.',
    },
  },

  /** The two Together occasions the catalog taxonomy does not carry. */
  occasions: {
    graduation: 'Graduation',
    seasonal: 'Seasonal',
  },

  /** `/together` — the prototype tour walked for judges, so it explains itself as it goes. */
  tour: {
    title: 'Prototype tour',
    metaDescription: 'Ready Now, Made for You and Borrow a Look, on live catalog data.',
    description: 'Ready Now · Made for You · Borrow a Look, on live catalog data',
    sampleStates: 'Sample states',
    sample: 'Sample',
    catalogUnavailable: 'The live catalog is unavailable. Start the database and reload.',
    needsCatalog: 'The journey prototype needs the live catalog.',
    noProducts: 'No purchasable catalog products were found. Seed the catalog and reload.',
    paths: 'Journey paths',
    stepsLabel: (name: string) => `${name} steps`,
    milestonesLabel: 'Physical-to-social milestones',
    milestones: {
      product: 'Physical product',
      preview: 'Preview',
      order: 'Order',
      card: 'Look Card',
      circle: 'Circle',
    },
    scenarios: {
      ready: {
        name: 'Ready Now',
        short: 'Find it. Try it. Own it.',
        description: 'A real piece, previewed, bought, then a card.',
        steps: [
          {
            label: 'Ask',
            title: 'Say what you want',
            description: 'Natural language starts the search.',
          },
          {
            label: 'Choose',
            title: 'Pick an exact product',
            description: 'Every option is a real catalog item.',
          },
          {
            label: 'Preview',
            title: 'See it on your terms',
            description: 'The image is useful, but not owned yet.',
          },
          {
            label: 'Buy',
            title: 'Confirm the real variant',
            description: 'Size, price and availability stay attached.',
          },
          {
            label: 'Collect',
            title: 'Unlock your Look Card',
            description: 'Ownership creates the collectible.',
          },
        ],
        actions: [
          'Find exact products',
          'Open virtual preview',
          'Continue to checkout',
          'Confirm sample order',
          'Restart this path',
        ],
      },
      custom: {
        name: 'Made for You',
        short: 'Turn unmet intent into a product.',
        description: 'Orderable only after a base pattern and a review.',
        steps: [
          {
            label: 'Brief',
            title: 'Describe the difference',
            description: 'Text and references capture intent.',
          },
          {
            label: 'Ground',
            title: 'Choose a real base pattern',
            description: 'The request starts from something manufacturable.',
          },
          {
            label: 'Confirm',
            title: 'Review feasibility and quote',
            description: 'Approved details replace guesswork.',
          },
          {
            label: 'Order',
            title: 'Approve the custom SKU',
            description: 'The specification is fixed before payment.',
          },
          {
            label: 'Edition',
            title: 'Receive a distinct card',
            description: 'The card reflects the real production promise.',
          },
        ],
        actions: [
          'Create the brief',
          'Review the base pattern',
          'Accept the sample quote',
          'Confirm custom order',
          'Restart this path',
        ],
      },
      borrow: {
        name: 'Borrow a Look',
        short: 'Try what your Circle already loves.',
        description: 'Borrow a friend’s purchased piece digitally, then buy your own.',
        steps: [
          {
            label: 'Wardrobe',
            title: 'Enter the Circle Wardrobe',
            description: 'Only owner-shared purchases appear.',
          },
          {
            label: 'Borrow',
            title: 'Wear it digitally',
            description: 'The exact product enters your preview.',
          },
          {
            label: 'Offer',
            title: 'Get a Circle opportunity',
            description: 'A clear saving follows a useful try-on.',
          },
          {
            label: 'Own',
            title: 'Buy your own piece',
            description: 'Your order never changes your friend’s ownership.',
          },
          {
            label: 'Continue',
            title: 'Make the trend yours',
            description: 'Your card can move through another Circle.',
          },
        ],
        actions: [
          'Borrow this item',
          'Open digital try-on',
          'Use the Circle offer',
          'Confirm sample purchase',
          'Restart this path',
        ],
      },
    },
    examples: [
      'A sharp black layer for a gallery opening',
      'Something relaxed for a late flight',
      'A coordinated look for a seaside wedding',
    ],
    facts: {
      color: 'Color',
      material: 'Material',
      pattern: 'Pattern',
      available: 'Available',
    },
    selected: 'Selected',
    preview: {
      notOwned: 'Preview · not owned',
      styledFor: 'Styled for',
      you: 'You',
      catalogColour: (color: string) => `Catalog colour · ${color}`,
      alt: (title: string) => `${title} styled preview`,
    },
    card: {
      owned: 'Owned',
      lookCard: 'Look Card',
      alt: (product: string) => `Look Card for ${product}`,
      orderConfirmed: 'Order confirmed',
      shareWithCircle: 'Share this card with my Circle',
      shareToCircle: 'Share to Circle',
      exportImage: 'Export image',
      shared: 'Shared with your Circle.',
      downloadStarted: 'Download started.',
    },
    ready: {
      queryLabel: 'What are you dressing for?',
      queryPlaceholder: 'Occasion, mood, colour, budget',
      examples: 'Examples',
      results: (query: string) => `Live catalog results for “${query}”`,
      liveCatalog: 'Live catalog',
      size: 'Size',
      oneSize: 'One size',
      keepPrivate: 'Keep private until I share it',
      edition: 'Ready Now · owned SKU',
    },
    custom: {
      briefLabel: 'What is missing from the catalog?',
      briefPlaceholder:
        'Keep the relaxed shape, but explore an embroidered back graphic and a deeper red finish.',
      briefDefault:
        'Keep the relaxed shape, but explore an original embroidered back graphic and a deeper red finish.',
      addImage: 'Add an inspiration image',
      imageHint: 'JPG or PNG · inspiration only',
      choose: 'Choose',
      nextTitle: 'What happens next',
      nextSteps: [
        '1. Match to a real base pattern',
        '2. Review material, finish, graphic',
        '3. Confirm rights, price, lead time',
      ],
      basePattern: 'Base pattern · live catalog',
      adjustments: [
        { label: 'Shape', value: 'Keep the existing base pattern' },
        { label: 'Finish', value: 'Request an atelier palette review' },
        { label: 'Graphic', value: 'Back placement · embroidery review' },
        { label: 'Sizing', value: 'Use the base product size system' },
      ],
      reviewNotice: 'Review requests · confirmed by the atelier before purchase.',
      feasible: 'Feasible with confirmed details',
      spec: {
        base: 'Base pattern',
        finish: 'Finish',
        finishValue: 'Atelier-confirmed deep red treatment',
        graphic: 'Graphic',
        graphicValue: 'One-color back embroidery · original artwork only',
        production: 'Production',
        productionValue: '6–8 weeks after final artwork approval',
        edition: 'Edition',
        editionValue: 'Single-order custom production',
      },
      quote: 'Quote',
      quoteNote: 'Base garment, finish and embroidery',
      fixed: 'Specification fixed.',
      fixedNote: 'Changing a detail starts a new review.',
      rights: 'I own or may use the supplied graphic and references',
      total: 'Total',
      delivery: 'Estimated delivery · 6–8 weeks',
      issuing: 'Custom order confirmed · card issuing',
      cardFollows: 'The card follows the confirmed specification.',
      cardSpec: {
        base: 'Base',
        graphicValue: 'Original one-color back embroidery',
      },
      confirmedBase: 'Confirmed base pattern',
      baseAlt: (product: string) => `${product} base pattern`,
    },
    borrow: {
      member: 'A Circle member',
      sharedWithCircle: (handle: string) => `@${handle} shared this with your Circle`,
      purchasedItem: (color: string) => `${color} · purchased item`,
      digitalBorrow: (name: string) => `Digital borrow · ${name} keeps the item.`,
      borrowedPreview: 'You · borrowed digitally',
      offerTitle: 'Make it yours for 10% less.',
      offerNote: 'The exact product, its available variants only.',
      circlePrice: 'Circle price',
      save: (amount: string) => `Save ${amount} · expires in 48 hours`,
      yourOrder: 'Your own order',
      friendKeeps: (name: string) => `${name} keeps theirs; this is your own order.`,
      edition: 'Circle path · owned SKU',
    },
    outcomes: [
      { title: 'Before purchase', copy: 'Preview only. Nothing is owned yet.' },
      { title: 'After purchase', copy: 'The confirmed order issues a Look Card.' },
      { title: 'With a Circle', copy: 'Owners share; friends borrow, then buy their own.' },
    ],
    wardrobe: 'Open your wardrobe',
  },
}

export type SocialMessages = typeof social
