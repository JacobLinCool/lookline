import type { NavMessages } from '../en/nav'

export const nav: NavMessages = {
  find: '尋找',
  shop: '選購',
  wardrobe: '衣櫥',
  bag: '購物袋',
  primary: '主要導覽',
  secondary: '次要導覽',
  bagWithCount: (n: number) => `購物袋，${n} 件`,
  profileOf: (name: string) => `${name}，已登入`,

  tagline: '梅竹黑客松 2026 × 聚陽 · 原型',
  trends: '聚陽趨勢',
  tour: '原型導覽',
  lab: '引擎實驗室',
  engineView: '引擎檢視',

  language: '語言',
}
