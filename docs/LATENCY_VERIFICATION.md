# Latency verification

The acceptance contract is [LATENCY_SPEC.md](specs/LATENCY_SPEC.md). Local measurements are evidence,
not production SLA claims.

## Current behavior

- Save, dismiss, bag and art-direction controls acknowledge locally before persistence completes.
- Deterministic intent parsing and ranking produce the first usable result; optional provider
  enrichment cannot overwrite a newer request or an accepted selection.
- Card sessions persist composition and complete art-direction state before provider generation.
- Every attempt has its own operation identity. Late results cannot replace another attempt or an
  issued Card.
- The current candidate remains visible while Next shot controls are edited or generation runs.
- Provider failures and deadlines remain explicit and retryable; no generated output is fabricated.

## Required browser evidence

For any interaction change, capture desktop and mobile timings from the initiating event through
paint. Test success, provider delay, failure, cancellation, stale completion, keyboard use and
reduced motion. Record p50, p95, maximum and sample count. Screenshot evidence must show the image as
the visual priority and the art-direction controls as a compact secondary surface.

The repository does not claim a provider success-time guarantee from a timeout value. A 25-second
internal image budget only bounds failure handling.
