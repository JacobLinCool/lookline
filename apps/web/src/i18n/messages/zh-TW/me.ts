import type { MeMessages } from '../en/me'

export const me: MeMessages = {
  metaTitle: '衣櫥',
  profileMeta: (handle: string, since: string) => `@${handle} · ${since}加入`,
  newLook: '新的 Look',
  allCount: (n: number) => `全部 ${n}`,
  sectionUnavailable: '這個區塊沒有載入。',

  photo: {
    nextRender: '下次生成圖片時會使用你目前儲存的照片。',
    title: '參考照片',
    currentAlt: '你已儲存的參考照片',
    empty: '尚未儲存照片',
    hint: '這是私人照片，只會在你選擇用自己的樣子生成 Look 或穿搭預覽時使用。',
    add: '加入照片',
    replace: '更換照片',
    saving: '正在儲存照片…',
    updated: '已更新你的參考照片。',
    errors: {
      required: '請先選擇照片。',
      type: '請使用 PNG、JPEG 或 WebP 圖片。',
      size: '照片請小於 15 MB。',
      save: '無法儲存照片，請再試一次。',
    },
  },

  looks: {
    title: 'Look',
    empty: '還沒有 Look',
    madeTogether: '一起做的',
  },

  previews: {
    title: '限時預覽',
    empty: '目前沒有可用的預覽',
    emptyDescription: '結帳前預覽一套穿搭後，會在這裡保留 24 小時。',
    expires: (value: string) => `${value} 到期`,
    status: {
      preparing: '準備中',
      ready: '已完成',
      failed: '需要重試',
    },
  },

  wardrobe: {
    title: '衣櫥',
    empty: '這裡還是空的',
    shop: '選購',
    createLook: '做一個 Look',
    forRecipient: (name: string) => `給 ${name}`,
    someone: '別人',
  },

  taste: {
    title: '你的品味',
    stillLearning: '還在學習。先收藏或買幾件。',
    forOthers: '你為別人選購的風格',
    learnedStyles: '學到的風格',
    interactions: (n: number) => `${n} 次互動`,
    axes: '風格軸',
    noneYet: '尚無',
    noAxes: '尚無風格軸',
    weightConfidence: (weight: string, confidence: string) => `權重 ${weight} · 信心 ${confidence}`,
    axisNames: {
      formality: '正式度',
      warmth: '冷暖',
      boldness: '張揚度',
      structure: '結構感',
      'price-tier': '價位',
      coverage: '包覆度',
      texture: '質地',
      trendiness: '流行度',
    } as Record<string, string>,
    axisPoles: {
      formality: ['休閒', '正式'],
      warmth: ['冷', '暖'],
      boldness: ['內斂', '搶眼'],
      structure: ['柔軟', '俐落'],
      'price-tier': ['平價', '精品'],
      coverage: ['外露', '包覆'],
      texture: ['平滑', '有紋理'],
      trendiness: ['經典', '流行'],
    } as Record<string, [string, string]>,
    axisPolesFallback: ['低', '高'] as [string, string],
  },

  people: {
    title: '你身邊的人',
    empty: '還沒有人。把朋友的 Look 變成自己的，或分享一個你的。',
    andMore: (n: number) => `還有 ${n} 人`,
    kinds: {
      inspired_by: '靈感',
      styles: '搭配',
      buys_for: '買給誰',
      shops_with: '一起選購',
      remixed: '接著穿',
    } as Record<string, string>,
    edges: {
      inspiredOut: (name: string) => `受 ${name} 啟發`,
      inspiredIn: (name: string) => `${name} 受你啟發`,
      stylesOut: (name: string) => `你幫 ${name} 搭配`,
      stylesIn: (name: string) => `${name} 幫你搭配`,
      buysForOut: (name: string) => `你買給 ${name}`,
      buysForIn: (name: string) => `${name} 買給你`,
      shopsWith: (name: string) => `你和 ${name} 一起選購`,
      remixedOut: (name: string) => `${name} 把你的 Look 變成自己的`,
      remixedIn: (name: string) => `你把 ${name} 的 Look 變成自己的`,
    },
  },
}
