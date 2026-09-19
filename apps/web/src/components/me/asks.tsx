import type { Ask, User } from '@lookline/db'
import Link from 'next/link'
import { Avatar, Tag } from '@/components/ui'
import { getI18n } from '@/i18n/server'
import { formatRelative } from '@/server/format'

export interface SentAsk {
  ask: Ask
  responses: number
}

export interface ReceivedAsk {
  ask: Ask
  asker: Pick<User, 'displayName' | 'handle' | 'avatarSeed'>
}

function StatusTag({ status, labels }: { status: Ask['status']; labels: Record<string, string> }) {
  if (status === 'open') return <Tag tone="accent">{labels.open}</Tag>
  return <Tag tone="outline">{status === 'answered' ? labels.answered : labels.closed}</Tag>
}

const linkClass =
  'text-[12px] text-muted underline decoration-line underline-offset-4 hover:text-ink'

/** Asks you sent (with reply counts) and asks addressed to you. */
export async function AsksPanel({ sent, received }: { sent: SentAsk[]; received: ReceivedAsk[] }) {
  const { t, locale } = await getI18n()
  return (
    <div className="grid gap-8 md:grid-cols-2 [&>div]:min-w-0">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium">{t.me.asks.youAsked}</p>
        {sent.length === 0 ? (
          <p className="text-[13px] text-muted">{t.me.asks.nothingYet}</p>
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
                    <span>{t.me.asks.kinds[ask.kind]}</span>
                    <span>·</span>
                    <span className="tabular">{t.common.count.replies(responses)}</span>
                    <span>·</span>
                    <span>{formatRelative(ask.createdAt, locale)}</span>
                    <StatusTag status={ask.status} labels={t.me.asks.status} />
                  </div>
                </div>
                <Link href={`/a/${ask.shareToken}`} className={linkClass}>
                  {t.me.asks.card}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium">{t.me.asks.askedOfYou}</p>
        {received.length === 0 ? (
          <p className="text-[13px] text-muted">{t.me.asks.nothingYet}</p>
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
                        {asker.displayName} · {t.me.asks.kinds[ask.kind]}
                      </span>
                      <span>·</span>
                      <span>{formatRelative(ask.createdAt, locale)}</span>
                      <StatusTag status={ask.status} labels={t.me.asks.status} />
                    </div>
                  </div>
                </div>
                <Link href={`/a/${ask.shareToken}`} className={linkClass}>
                  {t.me.asks.answer}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
