# Home discovery

The empty-query home retains its natural-language search and loads four independent endpoints:
`GET /api/discovery/{trending,preferences,recent,friends}`. Personal endpoints require the session
user; all responses are `private, no-store`. A failed row offers retry without replacing other rows.
Responses include a `Server-Timing: discovery` duration for deployment measurements.

## Data and ranking

- **Trending:** global stored `articles.trendScore`, then `popularity`, then article ID. Import
  (`packages/hm/src/stats.ts`) derives momentum from the source dataset's last 30/90-day sales and
  logarithmic total-sale popularity. The offline analytics pipeline can subsequently replace trend
  scores from the last 14 days of positively weighted events, logarithmically normalized to the
  95th percentile (`packages/engine/src/analytics/index.ts`). Home introduces no new behavior aggregation and
  does not imply the imported historical dataset is live sales. It reads an indexed top 12.
- **Preferences:** the latest 200 feedback events for the current user, using the existing reward
  targeting rules. Impressions and gifts do not become self preferences; the newest meaningful
  event per article wins, and nonpositive latest events contribute no positive evidence. At least
  three positive distinct articles are required. Categorical aesthetic/color weights decay with a
  30-day exponential time constant. The highest supported dimensions select two disjoint rails
  from a popularity-ranked pool of at most 400 articles. Product codes deduplicate variants within
  and between rails. An unsupported second dimension stays an honest learning state.
  The public pool's actual Promise is coalesced and cached for 60 seconds per database/isolate;
  user feedback and results are never cached across users.
- **Recent:** `(user_id, article_id)` holds the greatest actual visit timestamp. A mounted product
  page POST records the authenticated visit and existing VIEW interaction; route prefetch no longer
  records VIEW. A → B → A yields A, B once each. Migration backfills existing VIEW history once.
- **Friends:** explicit canonical pairs with recipient-accepted invitations, independent of inferred
  relationship/trust edges. The homepage selects the 32 most recently accepted friends, takes up to
  12 purchases and 12 public finalized cards per friend within 30 days, merges by time and returns
  the newest 12. Purchases are off until the friend opts in. Card candidates never enter the query;
  private and link-only cards are excluded. Permissions are queried afresh, including after returning
  to the page. A removed friend or revoked share is absent on the next successful request.

`/me/friends` provides exact-handle invitation, recipient acceptance, removal and purchase-sharing
controls. These exported engine operations are the explicit-friend integration boundary for #32;
this issue does not implement that issue's remaining wardrobe/social flows. Card visibility is
controlled by the current persona holder. Existing cards default to `link`, preserving their
intentional detail links without enrolling them in discovery. Private card detail/image endpoints
require current ownership, and card artwork/OG responses are not publicly cached.

## Query budget and validation

There is no per-home full catalog/vector or interaction-history scan. Composite indexes support
trending top 12, recent top 12, latest feedback 200, and each friend's dated purchases/public cards.
The cold public preference pool reads at most 400 candidate article rows plus brand lookups. Friend
assembly has at most 65 SQL statements (one accepted-friend lookup plus two per friend), at most
768 activity candidates before merging, and 12 returned items. These are logical query bounds,
not measured D1 billable rows; join/index accesses and friendship lookup/sort also incur reads.
The friend and personal rows are separate requests and cannot block global trending.

Reproduce local cost sampling with `node --import tsx scripts/qa/discovery-cost.ts`. On September 20,
2026, a migrated in-memory SQLite catalog of 100,000 articles (20 repetitions) measured:

| Query       | First request |  Median |
| ----------- | ------------: | ------: |
| Trending    |       0.87 ms | 0.13 ms |
| Preferences |       2.99 ms | 0.62 ms |
| Recent      |       0.16 ms | 0.09 ms |

These exclude browser/network/D1 latency and do not establish production budgets. Real D1 rows-read
and production latency remain rollout measurements; no live database was changed for this PR.
Engine tests verify query-plan index selection, semantic deduplication and permission revocation.
`discovery-browser.ts` uses the seeded catalog's real photographs and controlled row responses at
375 × 812 and 1440 × 1000. It verifies keyboard/buttons, zero movement of other rails when a delayed
preference row resolves, no horizontal page overflow, isolated failure/retry and no JS errors.
Images are decoded before screenshots, taken at document top. This fixture test is separate from
real-database semantic tests and is not a production personalization accuracy measurement.

## Rollout

Apply `packages/db/drizzle/0015_home_discovery.sql` after the preceding schema migrations before
serving this revision. The one-time VIEW backfill scans historical interactions during migration,
not during page requests. Snapshot/journal metadata and database export table ordering are included.
The complete migration chain is exercised by `createTestDb` integration tests. A pre-existing local
Wrangler migration-history mismatch (`0003_vision.sql: no such table: articles`) prevented applying
the chain to that unrelated local D1 state; no database reset or remote migration was performed.
