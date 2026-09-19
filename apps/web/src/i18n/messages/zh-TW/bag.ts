import type { BagMessages } from '../en/bag'
import { common } from './common'

export const bag: BagMessages = {
  metaTitle: '購物袋',
  title: '購物袋',
  titleWithCount: (n: number) => `購物袋 · ${common.count.pieces(n)}`,
  empty: '購物袋是空的。',
  browseShop: '前往選購',
  decreaseQty: '減少數量',
  increaseQty: '增加數量',
  droppedLines: (n: number) => `${common.count.lines(n)}已不在商品目錄中，未列入計算。`,
  shipping: '運費',
  shippingIncluded: '已含',
  subtotal: '小計',
  fromLook: '來自一個 Look',

  checkout: {
    metaTitle: '結帳',
    title: '結帳',
    summary: (n: number, total: string) => `${common.count.pieces(n)} · ${total}`,
    total: '總計',
    placeOrder: (total: string) => `送出訂單 · ${total}`,
    placing: '送出訂單中…',
    backToBag: '回到購物袋',
    sample: '示範 · 不會付款',
  },

  done: {
    metaTitle: '訂單已確認',
    title: '訂單已確認',
    yoursNow: '現在屬於你',
    forSomeone: (name: string) => `給 ${name}`,
    forSomeoneElse: '送給別人',
    makeLook: '做成一個 Look',
    makeLookNote: '你的照片或頭像、一種風格，加上剛買的單品。',
    createLook: '做一個 Look',
    backToShop: '回到選購',
    noOrder: '這個連結找不到訂單。',
    wardrobe: '衣櫥',
    creditsEarned: (n: number) => `這筆訂單給了你 ${n} 次製卡額度`,
    creditsNote: '每件滿 NT$320 的商品給 3 次。一次可以生成 4 張候選，選 1 張正式發行。',
    makeCard: '去製卡',
  },

  errors: {
    chooseProduct: '請選擇商品。',
    full: (max: number) => `購物袋已滿（${common.count.pieces(max)}），請先移除一件再試。`,
    invalidLine: '請選擇有效的尺寸與數量。',
    outfitTooMany: (max: number) => `最多可選 ${max} 件有庫存的單品。`,
    outfitNoRoom: '購物袋放不下這一整套，請先移除一件再試。',
    orderFailed: '訂單沒有送出，請再試一次。',
  },
}
