'use client'

import { useEffect, useState } from 'react'
import { SubmitButton } from '@/components/looks/submit-button'
import { updateProfilePhotoAction } from '@/server/actions/profile'

interface SavedPhotoLabels {
  currentAlt: string
  empty: string
  hint: string
  save: string
  saving: string
}

export function SavedPhotoForm({
  hasPhoto,
  labels,
}: {
  hasPhoto: boolean
  labels: SavedPhotoLabels
}) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (selectedUrl) URL.revokeObjectURL(selectedUrl)
    },
    [selectedUrl],
  )

  const previewUrl = selectedUrl ?? (hasPhoto ? '/api/me/photo' : null)
  return (
    <form
      action={updateProfilePhotoAction}
      encType="multipart/form-data"
      className="grid gap-5 rounded-md border border-line bg-card p-4 sm:grid-cols-[7rem_1fr] sm:items-start sm:p-5"
    >
      <div className="aspect-3/4 overflow-hidden rounded-md border border-line bg-mist">
        {previewUrl ? (
          <img src={previewUrl} alt={labels.currentAlt} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center px-3 text-center text-[12px] leading-snug text-muted">
            {labels.empty}
          </div>
        )}
      </div>
      <div className="flex flex-col items-start gap-3">
        <p className="text-[13px] leading-relaxed text-muted">{labels.hint}</p>
        <input
          type="file"
          name="photo"
          accept="image/png,image/jpeg,image/webp"
          required
          className="block w-full rounded-sm border border-line bg-paper px-3 py-2 text-[13px] file:mr-3 file:rounded-xs file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[12px] file:text-paper"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            setSelectedUrl(file ? URL.createObjectURL(file) : null)
          }}
        />
        <SubmitButton variant="secondary" pendingLabel={labels.saving}>
          {labels.save}
        </SubmitButton>
      </div>
    </form>
  )
}
