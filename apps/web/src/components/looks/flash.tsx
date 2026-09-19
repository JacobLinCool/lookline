import { Notice } from '@/components/ui'

const NOTICES: Record<string, string> = {
  reacted: 'Liked.',
  added: 'Added to your bag.',
  regenerated: 'Image updated.',
  visibility: 'Visibility updated.',
}

/** Renders `?notice=<key>` as a success Notice and `?error=<text>` as a warning Notice. */
export function Flash({
  notice,
  error,
  className,
}: {
  notice?: string | string[]
  error?: string | string[]
  className?: string
}) {
  const noticeKey = Array.isArray(notice) ? notice[0] : notice
  const errorText = Array.isArray(error) ? error[0] : error
  const known = noticeKey ? NOTICES[noticeKey] : undefined
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
