import type { Ask, User } from '@lookline/db'
import Link from 'next/link'
import { Avatar, Tag } from '@/components/ui'
import { formatRelative, pluralize } from '@/server/format'

export interface SentAsk {
  ask: Ask
  responses: number
}

export interface ReceivedAsk {
  ask: Ask
  asker: Pick<User, 'displayName' | 'handle' | 'avatarSeed'>
}

const KIND_LABEL: Record<Ask['kind'], string> = {
  choose: 'Which one?',
  style_me: 'Style me',
}

function StatusTag({ status }: { status: Ask['status'] }) {
  if (status === 'open') return <Tag tone="accent">Open</Tag>
  return <Tag tone="outline">{status === 'answered' ? 'Answered' : 'Closed'}</Tag>
}

const linkClass =
  'text-[12px] text-muted underline decoration-line underline-offset-4 hover:text-ink'

/** Asks you sent (with reply counts) and asks addressed to you. */
export function AsksPanel({ sent, received }: { sent: SentAsk[]; received: ReceivedAsk[] }) {
  return (
    <div className="grid gap-8 md:grid-cols-2 [&>div]:min-w-0">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium">You asked</p>
        {sent.length === 0 ? (
          <p className="text-[13px] text-muted">Nothing yet</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {sent.map(({ ask, responses }) => (
              <li key={ask.id} className="flex min-w-0 items-start justify-between gap-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    href={`/asks/${ask.id}`}
                    className="block truncate text-[14px] hover:underline"
                  >
                    {ask.question}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                    <span>{KIND_LABEL[ask.kind]}</span>
                    <span>·</span>
                    <span className="tabular">{pluralize(responses, 'reply', 'replies')}</span>
                    <span>·</span>
                    <span>{formatRelative(ask.createdAt)}</span>
                    <StatusTag status={ask.status} />
                  </div>
                </div>
                <Link href={`/a/${ask.shareToken}`} className={linkClass}>
                  Card
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium">Asked of you</p>
        {received.length === 0 ? (
          <p className="text-[13px] text-muted">Nothing yet</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {received.map(({ ask, asker }) => (
              <li key={ask.id} className="flex min-w-0 items-start justify-between gap-4 py-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Avatar seed={asker.avatarSeed} name={asker.displayName} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={`/a/${ask.shareToken}`}
                      className="block truncate text-[14px] hover:underline"
                    >
                      {ask.question}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                      <span>
                        {asker.displayName} · {KIND_LABEL[ask.kind]}
                      </span>
                      <span>·</span>
                      <span>{formatRelative(ask.createdAt)}</span>
                      <StatusTag status={ask.status} />
                    </div>
                  </div>
                </div>
                <Link href={`/a/${ask.shareToken}`} className={linkClass}>
                  Answer
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
