'use client'

import { useId, useState } from 'react'
import type { CardArtDirection, CardArtFocus, CardArtPose, CardArtScene } from '@lookline/db'
import { CARD_ART_NOTE_MAX } from '@lookline/engine/cards/art-direction'
import { cn } from '@/lib/cn'

const FOCUS: ReadonlyArray<{ value: CardArtFocus; label: string }> = [
  { value: 'auto', label: '自動判斷' },
  { value: 'silhouette', label: '輪廓比例' },
  { value: 'layering', label: '層次搭配' },
  { value: 'fabric-motion', label: '材質動態' },
  { value: 'pattern-detail', label: '圖案細節' },
  { value: 'accessories', label: '配件重點' },
]

const POSES: ReadonlyArray<{ value: CardArtPose; label: string }> = [
  { value: 'auto', label: '自動變化' },
  { value: 'standing', label: '自信站姿' },
  { value: 'walking', label: '自然走動' },
  { value: 'turn', label: '轉身側面' },
  { value: 'seated', label: '編輯坐姿' },
  { value: 'dynamic', label: '動態姿勢' },
  { value: 'custom', label: '自訂' },
]

const SCENES: ReadonlyArray<{ value: CardArtScene; label: string }> = [
  { value: 'auto', label: '自動變化' },
  { value: 'studio', label: '極簡棚拍' },
  { value: 'street', label: '城市街頭' },
  { value: 'architecture', label: '建築空間' },
  { value: 'interior', label: '生活室內' },
  { value: 'nature', label: '自然戶外' },
  { value: 'stage', label: '戲劇舞台' },
  { value: 'custom', label: '自訂' },
]

export const CARD_ART_LABELS = {
  focus: Object.fromEntries(FOCUS.map((option) => [option.value, option.label])) as Record<
    CardArtFocus,
    string
  >,
  pose: Object.fromEntries(POSES.map((option) => [option.value, option.label])) as Record<
    CardArtPose,
    string
  >,
  scene: Object.fromEntries(SCENES.map((option) => [option.value, option.label])) as Record<
    CardArtScene,
    string
  >,
}

const DEFAULT_DIRECTION: CardArtDirection = {
  focus: 'auto',
  pose: 'auto',
  scene: 'auto',
  note: null,
}

function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string
  name: string
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-[13px] font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'cursor-pointer rounded-md border px-2.5 py-2 text-[13px] transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink',
              value === option.value
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-card hover:border-ink',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function CardArtDirectionFields({
  initial = DEFAULT_DIRECTION,
  title = '這張怎麼拍',
  compact = false,
}: {
  initial?: CardArtDirection
  title?: string
  compact?: boolean
}) {
  const hintId = useId()
  const [focus, setFocus] = useState<CardArtFocus>(initial.focus)
  const [pose, setPose] = useState<CardArtPose>(initial.pose)
  const [scene, setScene] = useState<CardArtScene>(initial.scene)
  const custom = pose === 'custom' || scene === 'custom'

  return (
    <section
      className={cn(
        'flex flex-col gap-4 border-y border-line py-4',
        compact && 'w-full lg:min-w-[42rem]',
      )}
      aria-describedby={hintId}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p id={hintId} className="text-[12px] text-muted">
          每次生成只套用這裡目前的選擇。
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChoiceGroup
          legend="想凸顯"
          name="artFocus"
          options={FOCUS}
          value={focus}
          onChange={setFocus}
        />
        <ChoiceGroup legend="姿勢" name="artPose" options={POSES} value={pose} onChange={setPose} />
        <ChoiceGroup
          legend="場景"
          name="artScene"
          options={SCENES}
          value={scene}
          onChange={setScene}
        />
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        補充一句{custom ? '（自訂時必填）' : '（選填）'}
        <textarea
          name="artNote"
          defaultValue={initial.note ?? ''}
          maxLength={CARD_ART_NOTE_MAX}
          required={custom}
          rows={2}
          placeholder="例如：外套下擺要有風感，背景保留大片留白"
          className="w-full resize-y rounded-md border border-line bg-card px-3 py-2 text-[14px] leading-5 outline-none transition-colors placeholder:text-muted focus:border-ink focus:ring-2 focus:ring-ink/15"
        />
      </label>
    </section>
  )
}
