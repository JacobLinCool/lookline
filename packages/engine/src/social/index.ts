/**
 * Social write paths shared by the web app and the simulation (docs/CONTRACTS.md). Contract
 * names are re-exported here; the internals live in sibling files.
 */
export { recordInteraction } from './interactions'
export { recordPurchase } from './purchases'
export { createLook } from './create-look'
export { suggestRemix } from './remix'
export { createAsk, answerAsk } from './asks'
export { inferRole, inferRoles, type LookRole } from './roles'
export { fallbackReward } from './feedback'
