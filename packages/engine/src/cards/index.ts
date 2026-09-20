/**
 * Personas, wardrobe entitlements, card credits and collectible cards — the shared contract the
 * purchase (#34), persona (#35), studio (#36), collection (#37) and sharing (#38) work builds on.
 *
 * Two decisions shape everything else, both forced by D1 having no transactions:
 *
 * Holding is never stored. A card names a persona and a persona names its account, so a transfer
 * is one row and cannot half-happen.
 *
 * Credits are a ledger with unique operation keys, never a counter. Replays collide on the key
 * instead of double-counting, and a reservation is a single conditional insert, so two sessions
 * cannot both take the last credit.
 *
 * Authorisation, stated once so each caller enforces the same thing:
 *   - the signed-in account may act only on personas whose `ownerUserId` is itself;
 *   - it may dress them only in articles `availableArticles` returns for it;
 *   - a card's author is fixed at issue and never changes, whoever later holds the card;
 *   - a transfer may be accepted only by its named recipient, once, before it expires.
 */
export {
  CREDITS_PER_QUALIFYING_UNIT,
  CREDIT_RULE_VERSION,
  CREDIT_THRESHOLD_USD,
  MAX_CANDIDATES_PER_SESSION,
  MAX_PIECES_PER_CARD,
  creditThresholdTwd,
  creditsForPurchaseLine,
  entitlementQuantity,
  CARD_TIERS,
  ownedRatioOf,
  tierForRatio,
  type CardTier,
} from './rules'

export { verificationCode } from './codes'

export {
  creditBalance,
  grantPurchaseCredits,
  releaseCredit,
  reserveCredit,
  sessionHoldsCredit,
  settleCredit,
  type GrantInput,
  type ReserveInput,
} from './credits'

export {
  acceptTransfer,
  cancelTransfer,
  cardHolder,
  createPersona,
  holdingsOf,
  offerTransfer,
  personasOf,
  transferPreview,
  type AcceptResult,
  type CreatePersonaInput,
  type TransferOffer,
} from './personas'

export { fulfilPurchaseLines, type FulfilLine, type FulfilResult } from './fulfil'

export {
  availableArticles,
  grantEntitlement,
  lendArticle,
  revokeLoan,
  type AvailableArticle,
  type EntitlementInput,
} from './wardrobe'

export {
  addCandidate,
  addCollectionMember,
  candidatesOf,
  failAttempt,
  issueEdition,
  membersOf,
  openSession,
  settleCard,
  startAttempt,
  type ArticleRef,
  type CandidateResult,
  type IssueEditionInput,
  type IssueResult,
  type OpenSessionInput,
  type SettleCardInput,
  type SettleResult,
} from './issue'

export {
  SUBJECT_LABEL,
  buildCardImagePrompt,
  cardReferenceLabels,
  type CardPromptArticle,
  type CardPromptInput,
  type CardPromptSubject,
} from './prompt'
