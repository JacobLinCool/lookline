import Link from 'next/link'
import type { Preview } from '@lookline/db'
import { EmptyState, Tag } from '@/components/ui'
import { getI18n } from '@/i18n/server'

export type PreviewListItem = Pick<
  Preview,
  'id' | 'title' | 'imagePath' | 'imageStatus' | 'expiresAt'
>

/** Active private previews, kept visually separate from collectible Looks and owned pieces. */
export async function PreviewGrid({ items }: { items: PreviewListItem[] }) {
  const { t, locale } = await getI18n()
  if (items.length === 0)
    return <EmptyState title={t.me.previews.empty} description={t.me.previews.emptyDescription} />

  const formatter = new Intl.DateTimeFormat(locale === 'zh-TW' ? 'zh-Hant-TW' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const status = {
    pending: t.me.previews.status.preparing,
    ready: t.me.previews.status.ready,
    failed: t.me.previews.status.failed,
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 lg:grid-cols-4">
      {items.map((preview, index) => (
        <li key={preview.id}>
          <Link href={`/previews/${preview.id}`} className="group flex flex-col gap-2.5">
            <div className="relative aspect-3/4 overflow-hidden rounded-md bg-mist">
              <img
                src={`/api/previews/${preview.id}/image?v=${encodeURIComponent(preview.imagePath ?? 'composition')}`}
                alt={preview.title}
                width={450}
                height={600}
                loading={index < 4 ? 'eager' : 'lazy'}
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
              />
              <span className="absolute top-2 left-2">
                <Tag tone={preview.imageStatus === 'failed' ? 'accent' : 'neutral'}>
                  {status[preview.imageStatus]}
                </Tag>
              </span>
            </div>
            <div className="flex flex-col gap-0.5 px-0.5">
              <h3 className="line-clamp-2 text-[14px] leading-snug font-medium group-hover:underline group-hover:underline-offset-4">
                {preview.title}
              </h3>
              <p className="text-[12px] text-muted">
                {t.me.previews.expires(formatter.format(preview.expiresAt))}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
