# Perceived Latency Contract

Product principle 6: **Intelligence Without Waiting**. AI should increase capability without making
the interface feel slower. Optimize **time-to-next-action**, the time until the user can take the
next relevant action on the result, rather than model completion time.

## Classes and clocks

All clocks start at the user's click, submit or selection, before authentication, transport,
queueing or model execution. Milestones count only once their UI is painted and usable.

| Class      | Applies to                                                                                                | Required milestones                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Instant    | Save, dismiss, A/B choice, add to bag / Look, Ask submission, preset selection, filters, sort, remix fork | acknowledgement ≤100 ms; perceived completion ≤400 ms                                                      |
| Generative | Free text, natural-language search, recommendation, styling, explanation                                  | first meaningful progress ≤800 ms; gaps between meaningful updates ≤800 ms; usable result ≤5,000 ms        |
| Creative   | Edition generation and regeneration                                                                       | first meaningful progress ≤800 ms; gaps ≤800 ms; first meaningful visual ≤5,000 ms; final image ≤30,000 ms |

Composite flows have separate operations: Make It Mine is an Instant fork, followed by Generative
suggestions and an explicitly requested Creative render. A/B selection is Instant even if a later
explanation uses a model. A deterministic poster is a legitimate first visual, labelled as a
composition preview; it is a final result only when the user requested a poster.

Acknowledgement means a changed control or selection. Perceived completion means the requested
local state exists and related controls work. A usable recommendation has selectable products,
prices and constraints; a rendered clarification with answer controls or an explicit empty result
with editable constraints also permits a next action. A spinner, skeleton, echoed query, countdown,
unchanged token fragment, error or enabled navigation alone is not a usable result.

## Interaction design

1. Update constrained state locally. Persist independently, prevent duplicate submissions, and
   reconcile a rejected write with its own state and a retry. Keep unrelated controls available.
   “Sent” means the server accepted delivery; before that say “Sending” or “Queued”.
2. Run the tested deterministic parser and ranker as the initial recommendation path. Render
   parsed constraints before ranked items. AI may suggest a refined result after the initial
   result is usable. Offer an explicit apply action so late enrichment never silently reorders
   cards the user is interacting with.
3. Open the remix editor with source products immediately. Stream suggestions separately; they
   are opt-in. Creating an edition saves metadata and composition before scheduling rendering.
4. Show the composition throughout image generation. Keep products, sharing and editing available.
   Regeneration preserves the existing image until a replacement is ready. Use operation revisions
   to discard obsolete completions and isolate failures from the saved Look.
5. A spinner is not progress. Render facts only when work actually completes: parsed budget,
   candidate count, ranked pieces, composed products, decoded final image. Never manufacture stage
   changes or percentage estimates on a timer. If a provider has no intermediate output, report
   the progress gap as a contract breach; keeping the preview usable limits harm but does not turn
   silence into progress.
6. Share one deadline across provider attempts. Reserve time for persistence, transport and paint.
   Abort expired work and ignore late completion. On timeout retain the draft or last usable
   result, give a retry, and record a missed deadline. Failure is not successful completion.

## Runtime responsibilities

The web layer owns browser milestones, optimistic state, streaming, cancellation and persistence.
The engine owns validated deterministic results and bounded provider calls. Provider attempts share
one text budget (3.5 s) or image budget (25 s); these are internal budgets, not proof of a browser SLA.
No synchronous mutation waits for AI or preference training. Post-response work uses the framework's
request lifecycle; persisted image operation IDs prevent duplicate and obsolete writes. An expired
pending operation becomes retryable, including after a server restart.

The Shop [live filter path](REALTIME_FILTER_SPEC.md) uses Jev for known-option decisions and
Gemini Transcribe Live for speech. Measure transcript-to-filter and audio-to-filter separately.
Interim hypotheses may update labelled previews; only finalized or explicitly accepted changes
enter committed filters. Manual edits and newer revisions always win. General-purpose text
generation does not block this path. Browser events report filter and product paint timings;
the acceptance targets still require representative end-to-end measurement.

Cache keys must include user, constraints and source revision. Prefetch may prepare read-only data;
it must not send an Ask, create a Look, mutate preferences or invoke paid generation on a GET.

## Measurement and acceptance

Record operation ID, class, start, acknowledgement, meaningful milestones, next-action, first visual,
final, cancellation, error and deadline misses. Use monotonic browser time. Distinguish server
durations from browser durations; stream receipt is not paint. Collect no raw prompts, photos or
personal details in timing events. A progress gap includes input → first update and the tail through
completion/failure. Measure image decode and render, not just file creation.

Each interaction PR identifies its class and next action, includes browser timing evidence and
checks successful, slow, failed, cancelled and reordered requests. Exercise cold and warm routes,
signed-in and guest states, keyboard operation and reduced motion. Report sample count, device,
network profile, p50/p95/max and the fraction meeting every deadline. Averages cannot hide misses.
Do not declare a hard ceiling verified from a provider timeout or a single local run.

Required scenarios:

- Delay a Save or bag write: local acknowledgement and result appear within budget; another item
  remains usable; rejected writes restore the right item and expose a retry.
- Delay text AI past 5 s: deterministic results remain actionable, no invented progress appears,
  and a later refinement cannot overwrite a newer query or an accepted selection.
- Delay ranking: parsed constraints render first; an exceeded result deadline is visible and
  recorded, without discarding an earlier usable result.
- Delay image generation: real composition is visible first; navigation remains available; a
  30 s miss is recorded as a failure, never a completed image. Retry and concurrent generation do
  not let an obsolete job replace newer state. Reload after a worker interruption remains retryable.
- Delay or fail Ask persistence: no false “Sent” confirmation; generating suggestion text never
  participates in the send transaction.

## Delivery status

This contract defines acceptance requirements, not measured production guarantees. The prototype
ships deterministic initial results, streamed refinement, local optimistic controls and independent
image generation. Provider image adapters return only final images and structured text adapters return a complete
validated object. Continuous 800 ms progress during those enrichment calls remains a measured
limitation until adapters supply actual partial output or new rendering facts. Keep that gap visible in verification reports.
