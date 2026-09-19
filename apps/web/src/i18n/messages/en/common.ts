import { formatNumber } from '@/server/format'

/**
 * Words shared by every surface: the verbs on buttons, the states a page can be in, and the
 * counted nouns. A namespace owns a phrase only when it reads differently in its own context.
 */
export const common = {
  apply: 'Apply',
  back: 'Back',
  cancel: 'Cancel',
  clear: 'Clear',
  close: 'Close',
  confirm: 'Confirm',
  continue: 'Continue',
  copy: 'Copy link',
  copied: 'Copied',
  discard: 'Discard',
  done: 'Done',
  edit: 'Edit',
  next: 'Next',
  open: 'Open',
  preview: 'Preview',
  remove: 'Remove',
  retry: 'Retry',
  save: 'Save',
  seeAll: 'See all',
  send: 'Send',
  share: 'Share',
  skip: 'Skip',
  showMore: 'Show more',
  showLess: 'Show less',

  signIn: 'Sign in',
  signOut: 'Sign out',
  signedIn: 'signed in',

  loading: 'Loading…',
  updating: 'Updating…',
  saving: 'Saving…',
  sending: 'Sending…',
  unavailable: 'Unavailable',
  none: 'None',
  all: 'All',
  yes: 'Yes',
  no: 'No',
  on: 'on',
  off: 'off',

  error: 'Something did not load.',
  networkError: 'The network did not answer. Try again.',
  notFound: 'Not found.',

  count: {
    pieces: (n: number) => `${formatNumber(n)} ${n === 1 ? 'piece' : 'pieces'}`,
    items: (n: number) => `${formatNumber(n)} ${n === 1 ? 'item' : 'items'}`,
    looks: (n: number) => `${formatNumber(n)} ${n === 1 ? 'Look' : 'Looks'}`,
    lines: (n: number) => `${formatNumber(n)} ${n === 1 ? 'line' : 'lines'}`,
    answers: (n: number) => `${formatNumber(n)} ${n === 1 ? 'answer' : 'answers'}`,
    replies: (n: number) => `${formatNumber(n)} ${n === 1 ? 'reply' : 'replies'}`,
    likes: (n: number) => `${formatNumber(n)} ${n === 1 ? 'like' : 'likes'}`,
    purchases: (n: number) => `${formatNumber(n)} ${n === 1 ? 'purchase' : 'purchases'}`,
    people: (n: number) => `${formatNumber(n)} ${n === 1 ? 'person' : 'people'}`,
    friends: (n: number) => `${formatNumber(n)} ${n === 1 ? 'friend' : 'friends'}`,
  },
}

export type CommonMessages = typeof common
