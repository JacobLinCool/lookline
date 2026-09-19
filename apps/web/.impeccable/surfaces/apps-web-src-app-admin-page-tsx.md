---
version: 1
slug: 'apps-web-src-app-admin-page-tsx'
primary_target: 'apps/web/src/app/admin/page.tsx'
related_targets:
  [
    'apps/web/src/components/admin/playground.tsx',
    'apps/web/src/app/api/admin/search-intent/route.ts',
    'apps/web/src/app/api/admin/image/route.ts',
  ]
---

## Scope and mode

`/admin` is an Operate surface inside The Rack, Lookline's visual system.

## Audience and job

The hackathon team needs to inspect the real fashion ontology, run natural-language intent probes,
understand probability/relevance changes, and generate image experiments without leaving the site.

## Primary tasks and content

- Search and scan ontology dimensions and values.
- Compile a query and compare type priors, categorical distributions, ordinal constraints and sparse predicates.
- Inspect the exact JSON output when debugging.
- Generate, preview and download an image from a prompt and selected aspect ratio.

## Direction

The Engine lab: the same workbench (ontology rail, compiler, image studio) restyled in The Rack's
tokens — Inter throughout, sentence-case labels, ink primary button, monospace only for ontology tokens
and JSON. Reached from the footer ("Engine lab"); the memorable moment is still a query resolving into
relevance-gated distributions.

## Constraints

No authentication for the hackathon. Use real providers and honest loading/error states. Do not persist
playground images. Preserve responsive keyboard-accessible operation. Provider configuration may be absent.

## Unresolved

Authentication, saved experiments and shared evaluation corpora are deliberately deferred beyond the
hackathon.
