/**
 * Looks: making one (`/looks/new`), reading one (`/looks/[id]`), where it travelled
 * (`/looks/[id]/lineage`), making it yours (`/looks/[id]/remix`), and the pieces that hang under
 * a Look. Style-preset names and slot roles come from the engine and the catalog, not from here.
 */
export const looks = {
  /** Words more than one Look surface uses. */
  style: 'Style',
  titleField: 'Title',
  photoField: 'Your photo (optional)',
  update: 'Update',

  visibility: {
    private: 'Only me',
    link: 'Anyone with the link',
    public: 'Everyone on Lookline',
  },

  /** `look_products.role`: the slot a piece fills. */
  roles: {
    top: 'Top',
    bottom: 'Bottom',
    'one-piece': 'One piece',
    outer: 'Outer',
    shoes: 'Shoes',
    bag: 'Bag',
    jewelry: 'Jewelry',
    accessory: 'Accessory',
  } as Record<string, string>,

  new: {
    title: 'New Look',
    emptyTitle: 'Nothing to make a Look from yet.',
    emptyDescription: 'Looks are made from pieces you own.',
    pieces: 'Pieces',
    photo: 'Photo',
    chosen: 'In',
    bought: (when: string) => `Bought ${when}`,
    photoHint: 'Only used to render your Look.',
    rememberPhoto: 'Remember this photo',
    useSavedPhoto: 'Use my saved photo',
    occasion: 'Occasion (optional)',
    occasionPlaceholder: 'First day at the new office / 音樂祭',
    defaultTitle: (name: string) => `${name}'s Look`,
    visibility: 'Who can see it',
    submit: 'Create Look',
    creating: 'Creating…',
  },

  detail: {
    metaTitle: 'Look',
    metaDescription: (name: string) => `A Look by ${name}`,
    inspiredBy: 'Inspired by',
    madeWith: (names: readonly string[]) => `Made with ${names.join(', ')}`,
    makeItMine: 'Make it mine',
    askAFriend: 'Ask a friend',
    together: 'Together',
    liked: (n: number) => (n === 1 ? '1 person liked this' : `${n} people liked this`),
    visibility: 'Who can see this',
    pieces: 'In this Look',
    travelled: 'See where this Look travelled',
  },

  lineage: {
    title: 'Where this Look travelled',
    back: 'Back to the Look',
    path: 'Path from the first Look',
    unavailable: 'This Look’s history could not be loaded.',
  },

  remix: {
    title: 'Make it mine',
    forSomeone: (name: string) => `A Look for ${name}`,
    basedOn: (title: string, name: string) => `Based on “${title}” by ${name}`,
    sentTo: (name: string) => `Sent to ${name}`,
    sentNote: 'The Look is theirs now. The link opens without an account.',
    styledBy: (name: string) => `Styled by ${name}`,
    shareLink: 'Share link',
    openLook: 'Open Look',
    keeps: 'Keeps',
    budget: 'Budget for the whole Look',
    budgetPlaceholder: 'NT$5,000',
    swapIn: 'Swap in',
    keepOriginal: 'Keep from the original',
    yourLook: 'Your Look',
    defaultTitle: (name: string, sourceTitle: string) => `${name}'s ${sourceTitle}`,
    defaultTitleFor: (recipient: string, stylist: string) => `For ${recipient}, by ${stylist}`,
    save: 'Save my Look',
    sendTo: (name: string) => `Send to ${name}`,
    suggestionsUnavailable: 'Suggestions are unavailable. The original pieces still are.',
    noneInBudget: 'Nothing fits this budget. Raise it or keep the original pieces.',
    fit: 'Fit',
  },

  /** The Look image and its render controls. */
  canvas: {
    imageStyle: 'Image style',
    render: 'Render',
    rendering: 'Rendering…',
    renderingStatus: 'Rendering the image',
    ready: 'Image ready',
    imageUnavailable: 'The image is unavailable. Your Look is saved.',
    renderFailed: 'The render could not start.',
    cancelFailed: 'The render could not be cancelled.',
    checkFailed: 'Could not check the render. Reload to reconnect.',
    imageLoadFailed: 'The new image could not be loaded. The previous one is still here.',
  },

  /** `?notice=<key>` after a redirect. */
  flash: {
    reacted: 'Liked.',
    added: 'Added to your bag.',
    regenerated: 'Image updated.',
    visibility: 'Visibility updated.',
  },

  /** The rail of pieces under a Look. */
  strip: {
    empty: 'No pieces attached.',
    sizeFor: (name: string) => `Size for ${name}`,
    addToBag: 'Add to bag',
    added: 'Added to your bag',
    soldOut: 'Sold out',
  },

  /** Order lines: bag, checkout, receipt. */
  line: {
    size: (size: string) => `Size ${size}`,
    oneSize: 'One size',
  },

  reaction: {
    like: 'Like',
    liked: 'Liked',
    likeThis: 'Like this Look',
    notSaved: 'Your like was not saved. Try again.',
  },

  recipient: {
    legend: 'Recipient',
    self: 'Me',
    other: 'Someone else',
    undisclosed: 'Not now',
    label: 'Who is it for',
    hint: 'A name is enough. Only you see it.',
    placeholder: 'Mom · 小美 · a friend',
  },

  share: {
    copied: 'Link copied',
  },

  /** Titles given to a Look when the maker leaves the field empty. */
  titles: {
    edition: (name: string) => `${name} · Edition`,
    styledFor: (stylist: string, recipient: string) => `Styled by ${stylist} for ${recipient}`,
    remixOf: (name: string, sourceTitle: string) => `${name} remix of ${sourceTitle}`,
  },

  errors: {
    pickPiece: 'Pick at least one piece to put in the edition.',
    unknownProducts: 'Those products are no longer in the catalog.',
    photoType: 'The photo must be an image file.',
    photoSize: 'The photo must be 8 MB or smaller.',
    notCreated: 'The Look could not be created.',
    unavailable: 'This Look is unavailable.',
    signInToReact: 'Sign in to react.',
    cannotReact: 'This Look cannot receive your reaction.',
    private: 'This Look is private.',
    reactionNotSaved: 'Your reaction could not be saved. Please try again.',
    ownerOnlyVisibility: 'Only the owner can change visibility.',
    keepOnePiece: 'Keep at least one piece in the Look.',
    noSuchPerson: 'That person no longer exists.',
    notSaved: 'The Look was not saved. Try again.',
  },
}

export type LooksMessages = typeof looks
