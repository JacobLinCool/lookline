/**
 * The day scheduler: a pure function of (personas, graph, seed, days, now) that lays out every
 * simulated event over the window — browsing, purchases (20 % gifts), editions, shares (with
 * the friend's remix decision rising with taste similarity), Asks and their answers, Together
 * editions — plus the four planted trend seeds (remix chains of depth ≥ 4 crossing ≥ 3 clusters
 * in the last two weeks, so their velocity is still rising on the last day). Ids are assigned here so the executor can run events in parallel.
 */
import { aestheticIndex, createRng, hashSeed } from '@lookline/catalog'
import { tasteSimilarity } from './taste'
import type {
  Friend,
  GiftTarget,
  Persona,
  PlannedEvent,
  PlannedEventBody,
  PlannedEventKind,
  SimPlan,
  SocialGraph,
  TrendSeed,
} from './types'
import { pickOccasion, pickPreset } from './vocab'

export const DAY_MS = 86_400_000
export const DEFAULT_DAYS = 60

/** Planted trend seeds: aesthetic, origin cluster and the clusters of the successive hops. */
export const TREND_SEEDS: readonly TrendSeed[] = [
  {
    slug: 'gorp-goes-downtown',
    aesthetic: 'gorpcore',
    originCluster: 2, // gorp-hikers
    hops: [18, 10, 14, 3, 1], // city-boy → athleisure → workwear → k-minimal → ximending
    carrierHandle: 'jacob',
    day: 46,
  },
  {
    slug: 'coquette-everywhere',
    aesthetic: 'coquette',
    originCluster: 13, // ballet-coquette
    hops: [4, 11, 8, 21, 0], // romantic → y2k → clean-girl → k-street → quiet-lux
    carrierHandle: 'hana',
    day: 47,
  },
  {
    slug: 'mob-wife-winter',
    aesthetic: 'mob-wife',
    originCluster: 6, // glam-nights
    hops: [0, 20, 11, 9, 15], // quiet-lux → western → retro → goth → avant-garde
    carrierHandle: 'aria',
    day: 48,
  },
  {
    slug: 'western-revival',
    aesthetic: 'western',
    originCluster: 20, // western-riders
    hops: [14, 11, 18, 2, 6], // workwear → retro → city-boy → gorp → glam
    carrierHandle: null,
    day: 49,
  },
]

export interface PlanConfig {
  seed: number
  now: Date
  days?: number
  trendSeeds?: readonly TrendSeed[]
}

const KINDS: readonly PlannedEventKind[] = [
  'browse',
  'purchase',
  'edition',
  'share',
  'ask',
  'answer',
  'together',
  'remix',
  'engage',
]

export function emptyCounts(): Record<PlannedEventKind, number> {
  return Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<PlannedEventKind, number>
}

export function eventTime(now: Date, days: number, day: number, t: number): Date {
  return new Date(now.getTime() - (days - 1 - day + (1 - t)) * DAY_MS)
}

/** Remix probability of a friend seeing a Look: propensity scaled by taste similarity. */
export function remixProbability(remixPropensity: number, similarity: number): number {
  const s = Math.max(0, Math.min(1, similarity))
  return Math.max(0, Math.min(1, remixPropensity * (0.1 + 0.9 * s * s)))
}

const GIFT_FALLBACK: ReadonlyArray<readonly [string, GiftTarget['department']]> = [
  ['for a friend', 'unisex'],
  ['for my partner', 'women'],
  ['for my partner', 'men'],
  ['for my kid', 'kids'],
]

interface Pending {
  kind: PlannedEventKind
  day: number
  t: number
  gen: number
  body: PlannedEventBody
  locks: string[]
}

interface PersonaState {
  lastPurchaseDay: number
  lastLookDay: number
  purchases: number
  looks: string[]
  /** Looks seen through shares: [lookId, ownerId, day]. */
  seen: Array<[string, string, number]>
}

class Counters {
  purchase = 0
  look = 0
  ask = 0
  next(prefix: 'pu' | 'lk' | 'ask'): string {
    const n = prefix === 'pu' ? ++this.purchase : prefix === 'lk' ? ++this.look : ++this.ask
    return `${prefix}_${String(n).padStart(6, '0')}`
  }
}

const affinity = (p: Persona, aesthetic: string): number => {
  const i = aestheticIndex(aesthetic)
  return i >= 0 ? (p.hiddenVector[i] ?? 0) : 0
}

export function planSimulation(
  personas: readonly Persona[],
  graph: SocialGraph,
  config: PlanConfig,
): SimPlan {
  const days = config.days ?? DEFAULT_DAYS
  const seeds = config.trendSeeds ?? TREND_SEEDS
  const byId = new Map(personas.map((p) => [p.id, p]))
  const byHandle = new Map(personas.map((p) => [p.handle, p]))
  const state = new Map<string, PersonaState>()
  for (const p of personas)
    state.set(p.id, { lastPurchaseDay: -99, lastLookDay: -99, purchases: 0, looks: [], seen: [] })
  const lookOwner = new Map<string, string>()
  const counters = new Counters()
  const pending: Pending[] = []
  let gen = 0
  const push = (
    day: number,
    t: number,
    body: Pending['body'],
    locks: readonly (string | null | undefined)[],
  ): void => {
    if (day < 0 || day >= days) return
    const lockSet = [...new Set(locks.filter((x): x is string => !!x))].toSorted()
    pending.push({
      kind: body.kind,
      day,
      t: Math.min(0.999, Math.max(0, t)),
      gen: gen++,
      body,
      locks: lockSet,
    })
  }
  const friendsOf = (id: string): readonly Friend[] => graph.friends.get(id) ?? []
  const closeFriends = (p: Persona): readonly Friend[] =>
    friendsOf(p.id).slice(0, Math.max(1, p.params.shareRadius))
  const newLook = (owner: string): string => {
    const id = counters.next('lk')
    lookOwner.set(id, owner)
    return id
  }
  const registerLook = (owner: string, id: string): void => {
    state.get(owner)?.looks.push(id)
  }

  // Demo personas: guaranteed purchase / edition days so every demo profile is rich.
  const forcedPurchaseDays = new Set([4, 12, 21, 33, 45, 55])
  const forcedEditionDays = new Set([5, 22, 46])

  // -----------------------------------------------------------------------
  // 1. daily loop
  // -----------------------------------------------------------------------
  for (let day = 0; day < days; day++) {
    const weekday = eventTime(config.now, days, day, 0.5).getUTCDay()
    const weekendFactor = weekday === 0 || weekday === 6 ? 1.15 : 1
    for (const p of personas) {
      const rng = createRng(hashSeed(config.seed, 'day', day, p.id))
      const st = state.get(p.id)!
      const forced = p.isPersona && (forcedPurchaseDays.has(day) || forcedEditionDays.has(day))
      const active = forced || rng.chance(Math.min(0.97, p.params.activity * weekendFactor))
      if (!active) continue
      const t0 = rng.float(0.28, 0.96)
      const delta = 0.003
      let step = 0
      const nextT = (): number => t0 + delta * step++

      // browse
      if (rng.chance(0.3)) {
        push(
          day,
          nextT(),
          {
            kind: 'browse',
            userId: p.id,
            occasion: pickOccasion(rng, p.archetype),
            forGift: p.giftHiddenVector !== null && rng.chance(0.25),
          },
          [p.id],
        )
      }

      // purchase
      const pBuy = 0.11 + 0.13 * p.params.activity
      if ((p.isPersona && forcedPurchaseDays.has(day)) || rng.chance(pBuy)) {
        let gift: GiftTarget | null = null
        let forKind: 'self' | 'other' | 'undisclosed' = 'self'
        if (p.giftHiddenVector && p.giftLabel && p.giftDepartment && rng.chance(0.55)) {
          const friend =
            rng.chance(0.3) && friendsOf(p.id).length > 0 ? rng.pick(friendsOf(p.id)) : null
          const friendPersona = friend ? byId.get(friend.id) : undefined
          gift = {
            label: friendPersona ? friendPersona.displayName : p.giftLabel,
            forUserId: friendPersona ? friendPersona.id : null,
            department: friendPersona ? friendPersona.department : p.giftDepartment,
          }
          forKind = 'other'
        } else if (!p.giftHiddenVector && rng.chance(0.08)) {
          const [label, department] = rng.pick(GIFT_FALLBACK)
          gift = { label, forUserId: null, department }
          forKind = 'other'
        } else if (rng.chance(0.08)) {
          forKind = 'undisclosed'
        }
        const seenBefore = st.seen.filter(([, , d]) => d < day)
        const source =
          forKind === 'self' && seenBefore.length > 0 && rng.chance(0.35)
            ? seenBefore[seenBefore.length - 1]!
            : null
        push(
          day,
          nextT(),
          {
            kind: 'purchase',
            userId: p.id,
            purchaseId: counters.next('pu'),
            gift,
            forKind,
            sourceLookId: source ? source[0] : null,
            occasion: rng.chance(0.5) ? pickOccasion(rng, p.archetype) : null,
            aesthetic: null,
          },
          [p.id, gift?.forUserId, source ? source[1] : null],
        )
        st.lastPurchaseDay = day
        st.purchases += 1
      }

      // edition from recent purchases (at most one every few days)
      const recentPurchase = day - st.lastPurchaseDay <= 14
      const restedSinceLook = day - st.lastLookDay >= 4
      const pEdition = st.looks.length === 0 ? 0.3 : 0.12
      if (
        recentPurchase &&
        ((p.isPersona && forcedEditionDays.has(day)) || (restedSinceLook && rng.chance(pEdition)))
      ) {
        const lookId = newLook(p.id)
        push(
          day,
          nextT(),
          {
            kind: 'edition',
            userId: p.id,
            lookId,
            preset: pickPreset(rng, p.archetype),
            occasion: rng.chance(0.6) ? pickOccasion(rng, p.archetype) : null,
            seedAesthetic: null,
          },
          [p.id],
        )
        registerLook(p.id, lookId)
        st.lastLookDay = day
      }

      // share the latest Look to close friends
      if (st.looks.length > 0 && rng.chance(0.18)) {
        const lookId = st.looks[st.looks.length - 1]!
        const targets = rng.shuffle(closeFriends(p)).slice(0, rng.chance(0.4) ? 2 : 1)
        for (const f of targets) {
          const friend = byId.get(f.id)
          if (!friend) continue
          const sim = tasteSimilarity(friend.hiddenVector, p.hiddenVector)
          const remix = rng.chance(remixProbability(friend.params.remixPropensity, sim))
          const remixLookId = remix ? newLook(friend.id) : `lk_none`
          push(
            day,
            nextT(),
            {
              kind: 'share',
              userId: p.id,
              friendId: friend.id,
              lookId,
              react: rng.chance(0.6),
              remix,
              remixLookId,
              remixPreset: pickPreset(rng, friend.archetype),
              remixPurchaseId: remix && rng.chance(0.5) ? counters.next('pu') : null,
            },
            [p.id, friend.id],
          )
          state.get(friend.id)!.seen.push([lookId, p.id, day])
          if (remix) registerLook(friend.id, remixLookId)
        }
      }

      // ask a friend
      if (friendsOf(p.id).length > 0 && rng.chance(p.params.askPropensity * 0.12)) {
        const friend = byId.get(rng.pick(closeFriends(p)).id)
        if (friend) {
          const askId = counters.next('ask')
          const askKind: 'choose' | 'style_me' = rng.chance(0.65) ? 'choose' : 'style_me'
          const occasion = pickOccasion(rng, p.archetype)
          push(
            day,
            nextT(),
            {
              kind: 'ask',
              userId: p.id,
              friendId: friend.id,
              askId,
              askKind,
              occasion,
              budget: p.budgetHint,
              lookId: null,
            },
            [p.id, friend.id],
          )
          if (rng.chance(0.85)) {
            const delay = rng.weighted([
              [0, 5],
              [1, 3.5],
              [2, 1.5],
            ] as const)
            const styled = askKind === 'style_me' && rng.chance(0.8) ? newLook(friend.id) : null
            push(
              day + delay,
              delay === 0 ? nextT() : rng.float(0.3, 0.95),
              {
                kind: 'answer',
                askId,
                userId: friend.id,
                askerId: p.id,
                purchaseId: askKind === 'choose' && rng.chance(0.4) ? counters.next('pu') : null,
                styledLookId: styled,
                styledPreset: pickPreset(rng, friend.archetype),
              },
              [p.id, friend.id],
            )
            if (styled && day + delay < days) registerLook(friend.id, styled)
          }
        }
      }

      // together edition with 1–2 friends who have Looks
      if (st.looks.length > 0 && rng.chance(0.012)) {
        const withLooks = closeFriends(p).filter((f) => (state.get(f.id)?.looks.length ?? 0) > 0)
        if (withLooks.length > 0) {
          const mates = rng.shuffle(withLooks).slice(0, rng.chance(0.35) ? 2 : 1)
          const lookId = newLook(p.id)
          push(
            day,
            nextT(),
            {
              kind: 'together',
              userId: p.id,
              lookId,
              participantIds: mates.map((m) => m.id),
              occasion: pickOccasion(rng, p.archetype),
              preset: pickPreset(rng, p.archetype),
            },
            [p.id, ...mates.map((m) => m.id)],
          )
          registerLook(p.id, lookId)
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // 2. planted trend seeds
  // -----------------------------------------------------------------------
  const seedResults: SimPlan['trendSeeds'] = []
  const used = new Set<string>()
  const members = (cluster: number): Persona[] =>
    personas.filter((p) => p.socialCluster === cluster)
  const bestMember = (
    cluster: number,
    aesthetic: string,
    prefer: readonly string[],
    exclude: ReadonlySet<string>,
  ): Persona | null => {
    const list = members(cluster).filter((p) => !exclude.has(p.id))
    if (list.length === 0) return null
    const preferred = list.filter((p) => prefer.includes(p.id))
    const pool = preferred.length > 0 ? preferred : list
    return pool.toSorted(
      (a, b) =>
        affinity(b, aesthetic) - affinity(a, aesthetic) ||
        b.params.activity - a.params.activity ||
        (a.id < b.id ? -1 : 1),
    )[0]!
  }

  for (const seed of seeds) {
    const rng = createRng(hashSeed(config.seed, 'trend', seed.slug))
    const carrier =
      (seed.carrierHandle ? byHandle.get(seed.carrierHandle) : undefined) ??
      bestMember(seed.originCluster, seed.aesthetic, [], used)
    if (!carrier) continue
    used.add(carrier.id)
    const day0 = Math.min(seed.day, days - 1)
    const lookIds: string[] = []

    // root: a purchase in the aesthetic, then the edition
    push(
      day0,
      0.4,
      {
        kind: 'purchase',
        userId: carrier.id,
        purchaseId: counters.next('pu'),
        gift: null,
        forKind: 'self',
        sourceLookId: null,
        occasion: null,
        aesthetic: seed.aesthetic,
      },
      [carrier.id],
    )
    const rootLookId = newLook(carrier.id)
    lookIds.push(rootLookId)
    push(
      day0,
      0.45,
      {
        kind: 'edition',
        userId: carrier.id,
        lookId: rootLookId,
        preset: pickPreset(rng, carrier.archetype),
        occasion: pickOccasion(rng, carrier.archetype),
        seedAesthetic: seed.aesthetic,
      },
      [carrier.id],
    )
    registerLook(carrier.id, rootLookId)
    engageAround(carrier, rootLookId, day0, 0.5)

    let prev = { lookId: rootLookId, ownerId: carrier.id, day: day0 }
    seed.hops.forEach((cluster, k) => {
      const friendIds = friendsOf(prev.ownerId).map((f) => f.id)
      const remixer = bestMember(cluster, seed.aesthetic, friendIds, used)
      if (!remixer) return
      used.add(remixer.id)
      const day = prev.day + 2
      if (day >= days) return
      // the previous owner shares the Look to the remixer (VIEW + REACT), then the remix
      push(
        day,
        0.35,
        {
          kind: 'share',
          userId: prev.ownerId,
          friendId: remixer.id,
          lookId: prev.lookId,
          react: true,
          remix: false,
          remixLookId: 'lk_none',
          remixPreset: 'studio-minimal',
          remixPurchaseId: null,
        },
        [prev.ownerId, remixer.id],
      )
      const remixLookId = newLook(remixer.id)
      lookIds.push(remixLookId)
      push(
        day,
        0.5,
        {
          kind: 'remix',
          userId: remixer.id,
          lookId: remixLookId,
          parentLookId: prev.lookId,
          parentOwnerId: prev.ownerId,
          preset: pickPreset(rng, remixer.archetype),
          purchaseId: rng.chance(0.75) ? counters.next('pu') : null,
          trendSeed: seed.slug,
        },
        [remixer.id, prev.ownerId],
      )
      registerLook(remixer.id, remixLookId)
      engageAround(remixer, remixLookId, day, 0.6)

      // branches: cluster mates remix the hop's Look (depth + 1), one of them deeper (depth + 2)
      const branchCount = 2
      const mates = members(cluster).filter((m) => !used.has(m.id))
      const branchers = mates
        .toSorted(
          (a, b) =>
            affinity(b, seed.aesthetic) - affinity(a, seed.aesthetic) || (a.id < b.id ? -1 : 1),
        )
        .slice(0, branchCount)
      let branchParent = { lookId: remixLookId, ownerId: remixer.id, day }
      branchers.forEach((mate, j) => {
        used.add(mate.id)
        const bDay = branchParent.day + 1
        if (bDay >= days) return
        const bLook = newLook(mate.id)
        lookIds.push(bLook)
        push(
          bDay,
          0.3 + 0.1 * j,
          {
            kind: 'share',
            userId: branchParent.ownerId,
            friendId: mate.id,
            lookId: branchParent.lookId,
            react: true,
            remix: false,
            remixLookId: 'lk_none',
            remixPreset: 'studio-minimal',
            remixPurchaseId: null,
          },
          [branchParent.ownerId, mate.id],
        )
        push(
          bDay,
          0.45 + 0.1 * j,
          {
            kind: 'remix',
            userId: mate.id,
            lookId: bLook,
            parentLookId: branchParent.lookId,
            parentOwnerId: branchParent.ownerId,
            preset: pickPreset(rng, mate.archetype),
            purchaseId: rng.chance(0.5) ? counters.next('pu') : null,
            trendSeed: seed.slug,
          },
          [mate.id, branchParent.ownerId],
        )
        registerLook(mate.id, bLook)
        engageAround(mate, bLook, bDay, 0.7)
        // the first branch of the first two hops goes one level deeper
        if (j === 0 && k < 2) branchParent = { lookId: bLook, ownerId: mate.id, day: bDay }
      })

      // an Ask about the hop's Look at hop 2
      if (k === 1 && friendsOf(remixer.id).length > 0) {
        const friend = byId.get(rng.pick(friendsOf(remixer.id)).id)
        if (friend) {
          const askId = counters.next('ask')
          push(
            day,
            0.7,
            {
              kind: 'ask',
              userId: remixer.id,
              friendId: friend.id,
              askId,
              askKind: 'choose',
              occasion: pickOccasion(rng, remixer.archetype),
              budget: remixer.budgetHint,
              lookId: remixLookId,
            },
            [remixer.id, friend.id],
          )
          push(
            day + 1,
            0.4,
            {
              kind: 'answer',
              askId,
              userId: friend.id,
              askerId: remixer.id,
              purchaseId: counters.next('pu'),
              styledLookId: null,
              styledPreset: 'studio-minimal',
            },
            [remixer.id, friend.id],
          )
        }
      }
      prev = { lookId: remixLookId, ownerId: remixer.id, day }
    })
    seedResults.push({ seed, rootLookId, carrierId: carrier.id, lookIds })
  }

  /** Friends / cluster mates view, react, save and sometimes buy from a trend-seed Look. */
  function engageAround(owner: Persona, lookId: string, day: number, t: number): void {
    const rng = createRng(hashSeed(config.seed, 'engage', lookId))
    const candidates = friendsOf(owner.id).map((f) => f.id)
    const extra = members(owner.socialCluster)
      .filter((m) => m.id !== owner.id && !candidates.includes(m.id))
      .map((m) => m.id)
    const audience = rng.shuffle([...candidates, ...extra]).slice(0, rng.int(3, 5))
    audience.forEach((userId, i) => {
      const d = day + (i % 3 === 2 ? 1 : 0)
      push(
        d,
        d === day ? t + 0.02 * (i + 1) : rng.float(0.3, 0.9),
        {
          kind: 'engage',
          userId,
          lookId,
          ownerId: owner.id,
          react: rng.chance(0.8),
          save: rng.chance(0.4),
          purchaseId: rng.chance(0.3) ? counters.next('pu') : null,
        },
        [userId, owner.id],
      )
    })
  }

  // -----------------------------------------------------------------------
  // 3. order and materialise
  // -----------------------------------------------------------------------
  pending.sort((a, b) => a.day - b.day || a.t - b.t || a.gen - b.gen)
  const counts = emptyCounts()
  const events: PlannedEvent[] = pending.map((e, seq) => {
    counts[e.kind] += 1
    return {
      ...e.body,
      seq,
      day: e.day,
      t: e.t,
      at: eventTime(config.now, days, e.day, e.t),
      locks: e.locks,
    } as PlannedEvent
  })
  return { events, counts, trendSeeds: seedResults }
}
