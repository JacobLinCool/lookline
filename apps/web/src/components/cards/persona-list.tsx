'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Avatar, Button, Card, Field, Input, Select, Tag } from '@/components/ui'
import { InstantForm } from '@/components/latency/instant-form'
import {
  acceptPersonaAction,
  cancelPersonaOfferAction,
  createPersonaAction,
  offerPersonaAction,
  renamePersonaAction,
} from '@/server/actions/personas'

export interface PersonaRow {
  id: string
  displayName: string
  kind: 'person' | 'avatar'
  avatarSeed: number
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

function PersonaCard({ persona }: { persona: PersonaRow }) {
  const [mode, setMode] = useState<'idle' | 'rename' | 'transfer'>('idle')
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
      </div>

      {mode === 'idle' ? (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setMode('rename')}>
            改名
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode('transfer')}>
            轉讓
          </Button>
          <Button size="sm" href={`/studio?persona=${persona.id}`}>
            用這位製卡
          </Button>
        </div>
      ) : null}

      {mode === 'rename' ? (
        <InstantForm
          action={renamePersonaAction}
          name="rename-persona"
          confirmation="已更新"
          className="flex items-end gap-2"
        >
          <input type="hidden" name="personaId" value={persona.id} />
          <Field label="名稱" htmlFor={`name-${persona.id}`} className="flex-1">
            <Input
              id={`name-${persona.id}`}
              name="displayName"
              defaultValue={persona.displayName}
            />
          </Field>
          <Button type="submit" size="sm">
            儲存
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode('idle')}>
            取消
          </Button>
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
              className="flex items-end gap-2"
            >
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
              <Button type="submit" size="sm">
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
