'use client'

import { useEffect, useState } from 'react'
import { ImagePlus, UserPlus } from 'lucide-react'
import { Avatar, Button, Card, Field, Input, Select, Tag } from '@/components/ui'
import { InstantForm } from '@/components/latency/instant-form'
import {
  acceptPersonaAction,
  cancelPersonaOfferAction,
  createPersonaAction,
  offerPersonaAction,
  renamePersonaAction,
  setPersonaPhotoAction,
} from '@/server/actions/personas'

export interface PersonaRow {
  id: string
  displayName: string
  kind: 'person' | 'avatar'
  avatarSeed: number
  /** Whether a reference photograph is stored; the picture itself is never sent to the list. */
  hasPhoto: boolean
  /** What a transfer of this persona would carry with it. */
  cards: number
  copies: number
}

export interface OfferRow {
  id: string
  personaName: string
  counterparty: string
  expiresAt: string
  cards: number
  copies: number
}

/** "1 張個人卡、2 份收藏卡" — what moves, said before anyone commits to moving it. */
function carries(cards: number, copies: number): string {
  const parts: string[] = []
  if (cards > 0) parts.push(`${cards} 張個人卡`)
  if (copies > 0) parts.push(`${copies} 份收藏卡`)
  return parts.length > 0 ? parts.join('、') : '目前還沒有卡片'
}

/**
 * The photograph a card of this persona is rendered from. It is the subject reference the image
 * model is handed, so without one a card of your mother is a card of someone the model invented.
 *
 * The stored picture is fetched from `/api/personas/[id]/photo`, which answers only its manager —
 * the key is never public, and a card carries the rendered artwork rather than this.
 */
function PersonaPhotoField({
  personaId,
  hasPhoto,
  id,
}: {
  personaId: string
  hasPhoto: boolean
  id: string
}) {
  const [pickedUrl, setPickedUrl] = useState<string | null>(null)
  const [storedAvailable, setStoredAvailable] = useState(hasPhoto)

  // A blob URL outlives the element that made it; without this every re-pick leaks one.
  useEffect(() => {
    return () => {
      if (pickedUrl) URL.revokeObjectURL(pickedUrl)
    }
  }, [pickedUrl])

  const preview =
    pickedUrl ?? (storedAvailable ? `/api/personas/${personaId}/photo?v=${personaId}` : null)

  return (
    <div className="grid gap-3 sm:grid-cols-[5rem_1fr] sm:items-start">
      <div className="aspect-3/4 overflow-hidden rounded-md border border-line bg-mist">
        {preview ? (
          <img
            src={preview}
            alt="參考照片"
            className="size-full object-cover"
            onError={() => {
              if (!pickedUrl) setStoredAvailable(false)
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center px-2 text-center text-[11px] leading-snug text-muted">
            還沒有照片
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <input
          id={id}
          type="file"
          name="photo"
          accept="image/*"
          className="block w-full rounded-sm border border-line bg-card px-3 py-2 text-[13px] file:mr-3 file:rounded-xs file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[12px] file:text-paper"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null
            setPickedUrl(file ? URL.createObjectURL(file) : null)
          }}
        />
        <p className="text-[12px] text-muted">
          一張清楚的正面照最好。照片只用來生成這位 persona
          的小卡，不會公開。主角不是真人時，記得把「形象」設成虛擬。
        </p>
      </div>
    </div>
  )
}

function PersonaCard({ persona }: { persona: PersonaRow }) {
  const [mode, setMode] = useState<'idle' | 'rename' | 'transfer' | 'photo'>('idle')
  return (
    <Card as="li" padding="sm" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar seed={persona.avatarSeed} name={persona.displayName} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-medium">{persona.displayName}</span>
          <span className="text-[12px] text-muted">
            {persona.kind === 'avatar' ? '虛擬形象' : '真人'} ·{' '}
            {carries(persona.cards, persona.copies)}
          </span>
        </div>
        {/* Said on the card itself, because a persona with no photo is the difference between a
            card of this person and a card of someone the model made up. */}
        <Tag tone={persona.hasPhoto ? undefined : 'accent'}>
          {persona.hasPhoto ? '有參考照片' : '缺參考照片'}
        </Tag>
      </div>

      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setMode('rename')}>
            改名
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<ImagePlus />}
            onClick={() => setMode('photo')}
          >
            {persona.hasPhoto ? '換照片' : '上傳照片'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode('transfer')}>
            轉讓
          </Button>
          <Button size="sm" href={`/studio?persona=${persona.id}`}>
            用這位製卡
          </Button>
        </div>
      ) : null}

      {mode === 'photo' ? (
        <InstantForm
          action={setPersonaPhotoAction}
          name="set-persona-photo"
          confirmation="已更新"
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="personaId" value={persona.id} />
          <PersonaPhotoField
            personaId={persona.id}
            hasPhoto={persona.hasPhoto}
            id={`photo-${persona.id}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm">
              儲存照片
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode('idle')}>
              取消
            </Button>
            {persona.hasPhoto ? (
              <label className="ml-auto flex items-center gap-2 text-[12px] text-muted">
                <input type="checkbox" name="remove" className="size-4 accent-ink" />
                改成移除現有照片
              </label>
            ) : null}
          </div>
        </InstantForm>
      ) : null}

      {mode === 'rename' ? (
        <InstantForm
          action={renamePersonaAction}
          name="rename-persona"
          confirmation="已更新"
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="personaId" value={persona.id} />
          <div className="flex items-end gap-2">
            <Field label="名稱" htmlFor={`name-${persona.id}`} className="flex-1">
              <Input
                id={`name-${persona.id}`}
                name="displayName"
                defaultValue={persona.displayName}
              />
            </Field>
            {/* Editable here, not just at creation: this is what tells the image model whether
                the reference photo is of a person or of a toy, pet or character. */}
            <Field label="形象" htmlFor={`kind-${persona.id}`} className="w-28">
              <Select
                id={`kind-${persona.id}`}
                name="kind"
                defaultValue={persona.kind}
                options={[
                  { value: 'person', label: '真人' },
                  { value: 'avatar', label: '虛擬' },
                ]}
              />
            </Field>
            <Button type="submit" size="sm">
              儲存
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode('idle')}>
              取消
            </Button>
          </div>
          <p className="text-[12px] text-muted">
            主角不是真人（玩偶、寵物、動漫角色）時選「虛擬」，生成時才會照著照片畫那個角色，而不是換成一個人。
          </p>
        </InstantForm>
      ) : null}

      {mode === 'transfer' ? (
        <InstantForm
          action={offerPersonaAction}
          name="offer-persona"
          confirmation="已送出邀請"
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="personaId" value={persona.id} />
          <p className="text-[12px] text-muted">
            對方接受後，{carries(persona.cards, persona.copies)}會一起移交，而且是一次完成。
            你的購買紀錄、衣櫃與未用額度留在這個帳號。
          </p>
          <div className="flex items-end gap-2">
            <Field label="接收帳號" htmlFor={`to-${persona.id}`} className="flex-1">
              <Input id={`to-${persona.id}`} name="handle" placeholder="@handle" />
            </Field>
            <Button type="submit" size="sm">
              送出
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode('idle')}>
              取消
            </Button>
          </div>
        </InstantForm>
      ) : null}
    </Card>
  )
}

export function PersonaList({
  personas,
  incoming,
  outgoing,
}: {
  personas: PersonaRow[]
  incoming: OfferRow[]
  outgoing: OfferRow[]
}) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="flex flex-col gap-6">
      {incoming.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium">等你接受</h2>
          <ul className="flex flex-col gap-2">
            {incoming.map((o) => (
              <Card as="li" key={o.id} surface="panel" padding="sm" className="flex flex-col gap-2">
                <p className="text-[14px]">
                  <span className="font-medium">{o.counterparty}</span> 想把「{o.personaName}
                  」交給你
                </p>
                <p className="text-[12px] text-muted">會一起過來：{carries(o.cards, o.copies)}</p>
                <InstantForm
                  action={acceptPersonaAction}
                  name="accept-persona"
                  confirmation="已接受"
                >
                  <input type="hidden" name="transferId" value={o.id} />
                  <Button type="submit" size="sm">
                    接受
                  </Button>
                </InstantForm>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-medium">你管理的 persona</h2>
          <Button
            size="sm"
            variant="secondary"
            icon={<UserPlus />}
            onClick={() => setAdding(!adding)}
          >
            新增
          </Button>
        </div>

        {adding ? (
          <Card surface="panel" padding="sm">
            <InstantForm
              action={createPersonaAction}
              name="create-persona"
              confirmation="已建立"
              className="flex flex-col gap-3"
            >
              <div className="flex items-end gap-2">
                <Field label="名稱" htmlFor="new-persona-name" className="flex-1">
                  <Input id="new-persona-name" name="displayName" placeholder="媽媽" />
                </Field>
                <Field label="形象" htmlFor="new-persona-kind" className="w-28">
                  <Select
                    id="new-persona-kind"
                    name="kind"
                    defaultValue="person"
                    options={[
                      { value: 'person', label: '真人' },
                      { value: 'avatar', label: '虛擬' },
                    ]}
                  />
                </Field>
              </div>
              <Field label="參考照片（可稍後再加）" htmlFor="new-persona-photo">
                <PersonaPhotoField personaId="new" hasPhoto={false} id="new-persona-photo" />
              </Field>
              <Button type="submit" size="sm" className="self-start">
                建立
              </Button>
            </InstantForm>
          </Card>
        ) : null}

        <ul className="grid gap-3 sm:grid-cols-2">
          {personas.map((p) => (
            <PersonaCard key={p.id} persona={p} />
          ))}
        </ul>
      </section>

      {outgoing.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium">等對方接受</h2>
          <ul className="flex flex-col gap-2">
            {outgoing.map((o) => (
              <Card as="li" key={o.id} surface="panel" padding="sm" className="flex flex-col gap-2">
                <p className="text-[14px]">
                  「{o.personaName}」已送給 <span className="font-medium">{o.counterparty}</span>
                  <Tag className="ml-2">等待中</Tag>
                </p>
                <InstantForm
                  action={cancelPersonaOfferAction}
                  name="cancel-persona-offer"
                  confirmation="已收回"
                >
                  <input type="hidden" name="transferId" value={o.id} />
                  <Button type="submit" size="sm" variant="secondary">
                    收回
                  </Button>
                </InstantForm>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
