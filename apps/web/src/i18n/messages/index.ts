import type { Locale } from '../config'
import { en } from './en'
import { zhTW } from './zh-TW'

/**
 * Interface copy, one module per surface. A message is a string, or a function when a number or a
 * name belongs inside the sentence; both sides of a language boundary keep the same shape, so a
 * missing or renamed key is a type error rather than a blank on the page.
 *
 * Catalog nouns are not here — `@/i18n/taxonomy` reads those from the catalog's own labels.
 */
export type Messages = typeof en

export const CATALOGS: Record<Locale, Messages> = { en, 'zh-TW': zhTW }
