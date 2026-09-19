# Lookline Product Journey

This document is the product contract for Lookline's physical-first digital fashion experience. It
records what customers may do, what they may see, what remains internal, and how ordinary catalog,
custom, collectible and Circle journeys connect.

## Product promise

Lookline starts with something that can exist in the physical world and turns it into a useful
digital experience: discovery, virtual try-on, purchase, a collectible Look Card, and social
movement through a trusted Circle. Digital objects never silently invent a purchasable product.

## Non-negotiable rules

1. **Physical first.** A Ready Now experience always resolves to a real catalog product and an
   available SKU variant. Color, size, finish and configuration shown as purchasable must exist.
2. **Preview is not ownership.** A user may preview before buying. A collectible Look Card is issued
   only after payment and order confirmation.
3. **Custom is a manufacturing workflow.** A Made for You request may start from text or reference
   images, but it becomes orderable only after a base pattern, materials, color/graphic treatment,
   rights, price and lead time are confirmed.
4. **References are inspiration, not copying instructions.** Uploaded imagery is used to extract
   constraints and intent. Lookline must not promise an exact copy of another creator's work.
5. **Borrowing is digital.** Borrow a Look lets someone preview a friend's shared, purchased item on
   their own representation. It does not transfer physical custody or ownership.
6. **Sharing is consensual.** Purchases are private by default. Their owner chooses which items and
   cards enter a Circle Wardrobe or are shared outside Lookline.
7. **Audience boundaries are strict.** Customers see products, approved options, availability,
   price, lead time, ownership, sharing and understandable status. They never see ontology traces,
   model/provider data, raw influence edges, risk controls, unit economics, fraud logic, internal
   IDs or coupon mechanics.

## Product vocabulary

- **Ready Now:** A catalog product with a currently purchasable SKU variant.
- **Made for You:** A custom request grounded in a real base pattern and confirmed manufacturing
  capabilities.
- **Preview:** A non-ownable try-on or styled image produced before purchase.
- **Look Card:** The collectible image issued after purchase. It records the owned physical product
  or confirmed custom SKU and may use a photographic or artistic style.
- **Circle:** A private group of people who choose to do fashion together.
- **Circle Wardrobe:** Purchased items their owners have explicitly shared with the Circle.
- **Borrow a Look:** Digital try-on of an exact product shared from a Circle Wardrobe.
- **Circle Edition:** A manufacturable, explicitly scoped colorway, graphic or small-batch product
  promoted from demonstrated Circle demand. It is not a free-form recolor.
- **Influence Graph:** Internal event-derived model of how discovery, sharing, borrowing and buying
  move through people and Circles. It is never a customer-facing graph inspector.

## Apparel coverage target

The ontology and catalog are expected to represent normal ready-to-wear plus adjacent apparel
families without forcing them into unsuitable generic labels:

- Everyday, formal, work, occasion and outerwear
- Activewear, performance apparel, swim and outdoor layers
- Pajamas, sleepwear, loungewear, robes and intimates
- Adaptive, maternity, uniforms and specialty garments
- Shoes, bags, jewelry and outfit accessories
- Smart apparel and garments with sensors, heating, lighting or other embedded functions

Coverage is a taxonomy and data obligation, not permission to claim inventory. A category may be
understood by search even when there is no matching product; that gap routes to Made for You or a
transparent no-result state.

## Audience boundary

| Concern          | Customer experience                                                                       | Internal tools only                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Discovery        | Plain-language intent, matching products and useful explanations                          | Parsed ontology, probability distributions, raw prompts and JSON     |
| Product truth    | Product, available variants, price, stock and delivery promise                            | Supplier cost, margin, allocation rules and source identifiers       |
| Custom           | Brief, reference upload, base pattern, approved options, feasibility, quote and lead time | Factory routing, MOQ logic, costing, risk review and rights evidence |
| Preview and card | Preview status, purchased card, edition and sharing controls                              | Provider/model metadata, generation prompt and moderation traces     |
| Circle           | People, shared wardrobe, borrow status, offer and consent                                 | Raw graph edges, weights, influence scores and targeting rules       |
| Offers           | The saving, eligibility outcome and expiry                                                | Coupon construction, experiments and anti-abuse logic                |

## Journey A — Ready Now

1. The customer describes a need with text, an image, a Circle reference or catalog browsing.
2. Lookline returns only real products for the purchasable path and explains material customer-level
   constraints such as color, silhouette, size and occasion.
3. The customer selects an exact product variant and starts a virtual preview.
4. The preview remains clearly non-ownable and links back to the exact product and variant.
5. The customer purchases. Checkout reconfirms variant, price, availability, recipient and privacy.
6. After order confirmation, Lookline issues a Look Card bound to the purchased item.
7. The owner keeps it private, shares it to selected Circles, or exports a social-ready image.
8. Views, borrows and purchases become internal trend events without exposing the graph.

## Journey B — Made for You

1. The customer cannot find a satisfying product and chooses Made for You.
2. They describe the desired change and may upload references. The UI explicitly treats references
   as inspiration and asks the customer to confirm usage rights.
3. Lookline identifies a real base pattern or marks the request as requiring pattern development.
4. The customer selects from approved manufacturing dimensions such as available material, color,
   print/embroidery placement and sizing; there is no arbitrary color picker.
5. The atelier reviews feasibility and returns one of four states: needs information, feasible,
   feasible with changes, or unavailable.
6. Only a feasible specification receives a quote, lead time, cancellation terms and a formal custom
   SKU. The authoritative preview is regenerated from that confirmed specification.
7. The customer approves and pays. Production milestones are customer-readable.
8. After order confirmation, Lookline issues a distinctive custom Look Card. Edition claims such as
   1 of 1 or 1 of 20 must match the real production commitment.

## Journey C — External inspiration

1. The customer uploads or links an image they found elsewhere.
2. Lookline extracts customer-reviewable constraints: garment family, silhouette, material feel,
   palette, graphic placement and use occasion.
3. Exact or near catalog matches remain Ready Now.
4. Unmet intent enters Made for You with the reference, extracted constraints and rights statement.
5. Lookline never describes the result as an exact reproduction unless the customer owns the design
   and manufacturing has approved that exact specification.

## Journey D — Borrow a Look

1. A friend opts an owned product into the Circle Wardrobe.
2. The customer opens that exact product and digitally borrows it for a preview.
3. The preview uses the shared product's real variant; another existing catalog variant may be chosen
   only as a separate product option, never as a free recolor.
4. A time-bounded Circle offer may be shown after the preview. The customer sees only the saving,
   conditions and expiry.
5. Buying creates the customer's own order and, after confirmation, their own Look Card.
6. The friend retains their original ownership and sharing control throughout.

## Journey E — Coordinated Circle style

1. Circle members combine owned Looks around a real occasion such as travel, a wedding or a
   festival.
2. Each contribution stays linked to an owned or purchasable product.
3. Members may create a shared Together edition and individually purchase missing pieces.
4. The shared output can be kept within the Circle or exported with every participant's consent.
5. The internal influence model records the path without making social scores visible.

## Journey F — From unmet demand to a Circle Edition

1. Similar custom briefs or repeated borrows create an internal demand signal.
2. The team evaluates a manufacturable small batch using a real base pattern and approved options.
3. Interested customers receive a transparent proposal with specification, target quantity, price,
   delivery window and refund condition if the batch does not proceed.
4. A successful batch becomes a real Circle Edition SKU before it can be purchased or represented as
   owned.
5. Its special Look Card reflects the actual edition size and provenance.

## State contract

| Object               | States visible to the customer                                                       |
| -------------------- | ------------------------------------------------------------------------------------ |
| Ready product        | Available → low stock → unavailable                                                  |
| Preview              | Not started → preparing → ready → could not prepare                                  |
| Custom brief         | Draft → submitted → needs information → under review                                 |
| Custom specification | Feasible → feasible with changes → unavailable                                       |
| Quote                | Estimate → confirmed → expired                                                       |
| Order                | Awaiting payment → confirmed → in production/packing → shipped → delivered/cancelled |
| Look Card            | Locked before purchase → issuing → owned → shared/private                            |
| Borrow               | Available in Circle → previewing → offer available/expired → purchased               |
| Circle Edition       | Proposed → gathering interest → confirmed → in production → closed                   |

## Prototype mapping

- `/together` is the public, no-auth interactive journey prototype. It demonstrates Ready Now, Made
  for You and Borrow a Look with live catalog products and sample fulfillment states.
- `/looks/[id]/together` remains the real signed-in flow for combining existing Looks.
- `/admin` is the internal playground for ontology, probability and image-provider experiments. It is
  intentionally absent from public navigation.
- `docs/LOOKLINE_SCENARIOS.html` is the six-scenario customer journey map: Ready Now, Made for You,
  external inspiration, Borrow a Look, coordinated Circle style, and Circle Edition. Its source of
  truth is `docs/LOOKLINE_SCENARIOS.archify.json`.
- `docs/LOOKLINE_JOURNEY.html` is the complete judge-facing system swimlane flow. Its source of truth
  is `docs/LOOKLINE_JOURNEY.archify.json`.

## Deferred beyond the hackathon

- Production supplier, costing, rights-review and order-management integrations
- Durable custom SKU, quote and edition tables
- Consent workflows for multi-person exported imagery
- Offer experimentation, abuse prevention and payout/attribution policy
- Smart-garment device provisioning and post-purchase lifecycle

These are real product obligations. The prototype may demonstrate their customer-facing states but
must label sample values and must not imply that the operational integrations already exist.
