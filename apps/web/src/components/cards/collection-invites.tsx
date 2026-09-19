'use client'

import { useState } from 'react'
import { Avatar, Button, Card, Select, Tag } from '@/components/ui'
import { InstantForm } from '@/components/latency/instant-form'
import { inviteMemberAction, respondToInviteAction } from '@/server/actions/collections'

export interface InvitablePersona {
  personaId: string
  personaName: string
  ownerName: string
}

export interface PendingInvite {
  collectionId: string
  collectionTitle: string
  personaId: string
  personaName: string
  avatarSeed: number
  invitedBy: string
  /** That persona's issued cards; the invitee picks which one to bring. */
  cards: Array<{ cardId: string; code: string }>
}

/** The owner's side: ask a friend's persona to take part. No card is chosen here. */
export function InviteMember({
  collectionId,
  personas,
}: {
  collectionId: string
  personas: InvitablePersona[]
}) {
  if (personas.length === 0) return null
  return (
    <InstantForm
      action={inviteMemberAction}
      name="invite-member"
      confirmation="已送出邀請"
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="collectionId" value={collectionId} />
      <Select
        name="personaId"
        size="sm"
        aria-label="邀請哪位 persona"
        options={personas.map((p) => ({
          value: p.personaId,
          label: `${p.personaName} · ${p.ownerName}`,
        }))}
      />
      <Button type="submit" size="sm" variant="secondary">
        邀請加入
      </Button>
      <p className="w-full text-[12px] text-muted">
        對方同意後才會加入，並由對方自己決定要出哪一張卡。
      </p>
    </InstantForm>
  )
}

/** The invitee's side: join with a card of their own choosing, or decline. */
export function InviteInbox({ invites }: { invites: PendingInvite[] }) {
  if (invites.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-medium">邀請你加入</h2>
      <ul className="flex flex-col gap-2">
        {invites.map((invite) => (
          <InviteRow key={`${invite.collectionId}-${invite.personaId}`} invite={invite} />
        ))}
      </ul>
    </section>
  )
}

function InviteRow({ invite }: { invite: PendingInvite }) {
  const [cardId, setCardId] = useState(invite.cards[0]?.cardId ?? '')
  return (
    <Card as="li" surface="panel" padding="sm" className="flex flex-col gap-2">
      <span className="flex items-center gap-2">
        <Avatar seed={invite.avatarSeed} name={invite.personaName} size="xs" />
        <span className="text-[13px]">
          {invite.invitedBy} 邀請 <span className="font-semibold">{invite.personaName}</span> 加入
          「{invite.collectionTitle}」
        </span>
      </span>
      {invite.cards.length === 0 ? (
        <p className="text-[12px] text-muted">這位 persona 還沒有已發行的卡，先做一張才能加入。</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            size="sm"
            aria-label="要出哪一張卡"
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            options={invite.cards.map((c) => ({ value: c.cardId, label: c.code }))}
          />
          <InstantForm action={respondToInviteAction} name="invite-accept" confirmation="已加入">
            <input type="hidden" name="collectionId" value={invite.collectionId} />
            <input type="hidden" name="personaId" value={invite.personaId} />
            <input type="hidden" name="cardId" value={cardId} />
            <input type="hidden" name="accept" value="yes" />
            <Button type="submit" size="sm">
              加入
            </Button>
          </InstantForm>
          <InstantForm action={respondToInviteAction} name="invite-decline" confirmation="已婉拒">
            <input type="hidden" name="collectionId" value={invite.collectionId} />
            <input type="hidden" name="personaId" value={invite.personaId} />
            <input type="hidden" name="accept" value="no" />
            <Button type="submit" size="sm" variant="secondary">
              婉拒
            </Button>
          </InstantForm>
          <Tag>你管理</Tag>
        </div>
      )}
    </Card>
  )
}
