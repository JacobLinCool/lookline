# Engine specification

## Scope

`@lookline/engine` implements typed intent, catalog retrieval, recommendation, outfit assembly,
preference learning, image composition, Card issuance and canonical demand analytics. It does not
own authentication or transport.

## Intent

An utterance compiles into hard constraints, weighted soft preferences, assumptions and optional
clarifications. The deterministic parser is authoritative for supported vocabulary; a configured
provider may enrich ambiguity without silently creating hard filters. Reference vectors are named
for Cards and always include source provenance.

## Retrieval and ranking

Hard constraints filter the catalog first. Ranking combines attribute match, style similarity,
budget fit, trend momentum, explicit social evidence, compatibility and diversity. Every contribution
must be decomposable and every user-facing explanation must be grounded in supplied evidence.

Social evidence is limited to accepted friendships plus either a public Card or a purchase whose
owner enabled activity sharing. Private feedback and implicit connections are excluded.

## Preference learning

Canonical feedback kinds are `impression`, `click`, `save`, `dismiss`, `add_to_bag` and `purchase`.
The preference update pipeline reads only those events and retains contextual bandit provenance.

## Imagery

Reusable image functions live in `src/imagery`. Preview styling uses `PreviewArtPreset`. Card image
composition lives in `src/cards` and accepts a complete `CardArtDirection`.

### Validation

- Focus: `auto`, `silhouette`, `layering`, `fabric-motion`, `pattern-detail`, `accessories`.
- Pose: `auto`, `standing`, `walking`, `turn`, `seated`, `dynamic`, `custom`.
- Scene: `auto`, `studio`, `street`, `architecture`, `interior`, `nature`, `stage`, `custom`.
- Note: null or at most 160 trimmed characters; custom pose/scene requires a note.

Unsupported values and control characters are rejected. Notes that try to override identity,
garments, permission or provenance are rejected.

### Deterministic automatic direction

The resolver hashes sorted article IDs, subject count and candidate ordinal. Article metadata may
select a relevant focus before hashing: visible patterns favor pattern detail, accessories favor an
accessory composition and outerwear favors layering. Pose and scene vary by ordinal. The resolved
direction is persisted before generation.

### Prompt contract

Identity and exact article fidelity precede focus, pose, scene and safety constraints. Group sessions
map pose semantics to varied multi-person composition. Custom notes are quoted as untrusted visual
direction and cannot modify protected constraints.

## Card lifecycle

Starting a session reserves credit and records its initial direction. Starting an attempt verifies
session ownership, entitlement and candidate limits inside the transaction. Provider success writes
one candidate with provider provenance. Selection settles the session and issues exactly one Card.
Earlier attempt snapshots are immutable.

Collection Editions reuse the same attempt and validation logic. Consent, membership and revocable
loans are checked at use time.

## Analytics

Demand events come from:

- article IDs present in intent results;
- canonical feedback with an article ID;
- purchases, including quantity and GMV;
- article snapshots in issued Cards.

Events are mapped to aesthetic, category, color, silhouette, aesthetic/category, detail and motif
dimensions. Daily signals record weighted volume, unique-user breadth, conversion, GMV, momentum and
source counts. Manufacturing recommendations rank aesthetic/category pairs from these signals.

## Testing requirements

- all art-direction enum members and invalid values;
- note length, custom requirements and override rejection;
- deterministic automatic variation and group semantics;
- attempt snapshot immutability and candidate-limit races;
- session, visibility, entitlement and loan authorization;
- public Card and opted-in purchase social evidence only;
- canonical analytics and simulator inputs only;
- fresh-database migrations and hard-cut absence checks.
