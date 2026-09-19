import type { LooksMessages } from '../en/looks'

export const looks: LooksMessages = {
  style: '風格',
  titleField: '標題',
  photoField: '你的照片（選填）',
  update: '更新',

  visibility: {
    private: '只有我',
    link: '有連結的人',
    public: 'Lookline 上的所有人',
  },

  roles: {
    top: '上身',
    bottom: '下身',
    'one-piece': '連身',
    outer: '外搭',
    shoes: '鞋',
    bag: '包',
    jewelry: '首飾',
    accessory: '配件',
  } as Record<string, string>,

  new: {
    title: '新的 Look',
    emptyTitle: '還沒有可以組成 Look 的單品。',
    emptyDescription: 'Look 由你擁有的單品組成。',
    pieces: '單品',
    photo: '照片',
    chosen: '已選',
    bought: (when: string) => `${when}購入`,
    photoHint: '只用來生成你的 Look。',
    rememberPhoto: '記住這張照片',
    useSavedPhoto: '使用已存的照片',
    occasion: '場合（選填）',
    occasionPlaceholder: '上班第一天 / 音樂祭',
    defaultTitle: (name: string) => `${name} 的 Look`,
    visibility: '誰可以看到',
    submit: '建立 Look',
    creating: '建立中…',
  },

  detail: {
    metaTitle: 'Look',
    metaDescription: (name: string) => `${name} 的 Look`,
    inspiredBy: '靈感來自',
    madeWith: (names: readonly string[]) => `和 ${names.join('、')} 一起完成`,
    makeItMine: '做成我的',
    askAFriend: '問朋友',
    together: '一起搭',
    liked: (n: number) => `${n} 個人喜歡`,
    visibility: '誰可以看到',
    pieces: '這個 Look 的單品',
    travelled: '看這個 Look 傳到了哪裡',
  },

  lineage: {
    title: '這個 Look 傳到了哪裡',
    back: '回到 Look',
    path: '從最初的 Look 到這裡的路徑',
    unavailable: '這個 Look 的歷程無法載入。',
  },

  remix: {
    title: '做成我的',
    forSomeone: (name: string) => `給 ${name} 的 Look`,
    basedOn: (title: string, name: string) => `以 ${name} 的「${title}」為基礎`,
    sentTo: (name: string) => `已送給 ${name}`,
    sentNote: '這個 Look 現在屬於對方。沒有帳號也能打開連結。',
    styledBy: (name: string) => `由 ${name} 搭配`,
    shareLink: '分享連結',
    openLook: '開啟 Look',
    keeps: '保留',
    budget: '整套的預算',
    budgetPlaceholder: 'NT$5,000',
    swapIn: '換入',
    keepOriginal: '保留原本的',
    yourLook: '你的 Look',
    defaultTitle: (name: string, sourceTitle: string) => `${name} 的 ${sourceTitle}`,
    defaultTitleFor: (recipient: string, stylist: string) => `給 ${recipient}，由 ${stylist} 搭配`,
    save: '儲存我的 Look',
    sendTo: (name: string) => `送給 ${name}`,
    suggestionsUnavailable: '推薦暫時無法使用，原本的單品仍在。',
    noneInBudget: '這個預算內沒有適合的單品，可以提高預算或保留原本的。',
    fit: '適合度',
  },

  canvas: {
    imageStyle: '圖片風格',
    render: '生成',
    rendering: '生成中…',
    renderingStatus: '正在生成圖片',
    ready: '圖片完成',
    imageUnavailable: '圖片暫時無法顯示，你的 Look 已儲存。',
    renderFailed: '無法開始生成。',
    cancelFailed: '無法取消生成。',
    checkFailed: '無法確認生成進度，重新載入即可繼續。',
    imageLoadFailed: '新的圖片無法載入，目前顯示的仍是上一張。',
  },

  flash: {
    reacted: '已喜歡。',
    added: '已加入購物袋。',
    regenerated: '圖片已更新。',
    visibility: '已更新可見範圍。',
  },

  strip: {
    empty: '沒有附上任何單品。',
    sizeFor: (name: string) => `${name} 的尺寸`,
    addToBag: '加入購物袋',
    added: '已加入購物袋',
    soldOut: '已售完',
  },

  line: {
    size: (size: string) => `尺寸 ${size}`,
    oneSize: '單一尺寸',
  },

  reaction: {
    like: '喜歡',
    liked: '已喜歡',
    likeThis: '喜歡這個 Look',
    notSaved: '你的喜歡沒有儲存成功，請再試一次。',
  },

  recipient: {
    legend: '購買對象',
    self: '自己',
    other: '別人',
    undisclosed: '暫不填',
    label: '要給誰',
    hint: '填個名字就好，只有你看得到。',
    placeholder: '媽媽 · 小美 · 朋友',
  },

  share: {
    copied: '已複製連結',
  },

  titles: {
    edition: (name: string) => `${name} 的 Look`,
    styledFor: (stylist: string, recipient: string) => `${stylist} 為 ${recipient} 搭配`,
    remixOf: (name: string, sourceTitle: string) => `${name} 改編自「${sourceTitle}」`,
  },

  errors: {
    pickPiece: '請至少選一件單品放進這個 Look。',
    unknownProducts: '這些商品已不在商品庫中。',
    photoType: '照片必須是圖片檔。',
    photoSize: '照片大小請在 15 MB 以內。',
    notCreated: '這個 Look 無法建立。',
    unavailable: '這個 Look 目前無法使用。',
    signInToReact: '請先登入才能回應。',
    cannotReact: '這個 Look 無法接受你的回應。',
    private: '這個 Look 是私人的。',
    reactionNotSaved: '你的回應沒有儲存成功，請再試一次。',
    ownerOnlyVisibility: '只有擁有者可以變更可見範圍。',
    keepOnePiece: '請至少保留一件單品。',
    noSuchPerson: '找不到這個人了。',
    notSaved: '這個 Look 沒有儲存成功，請再試一次。',
  },
}
