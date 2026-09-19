/**
 * Lookline speaks English and Traditional Chinese. Server components read the language with
 * `getI18n()` from `@/i18n/server`; client components read it with `useI18n()` from
 * `@/i18n/client`. Catalog nouns come from `@/i18n/taxonomy`, never from a translated copy.
 */
export {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_NAMES,
  LOCALE_TAGS,
  localeFromTag,
  matchLocale,
  type Locale,
} from './config'
export type { Messages } from './messages'
