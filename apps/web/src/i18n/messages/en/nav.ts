/** The shell: top bar, phone tabs, footer and the language switcher. */
export const nav = {
  find: 'Find',
  shop: 'Shop',
  studio: 'Studio',
  wardrobe: 'Wardrobe',
  bag: 'Bag',
  primary: 'Primary',
  secondary: 'Secondary',
  bagWithCount: (n: number) => `Bag, ${n} ${n === 1 ? 'item' : 'items'}`,
  profileOf: (name: string) => `${name}, signed in`,

  tagline: 'Meichu Hackathon 2026 × Makalot · Prototype',
  trends: 'Trends for Makalot',
  lab: 'Engine lab',
  engineView: 'Engine view',

  language: 'Language',
}

export type NavMessages = typeof nav
