/**
 * Name pools for generated personas: a bilingual mix of Taiwanese names (Chinese characters,
 * Wade–Giles style romanisation, English nicknames) and international names.
 */
import type { Rng } from '@lookline/catalog'

export interface NamePick {
  displayName: string
  /** ASCII handle base (lower-case, dots), unique-ified by the caller. */
  handleBase: string
}

type TwName = readonly [zh: string, romanized: string]

const TW_SURNAMES: readonly TwName[] = [
  ['林', 'Lin'],
  ['陳', 'Chen'],
  ['黃', 'Huang'],
  ['張', 'Chang'],
  ['李', 'Lee'],
  ['王', 'Wang'],
  ['吳', 'Wu'],
  ['劉', 'Liu'],
  ['蔡', 'Tsai'],
  ['楊', 'Yang'],
  ['許', 'Hsu'],
  ['鄭', 'Cheng'],
  ['謝', 'Hsieh'],
  ['郭', 'Kuo'],
  ['洪', 'Hung'],
  ['曾', 'Tseng'],
  ['邱', 'Chiu'],
  ['廖', 'Liao'],
  ['賴', 'Lai'],
  ['周', 'Chou'],
  ['徐', 'Hsu'],
  ['蘇', 'Su'],
  ['葉', 'Yeh'],
  ['莊', 'Chuang'],
  ['呂', 'Lu'],
  ['江', 'Chiang'],
  ['何', 'Ho'],
  ['蕭', 'Hsiao'],
  ['羅', 'Lo'],
  ['高', 'Kao'],
]

const TW_GIVEN_F: readonly TwName[] = [
  ['佳穎', 'Chia-Ying'],
  ['怡君', 'Yi-Chun'],
  ['雅婷', 'Ya-Ting'],
  ['詩涵', 'Shih-Han'],
  ['欣怡', 'Hsin-Yi'],
  ['心妍', 'Hsin-Yen'],
  ['宜庭', 'Yi-Ting'],
  ['芷萱', 'Chih-Hsuan'],
  ['若瑜', 'Jo-Yu'],
  ['靜宜', 'Ching-Yi'],
  ['佩珊', 'Pei-Shan'],
  ['采潔', 'Tsai-Chieh'],
  ['語彤', 'Yu-Tung'],
  ['品妤', 'Pin-Yu'],
  ['思婷', 'Szu-Ting'],
  ['韻如', 'Yun-Ju'],
  ['家瑜', 'Chia-Yu'],
  ['惠雯', 'Hui-Wen'],
  ['曉婷', 'Hsiao-Ting'],
  ['庭瑄', 'Ting-Hsuan'],
  ['子晴', 'Tzu-Ching'],
  ['沛芸', 'Pei-Yun'],
  ['以柔', 'Yi-Jou'],
  ['書涵', 'Shu-Han'],
]

const TW_GIVEN_M: readonly TwName[] = [
  ['宇翔', 'Yu-Hsiang'],
  ['承恩', 'Cheng-En'],
  ['冠宇', 'Kuan-Yu'],
  ['柏翰', 'Po-Han'],
  ['建宏', 'Chien-Hung'],
  ['志豪', 'Chih-Hao'],
  ['俊傑', 'Chun-Chieh'],
  ['家豪', 'Chia-Hao'],
  ['冠廷', 'Kuan-Ting'],
  ['威廷', 'Wei-Ting'],
  ['立安', 'Li-An'],
  ['哲瑋', 'Che-Wei'],
  ['明軒', 'Ming-Hsuan'],
  ['子軒', 'Tzu-Hsuan'],
  ['宗翰', 'Tsung-Han'],
  ['品睿', 'Pin-Jui'],
  ['昱辰', 'Yu-Chen'],
  ['泓宇', 'Hung-Yu'],
  ['彥廷', 'Yen-Ting'],
  ['政宏', 'Cheng-Hung'],
  ['柏宇', 'Po-Yu'],
  ['睿哲', 'Jui-Che'],
  ['奕辰', 'Yi-Chen'],
  ['廷瑋', 'Ting-Wei'],
]

const TW_NICK_F = [
  'Vivian',
  'Amber',
  'Tina',
  'Joyce',
  'Cindy',
  'Ivy',
  'Wendy',
  'Peggy',
  'Claire',
  'Angela',
  'Sherry',
  'Fiona',
  'Doris',
  'Iris',
  'Jenny',
  'Kelly',
  'Nancy',
  'Sandy',
]
const TW_NICK_M = [
  'Kevin',
  'Jason',
  'Eric',
  'Andy',
  'Tony',
  'Vincent',
  'Ryan',
  'Alex',
  'Sam',
  'Peter',
  'Tim',
  'Allen',
  'Jerry',
  'Danny',
  'Wilson',
  'Henry',
  'Roger',
  'Brian',
]

interface IntlPool {
  given: readonly string[]
  surnames: readonly string[]
  /** Surname first (Japanese/Korean style is rendered given-first in English UI anyway). */
}

const INTL: readonly IntlPool[] = [
  {
    // Japanese
    given: ['Yuki', 'Haruto', 'Aoi', 'Ren', 'Sakura', 'Sora', 'Hinata', 'Riku', 'Mio', 'Kaito'],
    surnames: ['Tanaka', 'Sato', 'Suzuki', 'Kobayashi', 'Watanabe', 'Ito', 'Nakamura', 'Yamamoto'],
  },
  {
    // Korean
    given: ['Ji-woo', 'Min-jun', 'Seo-yeon', 'Ha-eun', 'Do-yun', 'Ye-jin', 'Ji-ho', 'Su-a'],
    surnames: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon', 'Lim'],
  },
  {
    // Western
    given: [
      'Emma',
      'Liam',
      'Olivia',
      'Noah',
      'Sofia',
      'Lucas',
      'Mia',
      'Ethan',
      'Chloe',
      'Mateo',
      'Ava',
      'Oscar',
      'Lena',
      'Felix',
      'Nora',
      'Jonas',
    ],
    surnames: [
      'Johnson',
      'Brown',
      'Garcia',
      'Martin',
      'Rossi',
      'Müller',
      'Dubois',
      'Clark',
      'Bernard',
      'López',
      'Novak',
      'Schmidt',
      'Andersen',
      'Silva',
    ],
  },
  {
    // South / South-East Asian
    given: ['Priya', 'Arjun', 'Ananya', 'Rohan', 'Putri', 'Arif', 'Lan', 'Minh', 'Aisyah', 'Dev'],
    surnames: ['Sharma', 'Mehta', 'Rao', 'Iyer', 'Sari', 'Rahman', 'Nguyen', 'Tran', 'Abdullah'],
  },
]

const at = <T>(list: readonly T[], u: number): T => list[Math.floor(u * list.length)]!

export function asciiHandle(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

/** Draws exactly five rng values so persona streams stay aligned. */
export function pickName(rng: Rng, gender: 'f' | 'm'): NamePick {
  const taiwanese = rng.chance(0.6)
  const styleU = rng.next()
  const i1 = rng.next()
  const i2 = rng.next()
  const i3 = rng.next()
  if (taiwanese) {
    const surname = at(TW_SURNAMES, i1)
    const given = at(gender === 'f' ? TW_GIVEN_F : TW_GIVEN_M, i2)
    if (styleU < 0.35) {
      return {
        displayName: `${surname[0]}${given[0]}`,
        handleBase: asciiHandle(`${given[1]}.${surname[1]}`),
      }
    }
    if (styleU < 0.65) {
      return {
        displayName: `${given[1]} ${surname[1]}`,
        handleBase: asciiHandle(`${given[1]}.${surname[1]}`),
      }
    }
    const nick = at(gender === 'f' ? TW_NICK_F : TW_NICK_M, i3)
    return {
      displayName: `${nick} ${surname[1]}`,
      handleBase: asciiHandle(`${nick}.${surname[1]}`),
    }
  }
  const pool = at(INTL, i1)
  const given = at(pool.given, i2)
  const surname = at(pool.surnames, i3)
  return { displayName: `${given} ${surname}`, handleBase: asciiHandle(`${given}.${surname}`) }
}
