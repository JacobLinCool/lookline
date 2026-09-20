export const previews = {
  metaTitle: 'Preview an outfit',
  new: {
    title: 'Preview this outfit on you',
    description:
      'See the pieces together before you buy. This private preview lasts 24 hours and is not shared.',
    pieces: 'Pieces in this preview',
    style: 'Image style',
    photo: 'Your reference photo',
    photoHint: 'Required. A new photo takes priority over your saved photo.',
    photoPreviewAlt: 'Reference photo for this preview',
    noPhotoSelected: 'Choose a photo to preview this outfit on you',
    savedPhotoSelected: 'Using your saved photo',
    photoRequired: 'Choose a photo or use your saved photo.',
    occasion: 'Occasion (optional)',
    occasionPlaceholder: 'Dinner, work, a weekend away…',
    titleField: 'Preview name',
    defaultTitle: 'My outfit preview',
    submit: 'Generate preview',
    creating: 'Preparing your preview…',
    emptyTitle: 'Choose some pieces first',
    emptyDescription: 'Open an outfit or add pieces to your bag, then preview them together.',
  },
  borrowed: {
    description: 'Try the exact pieces from this Card on your own reference photo.',
    exact: 'Card outfit snapshot',
    exactNote:
      'The pieces come from the Card’s immutable snapshot. You can choose your own image style.',
    defaultTitle: 'Card outfit preview',
  },
  detail: {
    imageUnavailable: 'The image is unavailable. Retry while this preview is available.',
    temporary: 'Private · temporary preview',
    explanation:
      'This image is for deciding before checkout. It is temporary and will not appear in your Cards.',
    expires: (value: string) => `Available until ${value}`,
    pieces: 'Pieces in this preview',
    addAvailable: 'Add available pieces to bag',
    added: 'Available pieces added to your bag',
    soldOut: 'Sold out',
    unavailableCount: (n: number) =>
      `${n} sold-out ${n === 1 ? 'piece was' : 'pieces were'} skipped.`,
  },
  expired: {
    title: 'This preview has expired',
    description:
      'Temporary previews are removed after 24 hours. Choose the pieces again to make a new one.',
  },
  actions: {
    previewLook: 'Preview Card outfit',
    previewBag: 'Preview bag on me',
    previewOnMe: 'Preview on me',
  },
  errors: {
    pickPiece: 'Choose at least one piece.',
    unknownProducts: 'One or more pieces are no longer available.',
    photoType: 'Use a PNG, JPEG, or WebP reference photo.',
    photoSize: 'Keep the reference photo under 15 MB.',
    photoRequired: 'Choose a reference photo or use your saved photo.',
    notCreated:
      'The preview could not be created. Check image rendering configuration and try again.',
    sourceUnavailable: 'That Card is private or no longer available.',
    unavailable: 'This preview is no longer available.',
    noneAvailable: 'Every piece in this preview is sold out.',
    bagFull: 'Your bag has no room for these pieces. Remove a piece and retry.',
  },
}

export type PreviewMessages = typeof previews
