import {
  activitySharing,
  articles,
  asc,
  cardCandidates,
  cards,
  cardSessions,
  collectionMembers,
  collections,
  feedbackEvents,
  friendships,
  generationAttempts,
  insertAll,
  intentSessions,
  personas,
  purchases,
  simPersonas,
  users,
  type CardArtDirection,
  type Database,
} from '@lookline/db'

const DAY_MS = 86_400_000

export interface CanonicalSimulationOptions {
  seed?: number
  users?: number
  days?: number
  now?: Date
  maxParams?: number
  log?: (message: string) => void
}

export interface CanonicalSimulationResult {
  users: number
  friendships: number
  purchases: number
  cards: number
  collections: number
  intents: number
  feedback: number
  durationMs: number
}

function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function at(now: Date, days: number, random: () => number): Date {
  return new Date(now.getTime() - Math.floor(random() * days * DAY_MS))
}

export function planAcceptedFriendships(ids: readonly string[], updatedAt: Date) {
  const pairs = new Map<
    string,
    {
      lowUserId: string
      highUserId: string
      requestedBy: string
      state: 'accepted'
      updatedAt: Date
    }
  >()
  if (ids.length < 2) return []
  for (let index = 0; index < ids.length; index++) {
    for (const distance of [1, 2]) {
      const own = ids[index]!
      const other = ids[(index + distance) % ids.length]!
      if (own === other) continue
      const lowUserId = own < other ? own : other
      const highUserId = own < other ? other : own
      pairs.set(`${lowUserId}:${highUserId}`, {
        lowUserId,
        highUserId,
        requestedBy: lowUserId,
        state: 'accepted',
        updatedAt,
      })
    }
  }
  return [...pairs.values()]
}

const directions: readonly CardArtDirection[] = [
  { focus: 'silhouette', pose: 'standing', scene: 'studio', note: null },
  { focus: 'layering', pose: 'walking', scene: 'street', note: null },
  { focus: 'fabric-motion', pose: 'turn', scene: 'architecture', note: null },
  { focus: 'pattern-detail', pose: 'seated', scene: 'interior', note: null },
  { focus: 'accessories', pose: 'dynamic', scene: 'stage', note: null },
]

/** Populate only canonical social and demand objects; no inferred social graph is created. */
export async function simulateCanonical(
  db: Database,
  options: CanonicalSimulationOptions = {},
): Promise<CanonicalSimulationResult> {
  const started = Date.now()
  const seed = options.seed ?? 20_260_918
  const userCount = Math.max(2, Math.floor(options.users ?? 120))
  const days = Math.max(1, Math.floor(options.days ?? 60))
  const now = options.now ?? new Date()
  const maxParams = options.maxParams ?? 30_000
  const random = rng(seed)
  const catalog = await db
    .select({ id: articles.id, price: articles.price })
    .from(articles)
    .orderBy(asc(articles.id))
    .limit(Math.max(12, userCount * 2))
  if (catalog.length === 0) throw new Error('The catalog is empty. Seed articles first.')

  const accounts = Array.from({ length: userCount }, (_, index) => {
    const n = String(index + 1).padStart(4, '0')
    return {
      id: `sim_u_${n}`,
      handle: `sim-${n}`,
      displayName: `Sim ${n}`,
      avatarSeed: seed + index,
      isPersona: index < 8,
      tasteCluster: index % 6,
      createdAt: at(now, days, random),
      lastSeenAt: now,
    }
  })
  await insertAll(db, users, accounts, { maxParams })
  await insertAll(
    db,
    simPersonas,
    accounts.map((account, index) => ({
      userId: account.id,
      hiddenVector: Array.from({ length: 64 }, (_, axis) => ((index + axis) % 11) / 10),
      giftHiddenVector:
        index % 3 === 0
          ? Array.from({ length: 64 }, (_, axis) => ((index + axis + 3) % 11) / 10)
          : null,
      params: { activity: 0.4 + (index % 5) / 10 },
    })),
    { maxParams },
  )

  const friendPairs = planAcceptedFriendships(
    accounts.map((account) => account.id),
    now,
  )
  await insertAll(db, friendships, friendPairs, { maxParams })
  await insertAll(
    db,
    activitySharing,
    accounts.map((account, index) => ({ userId: account.id, purchases: index % 3 === 0 })),
    { maxParams },
  )

  const personaRows = accounts.map((account, index) => ({
    id: `sim_per_${String(index + 1).padStart(4, '0')}`,
    ownerUserId: account.id,
    displayName: account.displayName,
    kind: 'avatar' as const,
    avatarSeed: account.avatarSeed,
    createdAt: account.createdAt,
  }))
  await insertAll(db, personas, personaRows, { maxParams })

  const firstPurchases = accounts.map((account, index) => {
    const article = catalog[index % catalog.length]!
    return {
      id: `sim_pur_${String(index + 1).padStart(4, '0')}_a`,
      userId: account.id,
      articleId: article.id,
      quantity: 1,
      price: article.price,
      forKind: index % 5 === 0 ? ('other' as const) : ('self' as const),
      forLabel: index % 5 === 0 ? 'friend' : null,
      createdAt: at(now, days, random),
    }
  })
  await insertAll(db, purchases, firstPurchases, { maxParams })

  const sessions = accounts.map((account, index) => {
    const article = catalog[index % catalog.length]!
    const direction = directions[index % directions.length]!
    return {
      id: `sim_cs_${String(index + 1).padStart(4, '0')}`,
      ownerUserId: account.id,
      personaId: personaRows[index]!.id,
      state: 'settled' as const,
      reserveOperationKey: `sim:reserve:${index + 1}`,
      articleSnapshot: [{ articleId: article.id, source: 'purchase' as const }],
      artDirection: direction,
      expiresAt: new Date(now.getTime() + DAY_MS),
      settledAt: now,
      createdAt: at(now, days, random),
    }
  })
  await insertAll(db, cardSessions, sessions, { maxParams })
  const attempts = sessions.map((session, index) => ({
    id: `sim_ga_${String(index + 1).padStart(4, '0')}`,
    sessionId: session.id,
    state: 'succeeded' as const,
    provider: 'simulation',
    artDirection: session.artDirection,
    createdAt: session.createdAt,
    finishedAt: session.createdAt,
  }))
  await insertAll(db, generationAttempts, attempts, { maxParams })
  const candidates = sessions.map((session, index) => ({
    id: `sim_cc_${String(index + 1).padStart(4, '0')}`,
    sessionId: session.id,
    attemptId: attempts[index]!.id,
    imagePath: `simulation/cards/${index + 1}.webp`,
    position: 1,
    createdAt: session.createdAt,
  }))
  await insertAll(db, cardCandidates, candidates, { maxParams })
  const cardRows = sessions.map((session, index) => ({
    id: `sim_card_${String(index + 1).padStart(4, '0')}`,
    sessionId: session.id,
    candidateId: candidates[index]!.id,
    personaId: session.personaId,
    authorUserId: session.ownerUserId,
    imagePath: candidates[index]!.imagePath,
    verificationCode: `SIM-${String(seed % 10_000).padStart(4, '0')}-${String(index + 1).padStart(4, '0')}`,
    tier: 'standard',
    ownedRatio: 1,
    articleSnapshot: session.articleSnapshot.map(({ articleId, source }) => ({
      articleId,
      source,
    })),
    visibility: index % 4 === 0 ? ('link' as const) : ('public' as const),
    issuedAt: session.createdAt,
  }))
  await insertAll(db, cards, cardRows, { maxParams })

  const attributedPurchases = accounts.map((account, index) => {
    const article = catalog[(index + 1) % catalog.length]!
    const friendCard = cardRows[(index + 1) % cardRows.length]!
    return {
      id: `sim_pur_${String(index + 1).padStart(4, '0')}_b`,
      userId: account.id,
      articleId: article.id,
      quantity: 1,
      price: article.price,
      forKind: 'self' as const,
      sourceCardId: friendCard.id,
      createdAt: at(now, days, random),
    }
  })
  await insertAll(db, purchases, attributedPurchases, { maxParams })

  const intentRows = accounts.map((account, index) => {
    const article = catalog[(index + 2) % catalog.length]!
    return {
      id: `sim_int_${String(index + 1).padStart(4, '0')}`,
      userId: account.id,
      utterance: index % 2 === 0 ? '想找一套適合週末的穿搭' : 'something polished for dinner',
      locale: index % 2 === 0 ? 'zh-TW' : 'en',
      intent: { occasion: index % 2 === 0 ? 'weekend' : 'dinner' },
      results: { articleIds: [article.id] },
      provider: 'offline' as const,
      latencyMs: 0,
      createdAt: at(now, days, random),
    }
  })
  await insertAll(db, intentSessions, intentRows, { maxParams })

  const feedbackRows = accounts.flatMap((account, index) => {
    const article = catalog[index % catalog.length]!
    const card = cardRows[index]!
    const createdAt = at(now, days, random)
    return [
      {
        id: `sim_fb_${index + 1}_click`,
        userId: account.id,
        articleId: article.id,
        cardId: card.id,
        kind: 'click' as const,
        reward: 0.1,
        context: { surface: 'card' },
        createdAt,
      },
      {
        id: `sim_fb_${index + 1}_save`,
        userId: account.id,
        articleId: article.id,
        cardId: card.id,
        kind: 'save' as const,
        reward: 0.4,
        context: { surface: 'card' },
        createdAt,
      },
      {
        id: `sim_fb_${index + 1}_purchase`,
        userId: account.id,
        articleId: article.id,
        cardId: card.id,
        kind: 'purchase' as const,
        reward: 1,
        context: { source: 'card' },
        createdAt,
      },
    ]
  })
  await insertAll(db, feedbackEvents, feedbackRows, { maxParams })

  const collectionRows = Array.from({ length: Math.floor(accounts.length / 2) }, (_, index) => ({
    id: `sim_col_${String(index + 1).padStart(4, '0')}`,
    ownerUserId: accounts[index * 2]!.id,
    title: `Sim Collection ${index + 1}`,
    createdAt: at(now, days, random),
  }))
  await insertAll(db, collections, collectionRows, { maxParams })
  await insertAll(
    db,
    collectionMembers,
    collectionRows.flatMap((collection, index) =>
      [index * 2, index * 2 + 1].map((member) => ({
        collectionId: collection.id,
        personaId: personaRows[member]!.id,
        cardId: cardRows[member]!.id,
        createdAt: collection.createdAt,
      })),
    ),
    { maxParams },
  )

  options.log?.(`created ${accounts.length} accounts and ${cardRows.length} Cards`)
  return {
    users: accounts.length,
    friendships: friendPairs.length,
    purchases: firstPurchases.length + attributedPurchases.length,
    cards: cardRows.length,
    collections: collectionRows.length,
    intents: intentRows.length,
    feedback: feedbackRows.length,
    durationMs: Date.now() - started,
  }
}
