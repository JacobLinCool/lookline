import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Look } from '@lookline/db'
import { cn } from '@/lib/cn'
import { Avatar } from './avatar'
import { LineageText } from './lineage-text'

export type LookCardLook = Pick<Look, 'id' | 'title' | 'stylePreset'> &
  Partial<Pick<Look, 'kind' | 'createdAt' | 'depth' | 'imagePath'>>

export interface LookCardOwner {
  displayName: string
  handle: string
  avatarSeed: number
}

/** Lineage hint rendered under the owner, e.g. `{ kind: 'remix', handle: 'alice' }`. */
export type LookLineageHint = { kind: 'remix' | 'together' | 'inspired'; handle: string } | string

export interface LookCardProps {
  look: LookCardLook
  owner: LookCardOwner
  lineage?: LookLineageHint
  /** @deprecated Preset names are not shown on cards. */
  presetLabel?: string
  /** Defaults to `/looks/[id]`. */
  href?: string
  /** Something drawn over the image's top-right corner. */
  overlay?: ReactNode
  /** Slot at the bottom: reactions, product count, actions. */
  footer?: ReactNode
  /** Hide the owner row (when every card on the rail has the same owner). */
  hideOwner?: boolean
  priority?: boolean
  className?: string
}

/** A Look on the rail: the image, its name, who made it. */
export function LookCard({
  look,
  owner,
  lineage,
  href = `/looks/${look.id}`,
  overlay,
  footer,
  hideOwner,
  priority,
  className,
}: LookCardProps) {
  const version = look.imagePath ? encodeURIComponent(look.imagePath) : 'composition'
  return (
    <article className={cn('group flex flex-col gap-2.5', className)}>
      <div className="relative">
        <Link
          href={href}
          className="tile-lift block overflow-hidden rounded-md bg-mist"
          aria-label={look.title}
        >
          <div className="aspect-3/4">
            <img
              src={`/api/looks/${look.id}/image?v=${version}`}
              alt={look.title}
              width={600}
              height={800}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              className="size-full object-cover"
            />
          </div>
        </Link>
        {overlay ? <div className="absolute top-2 right-2">{overlay}</div> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <h3 className="line-clamp-2 text-[14px] leading-snug font-medium">
          <Link href={href} className="hover:underline underline-offset-4">
            {look.title}
          </Link>
        </h3>
        {!hideOwner || lineage ? (
          <div className="flex items-center gap-1.5 text-[12px] text-muted">
            {!hideOwner ? (
              <>
                <Avatar seed={owner.avatarSeed} name={owner.displayName} size={18} />
                <span className="truncate">{owner.displayName}</span>
              </>
            ) : null}
            {lineage ? (
              <span className="truncate">
                {!hideOwner ? '· ' : ''}
                <LineageText hint={lineage} />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {footer ? <div className="px-0.5">{footer}</div> : null}
    </article>
  )
}
