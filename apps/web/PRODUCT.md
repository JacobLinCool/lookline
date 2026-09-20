# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Lookline serves people exploring and buying fashion together. During hackathon development, the
team also needs an internal playground to inspect the search ontology and test model behaviour.

## Product Purpose

Lookline turns natural-language fashion intent into explainable discovery, recommendations and
collaborative Card editions. Success means a user can describe a need naturally and quickly reach
relevant, understandable options, preview a real product, purchase it, create a collectible Card and
share that style with accepted friends.

## Positioning

The product combines a typed fashion ontology, probabilistic intent constraints, personal taste and
social context instead of treating fashion search as keyword matching alone. Physical products are
the source of truth: previews, digital wardrobe objects and collectible imagery are derived from
real catalog SKUs and their actual variants.

## Operating Context

The public product includes natural-language search, catalog browsing, Cards, Collection Editions,
personal wardrobes and trend analysis. The hackathon team uses a no-authentication admin playground
to inspect attributes, probe the intent compiler and generate image experiments.

## Capabilities and Constraints

- The stack is Next.js with shared catalog, engine and database packages.
- Search intent compilation uses one TypeSafe Jev round trip plus deterministic local parsing.
- Image generation uses the configured shared image provider.
- The current admin playground intentionally has no authentication because it is a hackathon tool.
- Virtual garments may only represent an existing physical product and purchasable SKU variant;
  generation must not invent colors, configurations or products.
- A pre-purchase image is a Preview. A Card remains tied to the selected article snapshot and may be
  created individually or as a Collection Edition.
- Made for You begins with a real base pattern or an explicit pattern-development review. References
  are inspiration and constraints, never an automatic promise to reproduce someone else's design.
- Approved custom options come from manufacturing capabilities; there is no arbitrary consumer
  recolor path. A custom item becomes purchasable only after feasibility, specification, price and
  lead time are confirmed.
- Social recommendations use only accepted friendships, purchases their owners explicitly shared,
  and public Cards. Private saves never become social evidence.
- Consumer surfaces and internal instrumentation are separate products. Public UI shows useful
  fashion outcomes, ownership and explicit sharing—not model details, ontology traces or operational
  controls.
- Provider-backed operations must expose real loading and error states and must not fabricate output.

## Brand Commitments

The product name is Lookline. Existing interface copy is English, while the fashion ontology and
intent input support Traditional Chinese and English.

## Evidence on Hand

The repository contains a generated 100,000-product fashion catalog, its complete taxonomy, the
probabilistic search-intent compiler, recommendation flows and working image-provider integration.

## Product Principles

- Natural language should widen or narrow the search space without inventing hidden hard filters.
- Every recommendation or constraint should remain inspectable.
- Immediate deterministic work should not wait on generative refinement.
- Internal tools should reveal real system behaviour rather than staged demonstrations.
- Digital value follows physical reality: a real product exists first, then its preview, wardrobe
  representation and collectible card may be created.
- Let unmet demand become a manufacturing opportunity: route it to Made for You or a transparent
  Collection Edition proposal instead of fabricating inventory or ending the journey silently.
- A special card may communicate custom or limited-edition value only when its stated edition size
  matches the real production commitment.
- Expose concepts at the audience's level. Internal reasoning and demand instrumentation stay in
  internal tools even when they power a user-visible experience.

The full audience, lifecycle and journey contract is recorded in `../../docs/PRODUCT_JOURNEY.md`.
