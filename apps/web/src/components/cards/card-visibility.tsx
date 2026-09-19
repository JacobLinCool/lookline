'use client'
import { useI18n } from '@/i18n/client'
import { InstantForm } from '@/components/latency/instant-form'
import { Button } from '@/components/ui'
import { cardVisibilityAction } from '@/server/actions/discovery'

export function CardVisibility({
  id,
  visibility,
}: {
  id: string
  visibility: 'private' | 'link' | 'public'
}) {
  const { t } = useI18n()
  const c = t.home.discovery
  return (
    <InstantForm
      action={cardVisibilityAction}
      confirmation={c.saved}
      name="card-visibility"
      className="flex flex-col gap-3"
    >
      <input name="id" type="hidden" value={id} />
      <label className="flex flex-col gap-2 text-[13px]">
        {c.cardVisibility}
        <select
          name="visibility"
          defaultValue={visibility}
          className="h-11 rounded-sm border bg-card px-3"
        >
          <option value="private">{c.private}</option>
          <option value="link">{c.link}</option>
          <option value="public">{c.public}</option>
        </select>
      </label>
      <Button type="submit" variant="secondary" className="self-start">
        {c.save}
      </Button>
    </InstantForm>
  )
}
