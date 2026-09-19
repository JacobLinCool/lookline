import type { FilterHintId } from '@lookline/engine/hints'

/**
 * Answer phrases for every filter hint. A choice is inserted into the sentence as the words a
 * person would have said, in the sentence's language — so these phrases follow the sentence, not
 * the interface locale. The question and the chip label are interface copy and live in
 * `shop.hints` under the same keys; the engine's questions decide which hint is open
 * (see `@lookline/engine/hints`).
 */

export interface HintChoice {
  /** Key into `shop.hints[id].choices` for the chip label. */
  key: string
  en: string
  zh: string
}

const c = (key: string, en: string, zh: string): HintChoice => ({ key, en, zh })

export const HINT_CHOICES: Record<FilterHintId, readonly HintChoice[]> = {
  recipient: [
    c('myself', 'for myself', '自己穿'),
    c('partner', 'for my partner', '送另一半'),
    c('mum', 'for my mum', '送媽媽'),
    c('dad', 'for my dad', '送爸爸'),
    c('kid', 'for a kid', '給小孩穿'),
  ],
  occasion: [
    c('work', 'for work', '上班穿'),
    c('wedding', 'for a wedding', '參加婚禮'),
    c('date', 'for a date night', '約會穿'),
    c('weekend', 'for the weekend', '週末穿'),
    c('travel', 'for a trip', '旅行穿'),
  ],
  formality: [
    c('casual', 'casual', '休閒'),
    c('smartCasual', 'smart casual', '半正式'),
    c('business', 'business wear', '商務'),
    c('formal', 'formal wear', '正式'),
  ],
  'wedding-role': [
    c('guest', 'as a wedding guest', '當賓客'),
    c('bridesmaid', 'as a bridesmaid', '當伴娘'),
    c('groomsman', 'as a groomsman', '當伴郎'),
    c('family', 'as family of the couple', '是新人的家人'),
  ],
  'office-type': [
    c('corporate', 'in a corporate office', '傳統辦公室'),
    c('creative', 'in a creative office', '創意產業'),
    c('client', 'meeting clients', '要見客戶'),
    c('hybrid', 'for hybrid office days', '混合辦公'),
  ],
  'trip-type': [
    c('city', 'a city trip', '城市旅行'),
    c('beach', 'a beach trip', '海島旅行'),
    c('mountains', 'a mountain trip', '上山'),
    c('cold', 'somewhere cold', '去很冷的地方'),
    c('flight', 'a long flight', '長途飛行'),
  ],
  activity: [
    c('gym', 'for the gym', '健身房'),
    c('running', 'for running', '跑步'),
    c('yoga', 'for yoga', '瑜珈'),
    c('hiking', 'for hiking', '登山'),
    c('swimming', 'for swimming', '游泳'),
  ],
  category: [
    c('outerwear', 'outerwear', '外套'),
    c('tops', 'a top', '上衣'),
    c('dresses', 'a dress', '洋裝'),
    c('bottoms', 'bottoms', '褲子或裙子'),
    c('shoes', 'shoes', '鞋子'),
    c('bags', 'a bag', '包包'),
  ],
  budget: [
    c('under1000', 'under NT$1000', '一千以內'),
    c('under3000', 'under NT$3000', '三千以內'),
    c('under8000', 'under NT$8000', '八千以內'),
    c('noLimit', 'no budget limit', '預算不限'),
  ],
  colour: [
    c('black', 'in black', '黑色'),
    c('white', 'in white', '白色'),
    c('navy', 'in navy', '海軍藍'),
    c('beige', 'in beige', '米色'),
    c('red', 'in red', '紅色'),
    c('green', 'in green', '綠色'),
  ],
  warmth: [
    c('light', 'a light layer', '薄的'),
    c('mid', 'mid-weight', '中等厚度'),
    c('heavy', 'a heavy coat', '厚外套'),
    c('rainproof', 'rainproof', '防風防水'),
  ],
  length: [
    c('mini', 'mini length', '短版'),
    c('midi', 'midi length', '中長版'),
    c('maxi', 'maxi length', '長版'),
  ],
  sleeve: [
    c('sleeveless', 'sleeveless', '無袖'),
    c('short', 'short sleeves', '短袖'),
    c('long', 'long sleeves', '長袖'),
  ],
  'trouser-cut': [
    c('straight', 'straight leg', '直筒'),
    c('wide', 'wide leg', '寬褲'),
    c('tapered', 'tapered', '錐形'),
    c('cropped', 'cropped', '九分'),
  ],
  heel: [
    c('flats', 'flats', '平底'),
    c('low', 'a low heel', '低跟'),
    c('high', 'a high heel', '高跟'),
    c('sneakers', 'sneakers', '球鞋'),
    c('boots', 'boots', '靴子'),
  ],
  'bag-size': [
    c('mini', 'a mini bag', '迷你包'),
    c('everyday', 'an everyday bag', '日常包'),
    c('tote', 'a tote', '托特包'),
    c('weekender', 'a weekender', '旅行包'),
  ],
  neckline: [
    c('crew', 'crew neck', '圓領'),
    c('vNeck', 'v-neck', 'V領'),
    c('collared', 'collared', '有領子'),
    c('offShoulder', 'off the shoulder', '露肩'),
  ],
  mood: [
    c('minimalist', 'minimalist style', '極簡風'),
    c('streetwear', 'streetwear style', '街頭風'),
    c('preppy', 'preppy style', '學院風'),
    c('romantic', 'romantic style', '浪漫風'),
    c('quietLuxury', 'quiet luxury style', '低調奢華風'),
    c('athleisure', 'athleisure style', '運動休閒風'),
  ],
  fit: [
    c('slim', 'slim fit', '合身'),
    c('regular', 'regular fit', '正常版型'),
    c('relaxed', 'relaxed fit', '寬鬆'),
    c('oversized', 'oversized', 'oversize'),
  ],
  season: [
    c('spring', 'for spring', '春天穿'),
    c('summer', 'for summer', '夏天穿'),
    c('autumn', 'for autumn', '秋天穿'),
    c('winter', 'for winter', '冬天穿'),
  ],
  'avoid-colour': [
    c('red', 'no red', '不要紅色'),
    c('black', 'no black', '不要黑色'),
    c('white', 'no white', '不要白色'),
    c('pink', 'no pink', '不要粉色'),
    c('yellow', 'no yellow', '不要黃色'),
  ],
  fabric: [
    c('cotton', 'in cotton', '棉質'),
    c('linen', 'in linen', '亞麻'),
    c('wool', 'in wool', '羊毛'),
    c('silk', 'in silk', '絲質'),
    c('denim', 'in denim', '丹寧'),
    c('leather', 'in leather', '皮革'),
  ],
  pattern: [
    c('solid', 'solid colour', '素色'),
    c('stripes', 'with stripes', '條紋'),
    c('checks', 'checked', '格紋'),
    c('floral', 'floral', '碎花'),
    c('prints', 'printed', '有印花'),
  ],
  order: [
    c('newest', 'newest first', '最新的優先'),
    c('popular', 'most popular first', '最熱門的優先'),
    c('trending', 'trending first', '最近流行的優先'),
    c('cheapest', 'cheapest first', '便宜的優先'),
  ],
  time: [
    c('day', 'for daytime', '白天穿'),
    c('evening', 'for the evening', '晚上穿'),
    c('both', 'day to night', '白天到晚上都能穿'),
  ],
  pair: [
    c('jeans', 'to go with jeans', '搭牛仔褲'),
    c('suit', 'to go with a suit', '搭西裝'),
    c('skirt', 'to go with a skirt', '搭裙子'),
    c('sneakers', 'to go with sneakers', '搭球鞋'),
    c('boots', 'to go with boots', '搭靴子'),
  ],
  care: [
    c('machineWash', 'machine washable', '可機洗'),
    c('wrinkleFree', 'wrinkle-free', '不易皺'),
    c('quickDry', 'quick-dry', '快乾'),
  ],
  statement: [
    c('statement', 'a statement piece', '亮眼的單品'),
    c('basic', 'an everyday basic', '百搭基本款'),
  ],
}

const CJK = /[㐀-䶿一-鿿豈-﫿]/gu

/** Phrases follow the sentence: Chinese once it is mostly CJK, otherwise English. */
export function hintLocale(sentence: string): 'en' | 'zh' {
  const cjk = sentence.match(CJK)?.length ?? 0
  const letters = sentence.replace(/[\s\d\p{P}]/gu, '').length
  return cjk > 0 && letters > 0 && cjk / letters >= 0.3 ? 'zh' : 'en'
}

/** The sentence with the chosen answer appended as its next clause. */
export function withChoice(sentence: string, choice: HintChoice): string {
  const locale = hintLocale(sentence)
  const phrase = locale === 'zh' ? choice.zh : choice.en
  const head = sentence.trim().replace(/[,，、;；\s]+$/u, '')
  if (!head) return phrase
  return locale === 'zh' ? `${head}，${phrase}` : `${head}, ${phrase}`
}

/** The first open hint the shopper has not skipped. */
export function nextHint(
  open: readonly FilterHintId[],
  skipped: ReadonlySet<FilterHintId>,
): FilterHintId | undefined {
  return open.find((id) => !skipped.has(id))
}
