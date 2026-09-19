import { activitySharing, eq } from '@lookline/db'
import { friendList } from '@lookline/engine/discovery'
import { Button, Container, Input } from '@/components/ui'
import { InstantForm } from '@/components/latency/instant-form'
import { getI18n } from '@/i18n/server'
import { requireUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { friendAction } from '@/server/actions/discovery'

export default async function FriendsPage() {
  const user = await requireUser()
  const { t } = await getI18n()
  const c = t.home.discovery
  const { db } = getDb()
  const [friends, settings] = await Promise.all([
    friendList(db, user.id),
    db.select().from(activitySharing).where(eq(activitySharing.userId, user.id)).limit(1),
  ])
  return (
    <Container size="narrow" className="flex flex-col gap-8 py-8">
      <h1 className="display text-[28px]">{c.friendTitle}</h1>
      <InstantForm
        action={friendAction}
        name="friend-invite"
        confirmation={c.pending}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="action" value="invite" />
        <label className="flex flex-col gap-2">
          {c.handle}
          <Input name="handle" required maxLength={100} autoComplete="off" placeholder="@handle" />
        </label>
        <Button type="submit" className="self-start">
          {c.invite}
        </Button>
      </InstantForm>
      <InstantForm
        action={friendAction}
        name="purchase-sharing"
        confirmation={c.saved}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="action" value="sharing" />
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            name="purchases"
            defaultChecked={settings[0]?.purchases ?? false}
            className="size-5"
          />
          {c.sharePurchases}
        </label>
        <Button type="submit" variant="secondary" className="self-start">
          {c.save}
        </Button>
      </InstantForm>
      <ul className="flex flex-col divide-y divide-line">
        {friends.map((friend) => (
          <li key={friend.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium">{friend.name}</p>
              <p className="text-[13px] text-muted">
                @{friend.handle}
                {friend.state === 'pending' && friend.requestedBy === user.id
                  ? ` · ${c.pending}`
                  : ''}
              </p>
            </div>
            <div className="flex gap-2">
              {friend.state === 'pending' && friend.requestedBy !== user.id ? (
                <InstantForm action={friendAction} name="friend-accept" confirmation={c.saved}>
                  <input type="hidden" name="other" value={friend.id} />
                  <input type="hidden" name="action" value="accept" />
                  <Button type="submit" size="sm">
                    {c.accept}
                  </Button>
                </InstantForm>
              ) : null}
              <InstantForm action={friendAction} name="friend-remove" confirmation={c.saved}>
                <input type="hidden" name="other" value={friend.id} />
                <input type="hidden" name="action" value="remove" />
                <Button type="submit" variant="secondary" size="sm">
                  {c.remove}
                </Button>
              </InstantForm>
            </div>
          </li>
        ))}
      </ul>
      <Button href="/" variant="secondary" className="self-start">
        {t.common.back}
      </Button>
    </Container>
  )
}
