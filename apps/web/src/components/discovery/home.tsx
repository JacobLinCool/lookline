'use client'
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type {
  FriendActivity,
  HomeProduct,
  PreferenceRail,
  SearchingRail,
} from '@lookline/engine/discovery'
import { Button, ProductCard } from '@/components/ui'
import { CardFace } from '@/components/cards/card-face'
import { useI18n } from '@/i18n/client'
import { aestheticLabel, colorFamilyLabel } from '@/i18n/taxonomy'
import { DiscoveryRail } from './rail'

function useSection<T>(section: string, enabled = true) {
  const [state, setState] = useState<{ data?: T; error: boolean; loading: boolean }>({
    loading: enabled,
    error: false,
  })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void fetch(`/api/discovery/${section}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unavailable')
        return response.json() as Promise<T>
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ loading: false, error: true })
      })
    return () => controller.abort()
  }, [section, revision, enabled])
  // On back navigation, refresh access-sensitive activity and the most recent visit.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        setState({ loading: enabled, error: false })
        setRevision((value) => value + 1)
      }
    }
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled])
  return {
    ...state,
    retry: () => {
      setState({ loading: true, error: false })
      setRevision((value) => value + 1)
    },
  }
}
const itemClass = 'w-[168px] shrink-0 snap-start md:w-[208px]'
function Products({ items }: { items: HomeProduct[] }) {
  return items.map((item) => (
    <div className={itemClass} key={item.id}>
      <ProductCard product={item} />
    </div>
  ))
}
function Placeholder() {
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} aria-hidden className={itemClass}>
          <div className="aspect-[3/4] rounded-md bg-mist" />
          <div className="mt-3 h-4 w-3/4 rounded-xs bg-mist" />
        </div>
      ))}
    </>
  )
}
function Empty({ children, href, action }: { children: ReactNode; href: string; action: string }) {
  return (
    <div className="flex w-full flex-col items-start justify-center gap-4 rounded-md bg-mist px-6">
      <p className="text-[14px] text-muted">{children}</p>
      <Button href={href} variant="secondary">
        {action}
      </Button>
    </div>
  )
}

export function DiscoveryHome({ signedIn }: { signedIn: boolean }) {
  const { t, locale } = useI18n()
  const copy = t.home.discovery
  const hot = useSection<HomeProduct[]>('trending')
  const searching = useSection<SearchingRail>('searching')
  const taste = useSection<PreferenceRail[]>('preferences', signedIn)
  const history = useSection<HomeProduct[]>('recent', signedIn)
  const friends = useSection<{ friendCount: number; items: FriendActivity[] }>('friends', signedIn)
  const failed = (retry: () => void) => (
    <div
      className="flex w-full flex-col items-start justify-center gap-4 rounded-md bg-mist px-6"
      role="status"
    >
      <p>{copy.failed}</p>
      <Button variant="secondary" onClick={retry}>
        {t.common.retry}
      </Button>
    </div>
  )
  const signin = (
    <Empty href="/login" action={t.common.signIn}>
      {copy.signIn}
    </Empty>
  )
  return (
    <div className="mt-8 flex min-w-0 flex-col gap-8 pb-8 md:gap-10">
      <DiscoveryRail
        compactHeader
        title={copy.trending}
        description={copy.trendingReason}
        busy={hot.loading}
      >
        {hot.data?.length ? (
          <Products items={hot.data} />
        ) : hot.loading ? (
          <Placeholder />
        ) : hot.error ? (
          failed(hot.retry)
        ) : (
          <Empty href="/shop" action={copy.browse}>
            {copy.noProducts}
          </Empty>
        )}
      </DiscoveryRail>
      {/*
        Absent until an operator puts a trend on the page, and silent when it fails: an empty row
        would be a hole where a shopper has nothing to do. The label and sentence are the model's
        abstract reading — the trending term that produced them never reaches the storefront.
      */}
      {searching.data?.items.length ? (
        <DiscoveryRail
          title={copy.searching(searching.data.label)}
          description={searching.data.rationale || undefined}
          busy={false}
        >
          <Products items={searching.data.items} />
        </DiscoveryRail>
      ) : null}
      {[0, 1].map((index) => {
        const group = taste.data?.[index]
        const label = group
          ? group.kind === 'aesthetic'
            ? aestheticLabel(locale, group.value)
            : colorFamilyLabel(locale, group.value)
          : ''
        return (
          <DiscoveryRail
            key={index}
            title={
              group
                ? copy.preferenceTitle(label)
                : index === 0
                  ? copy.forYou
                  : copy.anotherPreference
            }
            description={group ? copy.preferenceReason(label) : undefined}
            busy={taste.loading}
          >
            {!signedIn ? (
              signin
            ) : group?.items.length ? (
              <Products items={group.items} />
            ) : taste.loading ? (
              <Placeholder />
            ) : taste.error ? (
              failed(taste.retry)
            ) : (
              <Empty href="/shop" action={copy.browse}>
                {copy.learning}
              </Empty>
            )}
          </DiscoveryRail>
        )
      })}
      <DiscoveryRail title={copy.recent} description={copy.recentReason} busy={history.loading}>
        {!signedIn ? (
          signin
        ) : history.data?.length ? (
          <Products items={history.data} />
        ) : history.loading ? (
          <Placeholder />
        ) : history.error ? (
          failed(history.retry)
        ) : (
          <Empty href="/shop" action={copy.browse}>
            {copy.noHistory}
          </Empty>
        )}
      </DiscoveryRail>
      <DiscoveryRail title={copy.friends} description={copy.friendsReason} busy={friends.loading}>
        {!signedIn ? (
          signin
        ) : friends.data?.items.length ? (
          friends.data.items.map((item) => (
            <div className={itemClass} key={`${item.kind}:${item.id}`}>
              {item.kind === 'purchase' ? (
                <ProductCard product={item.product} reason={copy.bought(item.person)} />
              ) : (
                <article className="flex flex-col gap-2.5">
                  {/* The title and the code are printed on the card itself; what the rail adds
                      is the one thing the card does not say — whose it is. */}
                  <Link
                    href={`/cards/${item.id}`}
                    className="block tile-lift"
                    aria-label={item.title}
                  >
                    <CardFace
                      imageUrl={`/api/cards/${item.id}`}
                      personaName={item.title}
                      verificationCode={item.code}
                    />
                  </Link>
                  <p className="text-[12px] text-muted">{copy.made(item.person)}</p>
                </article>
              )}
            </div>
          ))
        ) : friends.loading ? (
          <Placeholder />
        ) : friends.error ? (
          failed(friends.retry)
        ) : (
          <Empty href="/me/friends" action={copy.manageFriends}>
            {friends.data?.friendCount ? copy.noActivity : copy.noFriends}
          </Empty>
        )}
      </DiscoveryRail>
      {/* Only when the rail has something in it. Its empty state already offers the same link,
          and an empty rail was showing "管理好友" twice, one above the other. */}
      {signedIn && friends.data?.items.length ? (
        <Button href="/me/friends" variant="link" className="self-start">
          {copy.manageFriends}
        </Button>
      ) : null}
    </div>
  )
}
