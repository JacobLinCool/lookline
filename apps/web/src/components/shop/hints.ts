import type { FilterHintId } from '@lookline/engine/hints'

/**
 * Question copy and answer phrases for every filter hint. A choice is inserted into the sentence
 * as the words a person would have said, in the sentence's language; the engine's questions decide
 * which hint is open (see `@lookline/engine/hints`).
 */

export interface HintChoice {
  label: string
  en: string
  zh: string
}

export interface HintCopy {
  question: string
  choices: readonly HintChoice[]
}

const c = (label: string, en: string, zh: string): HintChoice => ({ label, en, zh })

export const HINT_COPY: Record<FilterHintId, HintCopy> = {
  recipient: {
    question: 'Who is it for?',
    choices: [
      c('Myself', 'for myself', '自己穿'),
      c('My partner', 'for my partner', '送另一半'),
      c('My mum', 'for my mum', '送媽媽'),
      c('My dad', 'for my dad', '送爸爸'),
      c('A kid', 'for a kid', '給小孩穿'),
    ],
  },
  occasion: {
    question: 'What is the occasion?',
    choices: [
      c('Work', 'for work', '上班穿'),
      c('Wedding', 'for a wedding', '參加婚禮'),
      c('Date night', 'for a date night', '約會穿'),
      c('Weekend', 'for the weekend', '週末穿'),
      c('Travel', 'for a trip', '旅行穿'),
    ],
  },
  formality: {
    question: 'How dressed-up?',
    choices: [
      c('Casual', 'casual', '休閒'),
      c('Smart casual', 'smart casual', '半正式'),
      c('Business', 'business wear', '商務'),
      c('Formal', 'formal wear', '正式'),
    ],
  },
  'wedding-role': {
    question: 'Your role at the wedding?',
    choices: [
      c('Guest', 'as a wedding guest', '當賓客'),
      c('Bridesmaid', 'as a bridesmaid', '當伴娘'),
      c('Groomsman', 'as a groomsman', '當伴郎'),
      c('Family', 'as family of the couple', '是新人的家人'),
    ],
  },
  'office-type': {
    question: 'What kind of office?',
    choices: [
      c('Corporate', 'in a corporate office', '傳統辦公室'),
      c('Creative', 'in a creative office', '創意產業'),
      c('Client-facing', 'meeting clients', '要見客戶'),
      c('Hybrid', 'for hybrid office days', '混合辦公'),
    ],
  },
  'trip-type': {
    question: 'Where to?',
    choices: [
      c('City break', 'a city trip', '城市旅行'),
      c('Beach', 'a beach trip', '海島旅行'),
      c('Mountains', 'a mountain trip', '上山'),
      c('Somewhere cold', 'somewhere cold', '去很冷的地方'),
      c('Long flight', 'a long flight', '長途飛行'),
    ],
  },
  activity: {
    question: 'Which activity?',
    choices: [
      c('Gym', 'for the gym', '健身房'),
      c('Running', 'for running', '跑步'),
      c('Yoga', 'for yoga', '瑜珈'),
      c('Hiking', 'for hiking', '登山'),
      c('Swimming', 'for swimming', '游泳'),
    ],
  },
  category: {
    question: 'What kind of piece?',
    choices: [
      c('Outerwear', 'outerwear', '外套'),
      c('Tops', 'a top', '上衣'),
      c('Dresses', 'a dress', '洋裝'),
      c('Bottoms', 'bottoms', '褲子或裙子'),
      c('Shoes', 'shoes', '鞋子'),
      c('Bags', 'a bag', '包包'),
    ],
  },
  budget: {
    question: 'Budget?',
    choices: [
      c('Under NT$1,000', 'under NT$1000', '一千以內'),
      c('Under NT$3,000', 'under NT$3000', '三千以內'),
      c('Under NT$8,000', 'under NT$8000', '八千以內'),
      c('No limit', 'no budget limit', '預算不限'),
    ],
  },
  colour: {
    question: 'Any colour in mind?',
    choices: [
      c('Black', 'in black', '黑色'),
      c('White', 'in white', '白色'),
      c('Navy', 'in navy', '海軍藍'),
      c('Beige', 'in beige', '米色'),
      c('Red', 'in red', '紅色'),
      c('Green', 'in green', '綠色'),
    ],
  },
  warmth: {
    question: 'How warm?',
    choices: [
      c('Light layer', 'a light layer', '薄的'),
      c('Mid-weight', 'mid-weight', '中等厚度'),
      c('Heavy coat', 'a heavy coat', '厚外套'),
      c('Rainproof', 'rainproof', '防風防水'),
    ],
  },
  length: {
    question: 'Which length?',
    choices: [
      c('Mini', 'mini length', '短版'),
      c('Midi', 'midi length', '中長版'),
      c('Maxi', 'maxi length', '長版'),
    ],
  },
  sleeve: {
    question: 'Sleeve length?',
    choices: [
      c('Sleeveless', 'sleeveless', '無袖'),
      c('Short', 'short sleeves', '短袖'),
      c('Long', 'long sleeves', '長袖'),
    ],
  },
  'trouser-cut': {
    question: 'Trouser cut?',
    choices: [
      c('Straight', 'straight leg', '直筒'),
      c('Wide-leg', 'wide leg', '寬褲'),
      c('Tapered', 'tapered', '錐形'),
      c('Cropped', 'cropped', '九分'),
    ],
  },
  heel: {
    question: 'Heel or flat?',
    choices: [
      c('Flats', 'flats', '平底'),
      c('Low heel', 'a low heel', '低跟'),
      c('High heel', 'a high heel', '高跟'),
      c('Sneakers', 'sneakers', '球鞋'),
      c('Boots', 'boots', '靴子'),
    ],
  },
  'bag-size': {
    question: 'Bag size?',
    choices: [
      c('Mini', 'a mini bag', '迷你包'),
      c('Everyday', 'an everyday bag', '日常包'),
      c('Tote', 'a tote', '托特包'),
      c('Weekender', 'a weekender', '旅行包'),
    ],
  },
  neckline: {
    question: 'Neckline?',
    choices: [
      c('Crew', 'crew neck', '圓領'),
      c('V-neck', 'v-neck', 'V領'),
      c('Collared', 'collared', '有領子'),
      c('Off-shoulder', 'off the shoulder', '露肩'),
    ],
  },
  mood: {
    question: 'Which mood?',
    choices: [
      c('Minimalist', 'minimalist style', '極簡風'),
      c('Streetwear', 'streetwear style', '街頭風'),
      c('Preppy', 'preppy style', '學院風'),
      c('Romantic', 'romantic style', '浪漫風'),
      c('Quiet luxury', 'quiet luxury style', '低調奢華風'),
      c('Athleisure', 'athleisure style', '運動休閒風'),
    ],
  },
  fit: {
    question: 'How should it fit?',
    choices: [
      c('Slim', 'slim fit', '合身'),
      c('Regular', 'regular fit', '正常版型'),
      c('Relaxed', 'relaxed fit', '寬鬆'),
      c('Oversized', 'oversized', 'oversize'),
    ],
  },
  season: {
    question: 'Which season?',
    choices: [
      c('Spring', 'for spring', '春天穿'),
      c('Summer', 'for summer', '夏天穿'),
      c('Autumn', 'for autumn', '秋天穿'),
      c('Winter', 'for winter', '冬天穿'),
    ],
  },
  'avoid-colour': {
    question: 'Any colour to avoid?',
    choices: [
      c('No red', 'no red', '不要紅色'),
      c('No black', 'no black', '不要黑色'),
      c('No white', 'no white', '不要白色'),
      c('No pink', 'no pink', '不要粉色'),
      c('No yellow', 'no yellow', '不要黃色'),
    ],
  },
  fabric: {
    question: 'Fabric?',
    choices: [
      c('Cotton', 'in cotton', '棉質'),
      c('Linen', 'in linen', '亞麻'),
      c('Wool', 'in wool', '羊毛'),
      c('Silk', 'in silk', '絲質'),
      c('Denim', 'in denim', '丹寧'),
      c('Leather', 'in leather', '皮革'),
    ],
  },
  pattern: {
    question: 'Solid or pattern?',
    choices: [
      c('Solid', 'solid colour', '素色'),
      c('Stripes', 'with stripes', '條紋'),
      c('Checks', 'checked', '格紋'),
      c('Floral', 'floral', '碎花'),
      c('Prints', 'printed', '有印花'),
    ],
  },
  order: {
    question: 'What first?',
    choices: [
      c('Newest', 'newest first', '最新的優先'),
      c('Most popular', 'most popular first', '最熱門的優先'),
      c('Trending', 'trending first', '最近流行的優先'),
      c('Cheapest', 'cheapest first', '便宜的優先'),
    ],
  },
  time: {
    question: 'Day or night?',
    choices: [
      c('Daytime', 'for daytime', '白天穿'),
      c('Evening', 'for the evening', '晚上穿'),
      c('Both', 'day to night', '白天到晚上都能穿'),
    ],
  },
  pair: {
    question: 'Pair with something you own?',
    choices: [
      c('Jeans', 'to go with jeans', '搭牛仔褲'),
      c('A suit', 'to go with a suit', '搭西裝'),
      c('A skirt', 'to go with a skirt', '搭裙子'),
      c('Sneakers', 'to go with sneakers', '搭球鞋'),
      c('Boots', 'to go with boots', '搭靴子'),
    ],
  },
  care: {
    question: 'Easy care?',
    choices: [
      c('Machine washable', 'machine washable', '可機洗'),
      c('Wrinkle-free', 'wrinkle-free', '不易皺'),
      c('Quick-dry', 'quick-dry', '快乾'),
    ],
  },
  statement: {
    question: 'Statement or basic?',
    choices: [
      c('A statement piece', 'a statement piece', '亮眼的單品'),
      c('An everyday basic', 'an everyday basic', '百搭基本款'),
    ],
  },
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
