import { common } from './common'

/** `/bag`, `/checkout`, `/checkout/done`, and the messages the bag and order actions send back. */
export const bag = {
  metaTitle: 'Bag',
  title: 'Bag',
  titleWithCount: (n: number) => `Bag · ${common.count.pieces(n)}`,
  empty: 'Your bag is empty.',
  browseShop: 'Browse the Shop',
  decreaseQty: 'Decrease quantity',
  increaseQty: 'Increase quantity',
  droppedLines: (n: number) => `${common.count.lines(n)} no longer in the catalog and not counted.`,
  shipping: 'Shipping',
  shippingIncluded: 'Included',
  subtotal: 'Subtotal',
  fromLook: 'From a Look',

  checkout: {
    metaTitle: 'Checkout',
    title: 'Checkout',
    summary: (n: number, total: string) => `${common.count.pieces(n)} · ${total}`,
    total: 'Total',
    placeOrder: (total: string) => `Place order · ${total}`,
    placing: 'Placing order…',
    backToBag: 'Back to bag',
    sample: 'Sample · no payment',
  },

  done: {
    metaTitle: 'Order confirmed',
    title: 'Order confirmed',
    yoursNow: 'Yours now',
    forSomeone: (name: string) => `For ${name}`,
    forSomeoneElse: 'For someone else',
    makeLook: 'Make it a Look',
    makeLookNote: 'Your photo or avatar, a style, the pieces you just bought.',
    createLook: 'Create a Look',
    backToShop: 'Back to Shop',
    noOrder: 'No order found for this link.',
    wardrobe: 'Wardrobe',
  },

  errors: {
    chooseProduct: 'Choose a product.',
    full: (max: number) =>
      `Your bag is full (${common.count.pieces(max)}). Remove a piece and retry.`,
    invalidLine: 'Choose a valid size and quantity.',
    outfitTooMany: (max: number) => `Choose up to ${max} available pieces.`,
    outfitNoRoom: 'Your bag has no room for this outfit. Remove a piece and retry.',
    orderFailed: 'Your order could not be placed. Please try again.',
  },
}

export type BagMessages = typeof bag
