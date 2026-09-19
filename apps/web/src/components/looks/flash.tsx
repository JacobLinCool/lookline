import { Notice } from '@/components/ui'
import { getI18n } from '@/i18n/server'

/** Renders `?notice=<key>` as a success Notice and `?error=<text>` as a warning Notice. */
export async function Flash({
  notice,
  error,
  className,
}: {
  notice?: string | string[]
  error?: string | string[]
  className?: string
}) {
  const { t } = await getI18n()
  const notices: Record<string, string> = t.looks.flash
  const noticeKey = Array.isArray(notice) ? notice[0] : notice
  const errorText = Array.isArray(error) ? error[0] : error
  const known = noticeKey ? notices[noticeKey] : undefined
  if (!known && !errorText) return null
  return (
    <div className={className}>
      {errorText ? <Notice tone="warning">{errorText}</Notice> : null}
      {known ? (
        <Notice tone="success" title={known} className={errorText ? 'mt-3' : undefined} />
      ) : null}
    </div>
  )
}
