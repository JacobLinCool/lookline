export const me = {
  metaTitle: 'My collection',
  profileMeta: (handle: string, since: string) => `@${handle} · member since ${since}`,
  newCard: 'Make a Card',
  sectionUnavailable: 'This part could not be loaded.',
  cards: {
    title: 'Cards',
    credits: (n: number) => `${n} Card ${n === 1 ? 'credit' : 'credits'}`,
    personas: (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`,
    managePersonas: 'Manage personas',
    openStudio: 'Card studio',
    empty: 'No Cards yet.',
  },
  organize: {
    title: 'Collections & friends',
    collections: 'Collections',
    friends: 'Friends & sharing',
    collectionCount: (n: number) => `${n} ${n === 1 ? 'collection' : 'collections'}`,
    friendCount: (n: number, sharing: boolean) =>
      `${n} accepted ${n === 1 ? 'friend' : 'friends'} · purchases ${sharing ? 'shared' : 'private'}`,
    manageSharing: 'Manage',
  },
  photo: {
    title: 'Reference photo',
    currentAlt: 'Your saved reference photo',
    empty: 'No saved photo',
    hint: 'Private. Used only when you choose to generate a Card or outfit preview on yourself.',
    add: 'Add photo',
    replace: 'Replace photo',
    saving: 'Saving photo…',
    updated: 'Your reference photo was updated.',
    errors: {
      required: 'Choose a photo first.',
      type: 'Use a PNG, JPEG, or WebP image.',
      size: 'Keep the photo under 15 MB.',
      save: 'The photo could not be saved. Try again.',
    } as Record<string, string>,
  },
  previews: {
    title: 'Temporary previews',
    empty: 'No active previews',
    emptyDescription: 'Preview an outfit before checkout and it will stay here for 24 hours.',
    expires: (value: string) => `Expires ${value}`,
    status: { preparing: 'Preparing', ready: 'Ready', failed: 'Needs retry' },
  },
  wardrobe: {
    title: 'Wardrobe',
    empty: 'Nothing here yet',
    shop: 'Shop',
    createCard: 'Use in Card studio',
    forRecipient: (name: string) => `For ${name}`,
    someone: 'someone',
  },
}

export type MeMessages = typeof me
