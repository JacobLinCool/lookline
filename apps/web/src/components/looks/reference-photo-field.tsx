'use client'

import { useEffect, useState } from 'react'
import { Field } from '@/components/ui'

interface PhotoLabels {
  field: string
  hint: string
  previewAlt: string
  empty: string
  selected: string
  generated: string
  newPhoto: (name: string) => string
  remember: string
  useSaved: string
}

export function ReferencePhotoField({
  hasSavedPhoto,
  labels,
}: {
  hasSavedPhoto: boolean
  labels: PhotoLabels
}) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [useSavedPhoto, setUseSavedPhoto] = useState(hasSavedPhoto)
  const [savedPhotoAvailable, setSavedPhotoAvailable] = useState(hasSavedPhoto)

  useEffect(() => {
    return () => {
      if (selectedUrl) URL.revokeObjectURL(selectedUrl)
    }
  }, [selectedUrl])

  const previewUrl = selectedUrl ?? (useSavedPhoto && savedPhotoAvailable ? '/api/me/photo' : null)

  return (
    <Field label={labels.field} htmlFor="photo" hint={labels.hint}>
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr] sm:items-start">
        <div className="aspect-3/4 overflow-hidden rounded-md border border-line bg-mist">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={labels.previewAlt}
              className="size-full object-cover"
              onError={() => {
                if (!selectedUrl) setSavedPhotoAvailable(false)
              }}
            />
          ) : (
            <div className="flex size-full items-center justify-center px-2 text-center text-[11px] leading-snug text-muted">
              {labels.empty}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <input
            id="photo"
            type="file"
            name="photo"
            accept="image/*"
            className="block w-full rounded-sm border border-line bg-card px-3 py-2 text-[13px] file:mr-3 file:rounded-xs file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[12px] file:text-paper"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null
              setSelectedUrl(file ? URL.createObjectURL(file) : null)
              setSelectedName(file?.name ?? null)
            }}
          />
          <p className="truncate text-[12px] text-muted">
            {selectedName
              ? labels.newPhoto(selectedName)
              : previewUrl
                ? labels.selected
                : labels.generated}
          </p>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              name="rememberPhoto"
              defaultChecked
              className="size-4 accent-ink"
            />
            {labels.remember}
          </label>
          {hasSavedPhoto ? (
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                name="useSavedPhoto"
                checked={useSavedPhoto}
                onChange={(event) => setUseSavedPhoto(event.currentTarget.checked)}
                className="size-4 accent-ink"
              />
              {labels.useSaved}
            </label>
          ) : null}
        </div>
      </div>
    </Field>
  )
}
