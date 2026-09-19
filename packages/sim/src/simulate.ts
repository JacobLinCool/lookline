/**
 * `simulateSocial(db | sink, config)`: generate personas and the friendship graph, lay out the
 * day plan (`planSimulation`), then execute every event through the sink — Postgres via the
 * engine write paths, or an in-memory sink in tests. Events are executed in plan order with
 * per-user FIFO locks, so independent users run in parallel while each user's own history
 * (and therefore its learned preference vector) stays in a deterministic order.
 */
import {
  aestheticIndex,
  createRng,
  hashSeed,
  type CategoryGroup,
  type Rng,
} from '@lookline/catalog'
import type { Database } from '@lookline/db'
import { contextVector, deriveLookStyle, renderLookPosterSvg } from '@lookline/engine'
import { buildSocialGraph } from './graph'
import { generatePersonas } from './personas'
import {
  ProductPool,
  chooseOptions,
  chooseOutfit,
  chooseProduct,
  compatibleDepartments,
  pickGroup,
  remixFallback,
  type Shortlist,
  type TasteProfile,
} from './pool'
import { DAY_MS, DEFAULT_DAYS, TREND_SEEDS, emptyCounts, planSimulation } from './schedule'
import { createDbSink } from './sink/db'
import { tasteSimilarity } from './taste'
import type {
  GiftTarget,
  Persona,
  PlannedEvent,
  SimConfig,
  SimProduct,
  SimSink,
  SimSummary,
} from './types'
import { askComment, askQuestion, lookTitle, searchUtterance } from './vocab'

interface LookState {
  id: string
  ownerId: string
  articleIds: string[]
  vector: number[]
  aesthetics: string[]
  depth: number
}

interface AskState {
  askerId: string
  kind: 'choose' | 'style_me'
  options: string[]
  occasion: string
  lookId: string | null
}

interface UserState {
  purchases: Array<{ articleId: string; purchaseId: string; self: boolean }>
  looks: string[]
  /** Self-targeted feedback events so far — the bandit's `eventCount` dimension (§4.4). */
  selfEvents: number
}

const stamp = (e: PlannedEvent, k: number): Date => new Date(e.at.getTime() + k * 1000)
const ixId = (e: PlannedEvent, k: number): string => `ix_${String(e.seq).padStart(6, '0')}_${k}`
const fbId = (e: PlannedEvent, k: number): string => `fb_${String(e.seq).padStart(6, '0')}_${k}`
const selfProfile = (p: Persona): TasteProfile => ({
  key: p.id,
  vector: p.hiddenVector,
  department: p.department,
  sizes: p.sizes,
  budget: p.budgetHint,
})
/** The catalogue records no sizes, so a purchase carries none. */
const sizeFor = (_p: Persona, _product: SimProduct): string | null => null

function isSink(target: Database | SimSink): target is SimSink {
  const t = target as Partial<SimSink>
  return typeof t.loadPool === 'function' && typeof t.recordPurchase === 'function'
}

/** Keyed FIFO locks + a concurrency cap: event i waits for every earlier event sharing a key. */
async function runOrdered<T extends { locks: string[] }>(
  items: readonly T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  const tails = new Map<string, Promise<void>>()
  let inFlight = 0
  const waiters: Array<() => void> = []
  const acquire = (): Promise<void> =>
    new Promise((resolve) => {
      if (inFlight < concurrency) {
        inFlight++
        resolve()
      } else waiters.push(resolve)
    })
  const releaseSlot = (): void => {
    const next = waiters.shift()
    if (next) next()
    else inFlight--
  }
  const running: Promise<void>[] = []
  let failure: unknown = null
  for (const item of items) {
    if (failure) break
    await acquire()
    const waits = item.locks.map((k) => tails.get(k) ?? Promise.resolve())
    let release!: () => void
    const done = new Promise<void>((resolve) => {
      release = resolve
    })
    for (const k of item.locks) tails.set(k, done)
    const task = Promise.all(waits)
      .then(() => run(item))
      .catch((error: unknown) => {
        failure ??= error
      })
      .finally(() => {
        release()
        releaseSlot()
      })
    running.push(task)
  }
  await Promise.all(running)
  if (failure) throw failure
}

export async function simulateSocial(
  target: Database | SimSink,
  config: SimConfig,
): Promise<SimSummary> {
  const started = performance.now()
  const log = config.log ?? (() => {})
  const days = config.days ?? DEFAULT_DAYS
  const sink: SimSink = isSink(target)
    ? target
    : createDbSink(target, { dataDir: config.dataDir ?? null })
  const concurrency = Math.max(1, config.concurrency ?? 1)
  const personas = config.personas ?? generatePersonas(config.seed, config.n)
  const byId = new Map(personas.map((p) => [p.id, p]))
  const graph = buildSocialGraph(personas, config.seed)
  const plan = planSimulation(personas, graph, {
    seed: config.seed,
    now: config.now,
    days,
    trendSeeds: config.trendSeeds ?? TREND_SEEDS,
  })
  log(
    `plan: ${plan.events.length} events over ${days} days for ${personas.length} personas (${graph.edges.length} friendships)`,
  )

  const createdAt = new Date(config.now.getTime() - (days + 1) * DAY_MS)
  await sink.insertPersonas(personas, createdAt)
  const pool = new ProductPool(await sink.loadPool())
  log(`pool: ${pool.size} articles`)
  if (pool.size === 0)
    throw new Error('@lookline/sim: the product pool is empty (seed the catalog first)')

  const looks = new Map<string, LookState>()
  const asks = new Map<string, AskState>()
  const usersState = new Map<string, UserState>()
  for (const p of personas) usersState.set(p.id, { purchases: [], looks: [], selfEvents: 0 })
  const executed = emptyCounts()
  const skipped = emptyCounts()
  const totals = {
    purchases: 0,
    looks: { edition: 0, remix: 0, together: 0 },
    asks: 0,
    answers: 0,
    interactions: 0,
    feedback: 0,
  }
  const errors: unknown[] = []

  // -----------------------------------------------------------------------
  // helpers
  // -----------------------------------------------------------------------
  const eventRng = (e: PlannedEvent, salt = ''): Rng =>
    createRng(hashSeed(config.seed, 'event', e.seq, salt))
  const token = (id: string): string => `${id}-${hashSeed(config.seed, 'token', id).toString(36)}`

  const giftProfile = (p: Persona, gift: GiftTarget): TasteProfile => {
    const friend = gift.forUserId ? byId.get(gift.forUserId) : undefined
    const own = p.giftHiddenVector ?? p.hiddenVector
    const vector = friend ? own.map((x, i) => 0.4 * x + 0.6 * (friend.hiddenVector[i] ?? 0)) : own
    return {
      key: friend ? `${p.id}:gift:${friend.id}` : `${p.id}:gift`,
      vector,
      department: friend ? friend.department : gift.department,
      sizes: friend ? friend.sizes : {},
      budget: Math.round(p.budgetHint * 0.8),
    }
  }

  async function interaction(
    e: PlannedEvent,
    k: number,
    input: Omit<Parameters<SimSink['recordInteraction']>[0], 'id' | 'createdAt'>,
  ): Promise<string> {
    const id = ixId(e, k)
    await sink.recordInteraction({ ...input, id, createdAt: stamp(e, k) })
    totals.interactions++
    return id
  }
  async function feedback(
    e: PlannedEvent,
    k: number,
    input: Omit<Parameters<SimSink['recordFeedback']>[0], 'id' | 'createdAt'>,
  ): Promise<void> {
    await sink.recordFeedback({ ...input, id: fbId(e, k), createdAt: stamp(e, k) })
    totals.feedback++
    if (!input.forOthers) {
      const state = usersState.get(input.userId)
      if (state) state.selfEvents++
    }
  }
  async function purchase(
    e: PlannedEvent,
    k: number,
    p: Persona,
    product: SimProduct,
    opts: {
      purchaseId: string
      forKind: 'self' | 'other' | 'undisclosed'
      gift?: GiftTarget | null
      sourceLookId?: string | null
      sourceAskId?: string | null
    },
  ): Promise<void> {
    await sink.recordPurchase({
      id: opts.purchaseId,
      userId: p.id,
      articleId: product.id,
      quantity: 1,
      size: opts.forKind === 'other' ? null : sizeFor(p, product),
      forKind: opts.forKind,
      forUserId: opts.gift?.forUserId ?? null,
      forLabel: opts.gift?.label ?? null,
      sourceLookId: opts.sourceLookId ?? null,
      sourceAskId: opts.sourceAskId ?? null,
      createdAt: stamp(e, k),
    })
    totals.purchases++
    usersState.get(p.id)?.purchases.push({
      articleId: product.id,
      purchaseId: opts.purchaseId,
      self: opts.forKind !== 'other',
    })
  }
  async function ensureLoaded(ids: readonly string[]): Promise<void> {
    const missing = ids.filter((id) => !pool.has(id))
    if (missing.length > 0) pool.add(await sink.loadProducts(missing))
  }
  async function makeLook(
    e: PlannedEvent,
    k: number,
    owner: Persona,
    input: {
      id: string
      articleIds: string[]
      kind: 'edition' | 'remix' | 'together'
      preset: string
      occasion: string | null
      parentLookId?: string | null
      participants?: Array<{ userId: string; sourceLookId: string | null }>
      title?: string
    },
  ): Promise<LookState | null> {
    await ensureLoaded(input.articleIds)
    const items = input.articleIds
      .map((id) => pool.get(id))
      .filter((p): p is SimProduct => p !== undefined)
    if (items.length === 0) return null
    const style = deriveLookStyle(items)
    const state = usersState.get(owner.id)!
    const rng = eventRng(e, `look:${input.id}`)
    const title =
      input.title ??
      lookTitle(rng, {
        ownerName: owner.displayName,
        aesthetics: style.aesthetics,
        occasion: input.occasion,
        kind: input.kind,
      })
    const poster = renderLookPosterSvg({
      title,
      ownerName: owner.displayName,
      stylePreset: input.preset,
      articles: items,
      palette: style.palette,
      aesthetics: style.aesthetics,
      seed: hashSeed(config.seed, 'poster', input.id),
      editionNumber: state.looks.length + 1,
    })
    const result = await sink.createLook(
      {
        id: input.id,
        ownerId: owner.id,
        articleIds: items.map((p) => p.id),
        stylePreset: input.preset,
        title,
        occasion: input.occasion,
        // Every fourth Look is public so the network has something to show a newcomer.
        visibility: hashSeed(config.seed, 'visibility', input.id) % 4 === 0 ? 'public' : 'link',
        parentLookId: input.parentLookId ?? null,
        kind: input.kind,
        participants: input.participants,
        shareToken: token(input.id),
        createdAt: stamp(e, k),
      },
      poster,
    )
    const look: LookState = {
      id: input.id,
      ownerId: owner.id,
      articleIds: items.map((p) => p.id),
      vector: style.styleVector,
      aesthetics: style.aesthetics,
      depth: result.depth,
    }
    looks.set(look.id, look)
    state.looks.push(look.id)
    totals.looks[input.kind]++
    return look
  }
  /** A product of the Look the user could buy (department-compatible), else a taste pick of the same group. */
  function buyable(look: LookState, p: Persona, shortlist: Shortlist, rng: Rng): SimProduct | null {
    const departments = new Set(compatibleDepartments(p.department))
    const wearable = look.articleIds
      .map((id) => pool.get(id))
      .filter((x): x is SimProduct => !!x && departments.has(x.department))
    if (wearable.length > 0 && rng.chance(0.7)) return rng.pick(wearable)
    const any = look.articleIds.map((id) => pool.get(id)).find((x) => !!x)
    return chooseProduct(pool, shortlist, rng, {
      group: (any?.categoryGroup as CategoryGroup | undefined) ?? null,
      exclude: new Set(look.articleIds),
    })
  }
  async function remix(
    e: PlannedEvent,
    k0: number,
    user: Persona,
    parent: LookState,
    newLookId: string,
    preset: string,
    purchaseId: string | null,
  ): Promise<number> {
    let k = k0
    const rng = eventRng(e, `remix:${newLookId}`)
    const shortlist = pool.shortlist(selfProfile(user))
    let ids = await sink.suggestRemix(parent.id, user.id)
    await ensureLoaded(ids)
    ids = ids.filter((id) => pool.has(id))
    if (ids.length === 0) ids = remixFallback(pool, shortlist, rng, parent.articleIds)
    if (ids.length === 0) return k
    // keep one wearable source piece (the remix keeps the mood, not only the palette)
    const departments = new Set(compatibleDepartments(user.department))
    const keepable = parent.articleIds.filter((id) => {
      const p = pool.get(id)
      return p && departments.has(p.department) && !ids.includes(id)
    })
    if (keepable.length > 0 && rng.chance(0.6)) {
      // keep the source piece that carries the Look's lead aesthetic most strongly
      const lead = aestheticIndex(parent.aesthetics[0] ?? '')
      const keep = keepable.toSorted(
        (a, b) =>
          (pool.get(b)?.styleVector[lead] ?? 0) - (pool.get(a)?.styleVector[lead] ?? 0) ||
          a.localeCompare(b),
      )[0]!
      const kept = pool.get(keep)!
      const idx = ids.findIndex((id) => pool.get(id)?.categoryGroup === kept.categoryGroup)
      if (idx >= 0) ids[idx] = keep
      else ids.push(keep)
    }
    const look = await makeLook(e, k++, user, {
      id: newLookId,
      articleIds: ids.slice(0, 5),
      kind: 'remix',
      preset,
      occasion: null,
      parentLookId: parent.id,
    })
    if (!look) return k
    for (const src of parent.articleIds) {
      await feedback(e, k++, {
        userId: user.id,
        kind: 'remix',
        articleId: src,
        lookId: look.id,
        context: { kept: look.articleIds.includes(src), sourceLookId: parent.id },
      })
    }
    if (purchaseId) {
      const product = buyable(look, user, shortlist, rng)
      if (product)
        await purchase(e, k++, user, product, {
          purchaseId,
          forKind: 'self',
          sourceLookId: look.id,
        })
    }
    return k
  }

  // -----------------------------------------------------------------------
  // event handlers
  // -----------------------------------------------------------------------
  async function onBrowse(e: PlannedEvent & { kind: 'browse' }): Promise<void> {
    const p = byId.get(e.userId)!
    const rng = eventRng(e)
    const profile =
      e.forGift && p.giftHiddenVector && p.giftDepartment
        ? giftProfile(p, {
            label: p.giftLabel ?? 'gift',
            forUserId: null,
            department: p.giftDepartment,
          })
        : selfProfile(p)
    const shortlist = pool.shortlist(profile)
    const group = pickGroup(rng, profile.department, shortlist) ?? 'tops'
    const aesthetic =
      p.primaryAesthetics[rng.int(0, Math.max(0, p.primaryAesthetics.length - 1))] ?? 'minimalist'
    let k = 0
    // The slate's key for the bandit: every impression and every reward event below carries it,
    // or `collectSlates` cannot group them and the run teaches the bandit nothing (§4.4).
    const sessionId = `is_${String(e.seq).padStart(6, '0')}`
    const slateContext = contextVector({
      eventCount: usersState.get(p.id)?.selfEvents ?? 0,
      recipientOther: e.forGift,
      hasBudgetMax: profile.budget !== null,
      daysSinceSignup: Math.max(0, (e.at.getTime() - createdAt.getTime()) / DAY_MS),
    })
    await sink.recordSearch({
      id: sessionId,
      userId: p.id,
      utterance: searchUtterance(rng, {
        aesthetic,
        group,
        occasion: e.occasion,
        budget: profile.budget,
        forGift: e.forGift,
      }),
      occasion: e.occasion,
      createdAt: stamp(e, k++),
    })
    totals.interactions++
    // slate: 4 taste picks (2 in the searched group) + 2 random pieces
    const slate: SimProduct[] = []
    const seen = new Set<string>()
    const take = (x: SimProduct | null): void => {
      if (x && !seen.has(x.id)) {
        seen.add(x.id)
        slate.push(x)
      }
    }
    take(chooseProduct(pool, shortlist, rng, { group, exclude: seen }))
    take(chooseProduct(pool, shortlist, rng, { group, exclude: seen }))
    take(chooseProduct(pool, shortlist, rng, { exclude: seen }))
    take(pool.randomProduct(rng, profile.department))
    take(pool.randomProduct(rng, profile.department))
    const scored = slate.map((product, position) => ({
      product,
      position,
      sim: tasteSimilarity(product.styleVector, profile.vector),
    }))
    for (const s of scored) {
      await feedback(e, k++, {
        userId: p.id,
        kind: 'impression',
        articleId: s.product.id,
        intentSessionId: sessionId,
        position: s.position,
        forOthers: e.forGift,
        // `balanced` is the truth here: the slate below is ordered by taste similarity, not by an
        // arm's weights, so claiming any other arm would credit it for a ranking it never made.
        context: { armId: 'balanced', contextVector: slateContext, source: 'sim-browse' },
      })
    }
    const ranked = scored.toSorted((a, b) => b.sim - a.sim)
    const clicks = ranked.filter(
      (s, i) => (i === 0 && s.sim > 0.4) || (i === 1 && s.sim > 0.55 && rng.chance(0.5)),
    )
    for (const s of clicks) {
      await interaction(e, k++, {
        actorUserId: p.id,
        type: 'VIEW',
        articleId: s.product.id,
        payload: { from: 'search', position: s.position },
      })
      await feedback(e, k++, {
        userId: p.id,
        kind: 'click',
        articleId: s.product.id,
        intentSessionId: sessionId,
        position: s.position,
        forOthers: e.forGift,
      })
    }
    const top = clicks[0]
    if (top && rng.chance(0.3)) {
      await interaction(e, k++, { actorUserId: p.id, type: 'SAVE', articleId: top.product.id })
      await feedback(e, k++, {
        userId: p.id,
        kind: 'save',
        articleId: top.product.id,
        intentSessionId: sessionId,
        forOthers: e.forGift,
      })
    }
    const worst = ranked[ranked.length - 1]
    if (worst && worst.sim < 0.35 && rng.chance(0.35)) {
      await interaction(e, k++, { actorUserId: p.id, type: 'DISMISS', articleId: worst.product.id })
      await feedback(e, k++, {
        userId: p.id,
        kind: 'dismiss',
        articleId: worst.product.id,
        intentSessionId: sessionId,
        position: worst.position,
        forOthers: e.forGift,
      })
    }
  }

  async function onPurchase(e: PlannedEvent & { kind: 'purchase' }): Promise<void> {
    const p = byId.get(e.userId)!
    const rng = eventRng(e)
    const profile = e.gift ? giftProfile(p, e.gift) : selfProfile(p)
    const shortlist = pool.shortlist(profile)
    const source = e.sourceLookId ? looks.get(e.sourceLookId) : undefined
    const product = source
      ? buyable(source, p, shortlist, rng)
      : chooseProduct(pool, shortlist, rng, {
          aesthetic: e.aesthetic,
          occasion: e.occasion,
          exclude: new Set(usersState.get(p.id)!.purchases.map((x) => x.articleId)),
        })
    if (!product) {
      skipped.purchase++
      return
    }
    await purchase(e, 0, p, product, {
      purchaseId: e.purchaseId,
      forKind: e.forKind,
      gift: e.gift,
      sourceLookId: source ? source.id : null,
    })
  }

  async function onEdition(e: PlannedEvent & { kind: 'edition' }): Promise<void> {
    const p = byId.get(e.userId)!
    const rng = eventRng(e)
    const state = usersState.get(p.id)!
    // Trend-seed editions grow from the seed purchase only; regular editions from recent buys.
    const base = state.purchases
      .filter((x) => x.self)
      .slice(e.seedAesthetic ? -1 : -3)
      .map((x) => x.articleId)
      .toReversed()
    const articles = chooseOutfit(pool, pool.shortlist(selfProfile(p)), rng, base, {
      aesthetic: e.seedAesthetic,
      occasion: e.occasion,
    })
    const look = await makeLook(e, 0, p, {
      id: e.lookId,
      articleIds: articles,
      kind: 'edition',
      preset: e.preset,
      occasion: e.occasion,
    })
    if (!look) skipped.edition++
  }

  async function onShare(e: PlannedEvent & { kind: 'share' }): Promise<void> {
    const look = looks.get(e.lookId)
    const friend = byId.get(e.friendId)
    if (!look || !friend) {
      skipped.share++
      return
    }
    let k = 0
    const shareIx = await interaction(e, k++, {
      actorUserId: e.userId,
      targetUserId: friend.id,
      type: 'SHARE',
      lookId: look.id,
      payload: { channel: 'link' },
    })
    await interaction(e, k++, {
      actorUserId: friend.id,
      targetUserId: look.ownerId,
      type: 'VIEW',
      lookId: look.id,
      sourceInteractionId: shareIx,
      payload: { from: 'share' },
    })
    if (e.react) {
      const rng = eventRng(e)
      await interaction(e, k++, {
        actorUserId: friend.id,
        targetUserId: look.ownerId,
        type: 'REACT',
        lookId: look.id,
        sourceInteractionId: shareIx,
        payload: { emoji: rng.pick(['🔥', '❤️', '👀', '✨', '👏']) },
      })
      await feedback(e, k++, { userId: friend.id, kind: 'click', lookId: look.id })
    }
    if (e.remix) {
      await remix(e, k, friend, look, e.remixLookId, e.remixPreset, e.remixPurchaseId)
    }
  }

  async function onRemix(e: PlannedEvent & { kind: 'remix' }): Promise<void> {
    const parent = looks.get(e.parentLookId)
    const user = byId.get(e.userId)
    if (!parent || !user) {
      skipped.remix++
      return
    }
    await remix(e, 0, user, parent, e.lookId, e.preset, e.purchaseId)
  }

  async function onAsk(e: PlannedEvent & { kind: 'ask' }): Promise<void> {
    const p = byId.get(e.userId)!
    const rng = eventRng(e)
    const shortlist = pool.shortlist(selfProfile(p))
    let options: string[] = []
    if (e.askKind === 'choose') {
      const look = e.lookId ? looks.get(e.lookId) : undefined
      const pair = look
        ? ((): [string, string] | null => {
            const first = look.articleIds[0]
            if (first === undefined) return null
            const alt = chooseProduct(pool, shortlist, rng, {
              group: (pool.get(first)?.categoryGroup as CategoryGroup | undefined) ?? null,
              exclude: new Set(look.articleIds),
            })
            return alt ? ([first, alt.id] as [string, string]) : null
          })()
        : chooseOptions(pool, shortlist, rng)
      if (!pair) {
        skipped.ask++
        return
      }
      options = [...pair]
    }
    await sink.createAsk({
      id: e.askId,
      askerId: p.id,
      kind: e.askKind,
      question: askQuestion(rng, e.askKind, e.occasion, e.budget),
      optionArticleIds: options,
      lookId: e.lookId && looks.has(e.lookId) ? e.lookId : null,
      targetUserId: e.friendId,
      budget: e.budget,
      occasion: e.occasion,
      shareToken: token(e.askId),
      createdAt: stamp(e, 0),
    })
    totals.asks++
    asks.set(e.askId, {
      askerId: p.id,
      kind: e.askKind,
      options,
      occasion: e.occasion,
      lookId: e.lookId ?? null,
    })
  }

  async function onAnswer(e: PlannedEvent & { kind: 'answer' }): Promise<void> {
    const ask = asks.get(e.askId)
    const responder = byId.get(e.userId)
    const asker = byId.get(e.askerId)
    if (!ask || !responder || !asker) {
      skipped.answer++
      return
    }
    const rng = eventRng(e)
    let k = 0
    if (ask.kind === 'choose') {
      const [a, b] = ask.options
      if (a === undefined || b === undefined) {
        skipped.answer++
        return
      }
      const pa = pool.get(a)
      const pb = pool.get(b)
      const simA = pa ? tasteSimilarity(pa.styleVector, asker.hiddenVector) : 0
      const simB = pb ? tasteSimilarity(pb.styleVector, asker.hiddenVector) : 0
      // friends know you: the better-fitting option wins 75 % of the time
      const better = simA >= simB ? a : b
      const choice = rng.chance(0.75) ? better : better === a ? b : a
      await sink.answerAsk({
        id: `ar_${e.askId}`,
        askId: e.askId,
        responderUserId: responder.id,
        responderName: responder.displayName,
        choiceArticleId: choice,
        comment: askComment(rng, 'choose'),
        createdAt: stamp(e, k++),
      })
      totals.answers++
      if (e.purchaseId) {
        const product = pool.get(choice)
        if (product)
          await purchase(e, k++, asker, product, {
            purchaseId: e.purchaseId,
            forKind: 'self',
            sourceAskId: e.askId,
            sourceLookId: ask.lookId,
          })
      }
      return
    }
    let styledLookId: string | null = null
    if (e.styledLookId) {
      const shortlist = pool.shortlist({ ...selfProfile(asker), key: `${asker.id}:styled` })
      const articles = chooseOutfit(pool, shortlist, rng, [], { occasion: ask.occasion })
      const look = await makeLook(e, k++, responder, {
        id: e.styledLookId,
        articleIds: articles,
        kind: 'edition',
        preset: e.styledPreset,
        occasion: ask.occasion,
        participants: [{ userId: asker.id, sourceLookId: null }],
        title: `${responder.displayName.split(' ')[0]} styled ${asker.displayName.split(' ')[0]} for ${ask.occasion}`,
      })
      styledLookId = look?.id ?? null
    }
    await sink.answerAsk({
      id: `ar_${e.askId}`,
      askId: e.askId,
      responderUserId: responder.id,
      responderName: responder.displayName,
      styledLookId,
      comment: askComment(rng, 'style_me'),
      createdAt: stamp(e, k++),
    })
    totals.answers++
  }

  async function onTogether(e: PlannedEvent & { kind: 'together' }): Promise<void> {
    const owner = byId.get(e.userId)!
    const rng = eventRng(e)
    const latest = (id: string): LookState | undefined => {
      const list = usersState.get(id)?.looks ?? []
      for (let i = list.length - 1; i >= 0; i--) {
        const look = looks.get(list[i]!)
        if (look && look.id !== e.lookId) return look
      }
      return undefined
    }
    const mine = latest(owner.id)
    const mates = e.participantIds
      .map((id) => ({ id, look: latest(id) }))
      .filter((m): m is { id: string; look: LookState } => m.look !== undefined)
    if (!mine || mates.length === 0) {
      skipped.together++
      return
    }
    const articleIds = mine.articleIds.slice(0, 2)
    for (const m of mates)
      for (const id of rng.shuffle(m.look.articleIds).slice(0, 2)) articleIds.push(id)
    const look = await makeLook(e, 0, owner, {
      id: e.lookId,
      articleIds: [...new Set(articleIds)].slice(0, 6),
      kind: 'together',
      preset: e.preset,
      occasion: e.occasion,
      participants: [
        { userId: owner.id, sourceLookId: mine.id },
        ...mates.map((m) => ({ userId: m.id, sourceLookId: m.look.id })),
      ],
    })
    if (!look) skipped.together++
  }

  async function onEngage(e: PlannedEvent & { kind: 'engage' }): Promise<void> {
    const look = looks.get(e.lookId)
    const p = byId.get(e.userId)
    if (!look || !p) {
      skipped.engage++
      return
    }
    const rng = eventRng(e)
    let k = 0
    await interaction(e, k++, {
      actorUserId: p.id,
      targetUserId: look.ownerId,
      type: 'VIEW',
      lookId: look.id,
      payload: { from: 'feed' },
    })
    await feedback(e, k++, { userId: p.id, kind: 'click', lookId: look.id })
    if (e.react) {
      await interaction(e, k++, {
        actorUserId: p.id,
        targetUserId: look.ownerId,
        type: 'REACT',
        lookId: look.id,
        payload: { emoji: rng.pick(['🔥', '❤️', '✨', '😍']) },
      })
    }
    if (e.save) {
      await interaction(e, k++, {
        actorUserId: p.id,
        targetUserId: look.ownerId,
        type: 'SAVE',
        lookId: look.id,
      })
      await feedback(e, k++, { userId: p.id, kind: 'save', lookId: look.id })
    }
    if (e.purchaseId) {
      const product = buyable(look, p, pool.shortlist(selfProfile(p)), rng)
      if (product)
        await purchase(e, k++, p, product, {
          purchaseId: e.purchaseId,
          forKind: 'self',
          sourceLookId: look.id,
        })
    }
  }

  async function dispatch(e: PlannedEvent): Promise<void> {
    switch (e.kind) {
      case 'browse':
        return onBrowse(e)
      case 'purchase':
        return onPurchase(e)
      case 'edition':
        return onEdition(e)
      case 'share':
        return onShare(e)
      case 'remix':
        return onRemix(e)
      case 'ask':
        return onAsk(e)
      case 'answer':
        return onAnswer(e)
      case 'together':
        return onTogether(e)
      case 'engage':
        return onEngage(e)
    }
  }

  // -----------------------------------------------------------------------
  // run
  // -----------------------------------------------------------------------
  let done = 0
  const total = plan.events.length
  const reportEvery = Math.max(500, Math.floor(total / 20))
  await runOrdered(plan.events, concurrency, async (e) => {
    try {
      await dispatch(e)
      executed[e.kind]++
    } catch (error) {
      errors.push(error)
      skipped[e.kind]++
      if (errors.length <= 5) log(`event ${e.seq} (${e.kind}) failed: ${String(error)}`)
      if (errors.length > Math.max(20, total * 0.02)) throw error
    }
    done++
    if (done % reportEvery === 0) log(`  ${done}/${total} events (day ${e.day})`)
  })
  await sink.finish?.()

  const durationMs = Math.round(performance.now() - started)
  log(`done in ${(durationMs / 1000).toFixed(1)} s (${errors.length} failed events)`)
  return {
    personas: personas.length,
    events: plan.counts,
    executed,
    skipped,
    purchases: totals.purchases,
    looks: totals.looks,
    asks: totals.asks,
    answers: totals.answers,
    interactions: totals.interactions,
    feedback: totals.feedback,
    trendSeeds: plan.trendSeeds.map((s) => ({
      slug: s.seed.slug,
      rootLookId: s.rootLookId,
      carrierId: s.carrierId,
      looks: s.lookIds.filter((id) => looks.has(id)).length,
    })),
    durationMs,
  }
}
