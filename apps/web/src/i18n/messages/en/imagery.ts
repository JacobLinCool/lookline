export const imagery = {
  photoField: 'Your photo',
  newPhoto: 'New photo',
  rememberPhoto: 'Remember this photo',
  useSavedPhoto: 'Use my saved photo',
  canvas: {
    imageStyle: 'Image style',
    render: 'Render',
    rendering: 'Rendering…',
    renderingStatus: 'Rendering the image',
    ready: 'Image ready',
    imageUnavailable: 'The image is unavailable.',
    renderFailed: 'The render could not start.',
    cancelFailed: 'The render could not be cancelled.',
    checkFailed: 'Could not check the render. Reload to reconnect.',
    imageLoadFailed: 'The new image could not be loaded. The previous one is still here.',
  },
  flash: {
    added: 'Added to your bag.',
    regenerated: 'Image updated.',
    visibility: 'Visibility updated.',
  },
  line: {
    size: (size: string) => `Size ${size}`,
    oneSize: 'One size',
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
}

export type ImageryMessages = typeof imagery
