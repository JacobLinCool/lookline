'use client'

import { useI18n } from '@/i18n/client'
import { colorNameLabel } from '@/i18n/taxonomy'

/**
 * The colour a piece is sold in, in the reader's language. A client island so the shared product
 * card needs no locale prop on every rail that renders one.
 */
export function ColorName({ value }: { value: string }) {
  const { locale } = useI18n()
  return colorNameLabel(locale, value)
}
