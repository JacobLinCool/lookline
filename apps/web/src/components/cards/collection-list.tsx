import Link from 'next/link'
import { Card, Tag } from '@/components/ui'

export interface CollectionRow {
  id: string
  title: string
  members: string[]
}

export function CollectionList({ rows }: { rows: CollectionRow[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-medium">你的收藏</h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <Card as="li" key={r.id} surface="panel" padding="sm">
            <Link href={`/collections/${r.id}`} className="flex items-center justify-between gap-3">
              <span className="truncate text-[14px] font-medium">{r.title}</span>
              <span className="flex flex-wrap gap-1">
                {r.members.map((m) => (
                  <Tag key={m}>{m}</Tag>
                ))}
              </span>
            </Link>
          </Card>
        ))}
      </ul>
    </section>
  )
}
