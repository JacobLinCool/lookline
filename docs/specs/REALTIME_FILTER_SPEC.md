# Structured decisions and live voice filters

Shop implements typed and spoken live filters under
[Intelligence Without Waiting](LATENCY_SPEC.md). The browser shows speculative filters and
matching products as input changes; Apply or finalized speech commits resolved filters to the URL.

## Capability routing

| Work                                                               | Service / implementation            | Output                            |
| ------------------------------------------------------------------ | ----------------------------------- | --------------------------------- |
| Direct selection, validation, price parsing and set operations     | Application code                    | Exact filter state                |
| Known categories, colour families, aesthetics, department and sort | TypeSafe `jev-1.13.0`               | Validated Choice decisions        |
| Streaming microphone audio                                         | Gemini `gemini-3.5-transcribe-live` | Interim and finalized transcripts |
| Sentence parsing: catalog attributes, occasion, season, department | TypeSafe `jev-1.13.0`               | Intent slots (ENGINE_SPEC §1.3)   |
| Say it sentences the decision cannot finish (reference, recipient) | Luna / Gemini Flash-Lite            | Intent and suggestions            |
| Edition artwork                                                    | Flare / Gemini image                | Generated image                   |

Jev uses `POST https://api.typesafe.ai/v1/systemone`, batching independent questions. It is separate
from generative provider routing; a failed partial never silently invokes a general-purpose LLM.
`TYPESAFE_API_KEY` enables semantic filtering and `TYPESAFE_MODEL` overrides the pinned model.
`GEMINI_API_KEY` additionally enables voice. Manual controls remain available without either key.
[TypeSafe API](https://docs.typesafe.ai/api) · [Model versions](https://docs.typesafe.ai/models)

## Decision contract

`POST /api/filters/resolve` accepts `{ utterance, base, revision }`. The utterance is limited to
500 characters. `base` contains only allowed filter fields and catalog values. The response is
`{ filters, unresolved, hints, revision, model, contractVersion, latencyMs }`; `filters-v2`
identifies this question/reduction contract (`v2` added `hints`). The model sees the utterance as
data, with any existing facet values embedded in its relevant operation question.

The catalog supplies all candidate categories, colours and aesthetics, including bilingual
labels and named colours within each family. Navy maps to the blue family; this is a family-level
filter, not exact-colour matching. For each option Jev chooses include, exclude or neutral.
When a facet already has filters, a separate question distinguishes replace, add, clear and keep.
Code reconciles those choices: new positive selections replace by default, explicit additions
union selections, exclusions remove conflicting inclusions, and an exclusion-only request retains
other selections. Unmentioned facets stay unchanged.

Price candidates come from the existing deterministic parser, including separate correction
clauses. Jev selects a parsed candidate, clear, keep or uncertain. It does not invent numbers or
perform currency arithmetic. The schema rejects invalid bounds and contradictory sets.
[Known numeric limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

The adapter validates the full option set, probability ranges and sum, and that the selected
option has maximum probability. Mutating decisions require Choice confidence ≥ 0.8 and selected
probability ≥ 0.9. Keep and neutral do not mutate state and need no threshold. A low-confidence
proposed selection retains that entire facet and reports it as unresolved; unrelated resolved
facets can still preview. These initial thresholds require broader bilingual calibration.
A well-typed answer is not proof of semantic correctness.
[Choice contract](https://docs.typesafe.ai/primitives/choice) ·
[Confidence](https://docs.typesafe.ai/confidence)

Noul and Score are available future primitives for independent binary judgments and graded
compatibility. The current filter adapter uses Choice only.

## Hints

The line under the sentence field is a question, not a diagnosis: "What is the occasion?",
"Who is it for?", "Budget?", each with a row of answers. `packages/engine/src/decisions/hints.ts`
holds 28 hints in priority order — recipient, occasion, formality, four occasion follow-ups
(wedding role, office type, destination, activity), category, budget, colour, seven garment
follow-ups (warmth, length, sleeve, trouser cut, heel, bag size, neckline), mood, fit, season,
avoided colour, fabric, pattern, ordering, time of day, pairing, care, statement. Each hint is one
Choice question batched into the same Jev request as the filter questions: `stated` or `missing`,
plus `inapplicable` for follow-ups that only apply in context (a wedding, a dress). A hint whose
answer the current filters already carry (department, category, colour, budget, aesthetics, sort)
is not asked. The reduction keeps hints Jev judged `missing` with confidence ≥ 0.5, in priority
order; an absent answer or an unexpected choice drops the hint. Hints never mutate filter state and
never raise an error. The internal `unresolved` list still gates the commit but is not shown.

The browser shows one question at a time: the first open hint the shopper has not skipped. Before
the first decision (an empty or just-started sentence) it shows the context-free hints the filters
leave open, starting with "Who is it for?". Choosing an answer appends it as the sentence's next
clause — English by default, Chinese once the sentence is mostly CJK ("黑色洋裝，參加婚禮") — and
the ordinary 200 ms decision loop reads the whole sentence again, so the next question follows
from Jev's answer, not from a script. Question copy and answer phrases live in
`apps/web/src/components/shop/hints.ts`. Occasion and recipient answers do not yet move a filter
(the resolver only acts on explicitly named options); they enrich the sentence for a later
purpose-aware compiler.

## Streaming interaction

```mermaid
flowchart LR
  Audio[Microphone] --> ASR[Gemini Transcribe Live]
  ASR --> Text[Final text plus current interim hypothesis]
  Typed[Typed text] --> Text
  Text --> Exact[Parsed price candidates]
  Text --> Jev[Known-option decisions]
  Exact --> Jev
  Jev --> Reduce[Validation and revision check]
  Reduce --> Preview[Filter chips and catalog preview]
  Preview --> Commit[Final speech or explicit apply]
  Commit --> URL[Committed filters and shareable URL]
```

1. Input text paints immediately. The decision queue coalesces input over 200 ms, keeps at most
   one active request and only the newest queued revision. It does not wait for speech to stop.
2. Each request resolves the complete current utterance against the snapshot taken when the
   interaction began. It does not accumulate speculative patches.
3. A current response updates labelled preview chips, then fetches catalog results independently.
   Previous products remain visible while newer results load. Older responses cannot overwrite
   newer input, even if transport cancellation loses a race.
4. Finalized speech or Apply performs final reconciliation. Fully resolved decisions commit to
   the URL; unresolved facets stay at their prior values with a clarification message. The user
   may explicitly accept resolved filters or discard the preview.
5. Manual filter links and sort edits invalidate pending decisions and end voice capture. Browser
   back/forward navigation restores URL filters. Cancel restores the latest committed state.
6. Interim changes do not persist intent sessions, impressions or preference feedback. Network
   errors preserve usable products and expose retry. Requests exceeding 500 characters stop
   automatic interpretation and ask the user to review or shorten them.

For “黑色外套……不要黑色，改成海軍藍，三千以內”, the corrected preview removes black,
selects blue, excludes black and applies an exact TWD 3000 ceiling.

## Audio and service boundaries

Voice languages default to Traditional Chinese (Taiwan, `cmn-Hant-TW`) and English (`en-US`).
The multi-select also offers Japanese, Korean, Cantonese, French, German and Spanish. At least one
language remains selected; the browser remembers the choice locally. Capture snapshots the selection
and disables language edits until it stops. Both the token constraints and Live setup receive the
same language codes. Invalid or empty selections return HTTP 400 before token issuance.
Gemini's documentation describes multi-language hints; `cmn-Hant-TW` was additionally accepted by a
real Live setup on 2026-09-18, although the published language table lists only simplified Mandarin.

Pressing Speak requests microphone permission. The server authenticates the session and issues a
single-use Gemini token, constrained to the transcription model and TEXT response modality. It
allows connection within 60 seconds and expires after five minutes. The installed SDK uses
`v1alpha` for ephemeral-token connections; permanent keys stay on the server.

An AudioWorklet emits mono, 16-bit little-endian PCM at 16 kHz in 100 ms packets.
`interimInputTranscription` replaces the current hypothesis. `inputTranscription` contributes
finalized fragments; `finished: false` delays segment commit. Normal Stop releases microphone
tracks, flushes buffered PCM, sends `audioStreamEnd` and allows 2.5 seconds for final transcription.
Cancel closes immediately. Connection setup has a 10-second deadline. Errors, expiry and
navigation release audio tracks, the audio graph, timers and the socket.
[Gemini live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe)

Both endpoints require authenticated, same-origin POSTs. Prototype limits are process-local:
300 filter requests and six voice-token requests per user per minute, with one active request per
capability. Jev has a 1.2-second provider deadline. These limits must become shared limits before
multi-instance deployment. Audio and transcripts are not persisted by Lookline; provider data
handling remains governed by the configured service account.

`ProductSearch`, SQL, URL encoding and controls share plural inclusion and exclusion arrays.
Values within one included facet use OR; different facets use AND. Exclusions are enforced by SQL.
The canonical URL repeats `categoryGroups`, `colorFamilies`, `aesthetics` and their `excluded…`
counterparts. There is no singular-parameter compatibility path.

## Verification and performance

Unit coverage includes request/response validation, uncertain mutations, exact prices, multi-value
SQL filtering, URL round-trips, transcript replacement and serialized request revisions.
`scripts/qa/live-filters-browser.ts` exercises a real catalog with controlled model events and a
synthetic browser microphone. It separately probes real Jev and Gemini service access.
With `QA_VOICE_WAV` pointing to a 16 kHz mono PCM WAV, it also checks real speech through both
services. On 2026-09-18, a synthesized English sentence transcribed as “black outerwear under 3000
Taiwan dollars” and produced the outerwear, black and TWD 3000 filter chips. The fixture includes
leading silence so speech starts after connection setup. A later smoke test with the default Traditional Chinese + English hints transcribed synthesized
Mandarin as “我想要海軍藍外套，預算 3000 元以內。” and updated the category and price filters.
Chinese ASR accuracy has not been benchmarked; correction behavior was also checked with real Jev
and controlled transcript events.
`scripts/qa/jev-smoke.ts` covers bilingual corrections, negation, alternatives and existing filters.

Real Jev runs on 2026-09-18 resolved the English multi-colour request, Chinese correction and mixed
language example with no unresolved fields. The three-request run took 303–939 ms per provider
call. Add, replace and clear examples also resolved; some unrelated scalar questions abstained
on a price-only request. These small smoke tests are not an accuracy benchmark or latency SLA.

Browser `lookline:filters` events report revision, model, decision time, filter paint time and
product paint time without utterance or audio content. Targets remain:

- Control acknowledgement ≤ 100 ms; manual filter paint ≤ 400 ms.
- Transcript revision received → filter preview p95 ≤ 400 ms.
- Transcript revision received → usable product preview p95 ≤ 800 ms.

The measured provider calls alone already exceed the filter target in some cases. Full audio-to-
transcript, audio-to-filter and final-to-commit latency still need representative measurement,
including Chinese, English, interruptions and network variability. No end-to-end speed guarantee
is established. Broader labelled evaluation should report precision/recall, abstention, correction
accuracy, p50/p95 latency and cost before expanding this route beyond Shop.
