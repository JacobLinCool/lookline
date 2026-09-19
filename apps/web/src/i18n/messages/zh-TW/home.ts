import type { HomeMessages } from '../en/home'
import { common } from './common'

export const home: HomeMessages = {
  metaTitle: '尋找',

  hero: {
    title: '要穿去什麼場合？',
  },

  sayIt: {
    label: '要穿去什麼場合？',
    placeholder: '下週要參加婚禮，NT$5,000 以內，不要太正式',
    compactLabel: '你的描述',
    compactPlaceholder: '換一句話說',
    submit: '尋找單品',
    examplesLabel: '範例句子',
    examples: [
      '下週要去朋友婚禮，預算五千，不想太正式',
      '想送爸爸禮物，三千以內，他喜歡爬山',
      '想找東京街頭風的女裝，四千以內',
      '幫我配一套約會穿搭，喜歡韓系簡約',
    ],
  },

  rails: {
    circle: '你的圈子，接著是社群',
    network: '社群的 Look',
    trending: '正在流行',
  },

  status: {
    finding: '正在尋找單品…',
    ready: (n: number) => `${common.count.pieces(n)}已就緒`,
    stillLooking: '仍在尋找，可以換一句話說或重試。',
    loadFailed: '推薦沒有載入，請再試一次。',
  },

  refinement: {
    label: '更新後的建議',
    show: '顯示',
  },

  tags: {
    understood: '已理解的條件',
    budgetUnder: (amount: string) => `${amount} 以下`,
    budgetFrom: (amount: string) => `${amount} 起`,
    /** The budget question's opt-out, whose value on the wire is `none`. */
    noLimit: '不限',
    forRecipient: (who: string) => `送給${who}`,
    forSomeoneElse: '送給別人',
    avoid: (thing: string) => `不要${thing}`,
  },

  items: {
    title: '為你挑的單品',
    failed: '單品沒有載入。',
    emptyTitle: '沒有單品同時符合所有條件。',
    emptyDescription: '可以放寬預算，或去掉一個必要條件。',
    save: '收藏',
    saved: '已收藏',
    notForMe: '不適合我',
    hidden: '已隱藏',
    signInToSave: '登入後可以保留你的收藏。',
    notSaved: '沒有儲存成功，請再試一次。',
  },

  outfits: {
    title: '整套穿搭',
    failed: '穿搭沒有載入。',
    emptyTitle: '這個預算內湊不出完整的一套。',
    emptyDescription: '下面的單品單獨看仍然合適。',
    one: '穿搭',
    totalOfBudget: (total: string, budget: string) => `${total}（預算 ${budget}）`,
    addAll: '全部加入購物袋',
    added: '已加入購物袋',
    askFriend: '問朋友',
    roles: {
      outer: '外套',
      tailoring: '西裝',
      top: '上衣',
      dress: '洋裝',
      bottom: '下身',
      shoes: '鞋',
      bag: '包款',
      accessory: '配件',
      jewelry: '珠寶',
      activewear: '運動服',
      swimwear: '泳裝',
    },
  },

  engine: {
    label: '引擎',
    sectionTitle: '引擎 · 這句話是怎麼被理解的',
    confidence: (percent: number) => `信心 ${percent}%`,
    confidenceOf: (percent: number) => `信心 ${percent}%`,
    assumptions: '假設',
    forYou: '給你自己',
    someoneElse: '其他人',
    forRecipient: (who: string) => `送給${who}`,
    forRecipientIn: (who: string, department: string) => `送給${who} · ${department}`,
    budgetUpTo: (amount: string) => `${amount} 以下`,
    budgetFrom: (amount: string) => `${amount} 起`,
    modes: {
      outfit: '整套穿搭',
      single: '單件',
      browse: '瀏覽',
    },
    slots: {
      mode: '模式',
      department: '客層',
      categories: '類別',
      colours: '顏色',
      aesthetics: '風格',
      materialsFit: '材質與版型',
      occasionSeason: '場合與季節',
      budget: '預算',
      recipient: '對象',
      sizes: '尺寸',
      mustHave: '必須有',
      mustAvoid: '必須避開',
      vibe: '氛圍',
    },
  },

  reasons: {
    style_similarity: '風格相符',
    attribute_match: '符合你的條件',
    budget_fit: '在預算內',
    user_preference: '接近你的喜好',
    social_signal: '朋友選過',
    trend_momentum: '正在流行',
    brand_affinity: '你常買的品牌',
    popularity_prior: '很受歡迎',
    diversity: '換個風格',
    compatibility: '容易搭配',
  },
}
