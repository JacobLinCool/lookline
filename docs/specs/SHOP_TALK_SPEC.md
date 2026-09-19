# Live shopping conversation

`/shop-talk` is an experimental, authenticated alternative to `/shop`. It preserves the catalog,
filter registry, sorting and URL format, with a right conversation panel on desktop and an
expandable bottom panel below 1280px. Conversation is held only in page memory. No transcript is
stored in the URL, database or browser storage.

The desktop workspace occupies the available viewport below the shared site header. Its title
and toolbars consume their own layout space; filters, products and transcript scroll independently
within the remaining area. Composer and audio controls stay visible. Short visual viewports use
one row for input and audio controls, retaining a readable transcript. Keyboard resizing uses
VisualViewport dimensions and only reserves bottom navigation that is actually visible.

## Services and contracts

- `POST /api/shop-talk/token` accepts `{}` and issues a single-use, 30-minute ephemeral credential.
  The server pins `gemini-3.8-live`, its generated shopping instructions, audio response mode,
  both transcripts, and the complete tool list containing only Google Search. Explicit REST
  field masks avoid the SDK's invalid `tools.0` mask. Session resumption remains client-controlled.
  Search is instructed to clarify unfamiliar named references (people, characters, works) and
  translate their clothing into catalog attributes. Product discovery stays in the site catalog;
  ordinary garment requests never warrant external product searches. Grounding metadata, source
  links and Google suggestion cards are not rendered in the conversation.
- `POST /api/shop-talk/resolve` accepts `{ base, events, revision, epoch }` and returns the shared
  `FilterDecision`, echoed versions and an empty hints array. The initial filters and complete
  chronological events are re-evaluated without feeding previous model decisions back as input.
- `POST /api/shop-talk/keywords` accepts the same context and extracts keyword refinements after
  a completed turn or at least 500 ms without a transcript change.

All three endpoints use the existing session, same-origin and process-local rate-limit checks.
Events have stable IDs and distinguish role-bearing messages (partial, complete, interrupted)
from manual filter changes. The event limit is 24 KiB and the streamed request limit is 64 KiB.
Lexical candidates are collected per message, deduplicated and limited to 64, with explicit
errors instead of silent truncation. Budgets are parsed locally before Jev selects a candidate.

The 300 ms scheduler permits one active request and one latest pending snapshot. It allows
intermediate results during continuous transcription; the separate manual-operation epoch
prevents an old response from undoing a manual change. Equivalent filters do not refetch products.
Concrete assistant recommendations count, questions and unchosen options do not, and explicit
user constraints and subsequent corrections take precedence. Unresolved preferences are expected
while exploring and do not display warnings; service and connection failures retain recovery UI.

## Audio and lifecycle

Typing establishes a silent connection. Start voice enables microphone and playback; subsequent
controls operate independently. Muting stops capture/upload or clears queued playback immediately.
Interrupted text remains visible. Ending, restarting or leaving closes sockets, audio contexts,
media tracks and pending requests. GoAway and token renewal attempt same-model resumption; an
unusable handle reconnects using the complete recorded conversation. An ordinary disconnect
retains the conversation and exposes reconnect.

## Verification

Run the engine and web Vitest suites from their package directories. `scripts/qa/shop-talk-jev.ts`
uses the configured real Jev service. `scripts/qa/shop-talk-browser.ts` uses temporary local test
sessions and deterministic socket/decision fixtures; it cleans up the session afterward.
`QA_LIVE=1` additionally requests a real constrained token and Gemini response. Scripts require
an already running local web server and its local D1 database. Screenshots and the browser report
are written under `output/playwright/shop-talk/`.

On 2026-09-20, production build and web type checking passed, along with 37 focused tests and
seven browser scenarios covering desktop/mobile controls, transcript-driven filters, manual
changes, independent audio switches, restart and the original shop input. All five real Jev
cases passed; observed decision times were 323–1184 ms. The 300 ms value is a scheduling interval,
not an end-to-end latency claim.

Real restricted token issuance succeeded. Live setup was rejected by Google's quota check, so
real input/output audio, Search grounding and resumption remain unverified. The local D1 lacked
the current articles schema/data; captured catalog states are empty/error states. Loaded product
cards and end-to-end catalog latency must be checked after restoring the local catalog. Neither
of these environment limitations is hidden by a model fallback or synthetic production data.

### Layout and conversation regressions

`scripts/qa/shop-talk-layout.ts` checks seven viewport sizes from 1512×909 down to phone landscape
667×375, using explicit catalog/Live fixtures. It asserts controls are inside both the viewport
and clipping ancestors, a readable transcript, retained reading position and reachable pagination.
A simulated 320px visual viewport verifies the keyboard adjustment; this is not a physical-device
keyboard test. The browser integration script also verifies that grounding metadata cannot render
external results and that unresolved preferences produce no warning. The actual localhost catalog
was separately captured with 24 real product cards after the height correction.
