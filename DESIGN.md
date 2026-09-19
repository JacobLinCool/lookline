---
name: Lookline
description: The Rack — a well-lit store wall, one steel rail, paper tags; the garment is the only colour on the page.
colors:
  ink: '#171717'
  wall: '#f7f6f3'
  card: '#ffffff'
  panel: '#efeeea'
  rail: '#d6d5cf'
  muted: '#6d6e69'
  tag-red: '#c8321e'
  tag-red-soft: '#f8e3de'
typography:
  display:
    fontFamily: 'Bricolage Grotesque, PingFang TC, Noto Sans TC, Helvetica Neue, Arial, sans-serif'
    fontSize: '2rem'
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: '-0.02em'
  section-title:
    fontFamily: 'Bricolage Grotesque, PingFang TC, Noto Sans TC, Helvetica Neue, Arial, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.015em'
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, PingFang TC, Noto Sans TC, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  control:
    fontFamily: 'Inter, ui-sans-serif, system-ui, PingFang TC, Noto Sans TC, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 'normal'
  tag:
    fontFamily: 'Inter, ui-sans-serif, system-ui, PingFang TC, Noto Sans TC, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 'normal'
  meta:
    fontFamily: 'Inter, ui-sans-serif, system-ui, PingFang TC, Noto Sans TC, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 'normal'
rounded:
  tag: '3px'
  control: '6px'
  tile: '8px'
  sheet: '12px'
spacing:
  2xs: '0.25rem'
  xs: '0.5rem'
  sm: '0.75rem'
  md: '1rem'
  lg: '1.5rem'
  xl: '2rem'
  2xl: '3rem'
components:
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.wall}'
    typography: '{typography.control}'
    rounded: '{rounded.control}'
    padding: '0 1rem'
    height: '2.5rem'
  button-secondary:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    typography: '{typography.control}'
    rounded: '{rounded.control}'
    padding: '0 1rem'
    height: '2.5rem'
  tag:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    typography: '{typography.tag}'
    rounded: '{rounded.tag}'
    padding: '0 0.5rem'
    height: '1.5rem'
  input:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    typography: '{typography.control}'
    rounded: '{rounded.control}'
    padding: '0 0.75rem'
    height: '2.5rem'
    width: '100%'
  tile:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.ink}'
    rounded: '{rounded.tile}'
    padding: '0'
  panel:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.ink}'
    rounded: '{rounded.tile}'
    padding: '1.25rem'
  rail:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    height: '1px'
    width: '100%'
---

# Design System: Lookline

## Overview

**Creative North Star: "The Rack"**

Lookline is a well-lit store. A white wall holds the work, one steel rail runs across it, and every
garment hangs with a paper tag. The garment is the only colour on the page; the interface is the
rail and the tags. Nothing explains itself: the largest element on every screen is a piece of
clothing or a Look, the one ink button is the next step in the chain (say it → real pieces → own
it → a Look → friends pick it up → buy again), and text is a caption, never a paragraph.

**Key characteristics:**

- Warm-neutral white wall (#f7f6f3) with white paper tags and a recessed panel tone
- Ink for every primary action; tag red for the one thing that needs attention
- One-pixel rail lines separate groups; borders are for tags and inputs, not for layout
- Bricolage Grotesque signage for titles, Inter for everything operated
- Image-first tiles that lift off the rail on hover — the only shadow in the system
- Rails (horizontal rows) for curated sets, grids for catalogs
- Engine internals live behind a footer switch ("Engine view") and never on consumer pages

## Colors

A Restrained strategy: neutrals plus one accent. Hierarchy comes from image size, ink weight and
spacing, never from extra hues.

### Primary

- **Ink** (`#171717`): text, the primary button, selected states, focus outlines.

### Accent

- **Tag red** (`#c8321e`): scarce. A friend's pick, an over-budget total, a recording dot, an
  error, the edition number on a Look poster. Never a primary button, never decoration.
- **Tag red soft** (`#f8e3de`): the ground for warning and error notices.

### Neutral

- **Wall** (`#f7f6f3`): the page ground and the sticky bars (at 95% with blur).
- **Card** (`#ffffff`): paper tags, inputs, secondary buttons, bordered sheets.
- **Panel** (`#efeeea`): recessed groups — empty states, summary panels, image grounds,
  info notices, the active navigation item.
- **Rail** (`#d6d5cf`): every one-pixel line, input borders, dividers.
- **Muted** (`#6d6e69`): secondary text, meta, inactive navigation.

### Named rules

**The One Colour Rule.** Product artwork and Look images supply the page's colour; the interface
stays neutral so they can.

**The Tag Red Rule.** Red marks a single consequential thing per screen. If two things are red,
one of them is not.

## Typography

**Display:** Bricolage Grotesque (variable, optical size on) — signage with character; tight at
large sizes, stable at small ones.
**Body / UI:** Inter — dense controls, data, navigation.
**CJK:** system faces (PingFang TC, Noto Sans TC) carry Traditional Chinese in both roles.
**Mono:** the system monospace, only when the string itself is data (ontology tokens, JSON in the
Engine lab).

### Hierarchy

- **Display** (600, 2rem–2.5rem, 1.02): page titles, Look titles, prices at the hero size.
- **Section title** (600, 1.25rem): the title on a rail line above a group; on rails 1.06–1.19rem.
- **Body** (400, 0.9375rem, 1.5): descriptions, at most one line under a title.
- **Control** (500, 0.875rem): buttons, field labels (0.8125rem), navigation.
- **Tag / meta** (500, 0.75rem, sentence case, no tracking): tags, meta lines, footer links.

### Named rules

**The Caption Rule.** Text under an image is a caption: name, price, one reason. Sentence case,
no tracked uppercase, no kickers above headings.

**The Signage Rule.** Bricolage Grotesque names pages and Looks; Inter operates. Never the reverse.

## Layout

Centered containers with 1.25rem gutters on phones and 2rem on desktop; content widths of 48rem
(reading), 72rem (default) and 88rem (catalog). Groups are separated by a rail line and 1.75–2.25rem
of vertical space, not by cards.

**Rails.** A curated set (an outfit, your Looks, friends' picks, "Wear it with") is a rail: a short
title row, then a horizontally scrolling track that bleeds to the viewport edge on phones, snaps to
items, and hides its scrollbar. Item widths: sm 8.5/10.5rem, md 10.5/13rem, lg 14/17rem, xl 17/22rem
(phone/desktop).

**Grids.** Catalogs and wardrobes use 2 columns on phones, 3 at 48rem, 4 at 80rem.

**Shop Talk (`/shop-talk`).** At 1280px and above, a 13rem filter rail sits beside a narrower
three-column product grid, with chat in a separate right column (`minmax(20rem, 26%)`). The workspace
fills the visual viewport below the shared shell header; the title and toolbar take their natural
space, and filters, products and transcript scroll independently in the remaining height. Below
1280px, filters use a disclosure and chat becomes an expandable fixed bottom sheet. Its expanded
height is 72dvh, capped to the available visual viewport after the shell header and visible bottom
navigation. Keyboard changes update its height and bottom offset; below 768px, only the visible
part of the bottom navigation adds clearance. At a visual viewport height of 500px or less, the
composer uses a compact row to keep input and audio controls accessible. Products retain two
columns below 768px and three above it.

**Navigation.** Desktop: a sticky 3.5rem top bar with the wordmark, Find / Shop / Wardrobe, Bag and
the person. Phones: the same bar without links, plus a fixed 3.5rem bottom tab bar with four labelled
tabs (Find, Shop, Wardrobe, Bag). The footer holds the doors that are not for shoppers: Trends for
Makalot, Prototype tour, Engine lab, the Engine view switch.

### Named rules

**The First Viewport Rule.** On every page the largest thing above the fold is an image; on Find it
is the input sitting over a rail of real Looks. Controls never push content below the fold on a
390px screen.

**The Rail-or-Grid Rule.** Curated sets hang on rails; catalogs stand in grids. Never a stack of
same-size cards.

## Elevation & Depth

Flat by default. Product depth comes from a tile lifted off the rail on hover
(`translateY(-4px)` with `0 14px 28px -12px rgb(23 23 23 / 0.28)`, 180ms expo ease-out). Sticky
bars use a 95% wall tint with a light backdrop blur. The Shop Talk sheet below is the sole additional
shadow treatment documented here.

The Shop Talk bottom sheet uses the shared sheet shadow (`0 -8px 24px -16px rgb(23 23 23 / 0.25)`)
to separate its fixed surface from the catalog; its desktop chat column remains flat.

## Shapes

Three radii, each with a job: 3px for paper tags, 6px for controls (buttons, inputs, segmented
choices), 8px for tiles and panels. 12px only for a phone bottom sheet. Circles are avatars and
count badges only.

## Components

### Buttons

- **Primary:** ink on wall text, 2.5rem high (3rem large, 2.25rem small), 6px radius, 500 weight.
  One per page — the next step in the chain. Hover lightens to 85% ink.
- **Secondary:** white card with a rail border; the border turns ink on hover.
- **Ghost:** text only, panel tint on hover. **Link:** underlined with the rail colour.
- Labels name the outcome: Find pieces, Add to bag, Place order, Create a Look, Make it mine,
  Ask a friend, Send, Copy link.

### Tags

A paper tag: white, rail border, 3px radius, 1.5rem high, 0.75rem sentence-case text. Tones: neutral
(card), ink (selected / the understood intent), accent (avoid, over budget, a friend's pick),
outline (muted). At most one tag per object.

### Tiles (ProductCard, LookCard)

Artwork at 3:4 on its own tonal ground (the product SVG's aesthetic colour; panel for Looks),
8px radius, lifts on hover. Beneath: brand (meta), name (0.875rem, two lines max), price (tabular),
optionally one reason line ("Matches the style · In budget"). Overlays sit in the artwork's corners:
a tag top-left, save/dismiss icon buttons top-right.

### Inputs & fields

White card, rail border, 6px radius, 2.5rem high; the one-sentence field on Find is 3.5–4rem high at
1.06–1.19rem. Labels are 0.8125rem nouns; hints one line. Sizes and small choices use a **Segmented**
row of button-like radios so every option is visible; the chosen one fills with ink.

### Notices & empty states

Notices are a single line on a panel tint (info), a bordered card (success) or the soft red
(warning, error) with an optional right-aligned small action. Empty states: a panel with one title
line, at most one supporting line, one action.

### Rail & Section

`Section` draws a rail line and a title row; `Rail` draws a title row over a scrolling track.
Neither renders an eyebrow.

### Progress

An indeterminate 2px `progress-line` under an image or input while something generates; skeletons
shaped like the tiles they replace; button labels change ("Rendering…"). No spinners in content,
no sentences narrating progress.

### Look posters (offline)

900×1200: the preset's ground colour, a slightly darker stage rectangle, the garments laid out as a
flat lay with ±5° tilt, the title in a bold grotesque, "by <owner>", up to three aesthetics, a thin
palette bar and the piece count, the edition number in the preset's accent. No texture words, no hex
codes, no uppercase.

### Shop Talk conversation

Chat keeps the existing neutral palette and shared control radii. Bricolage titles sit above an
Inter transcript (0.875rem, 1.65 line height); user messages have a recessed panel ground, while
assistant messages sit directly on the page. The composer remains outside the scrolling transcript,
with separate microphone and speaker controls, each exposing its own pressed state. Both start off;
typed messages can begin silently, and the explicit voice action enables both. Message arrival uses
a 140ms ease-out fade and 3px rise only when reduced motion is not requested.

**The Shop Talk Direct Update Rule.** On `/shop-talk`, conversation replaces the sentence field,
hints and apply controls. Assistant filter updates act directly on the catalog; manual changes
remain visible in the transcript. Google Search only helps interpret unfamiliar named references;
product discovery stays in the site's Jev/catalog flow, without external search results, suggestion
cards or source links. Uncertain preferences remain conversational and do not trigger alerts.
Actual service failures retain retry or reconnect actions; an unavailable catalog remains distinct
from a successful search with no matches.

### Named rules

**The One Reason Rule.** A recommendation carries one plain line built from its strongest factors
(`reasonLine`) and the understood intent shows as a row of tags (`intentTags`). Scores, weights,
confidence, slot names and factor breakdowns exist only when Engine view is on.

**The Honest State Rule.** Loading, unavailable, empty, error, rendering and sample states are each
visible and distinct, expressed as form (skeleton, progress line, tag, notice) rather than prose.

## Do's and Don'ts

### Do

- **Do** open every page on an image and end it on the one ink button.
- **Do** write like a good clerk: name the outcome, keep the rest to a line.
- **Do** put engine internals behind Engine view and in the Engine lab.
- **Do** hang curated sets on rails and let them bleed to the phone's edge.
- **Do** keep the demo's sample states labelled with a small "Sample" tag.

### Don't

- **Don't** put a kicker or eyebrow above a heading, or a slogan in a title.
- **Don't** narrate the system ("Your request is submitted…"), or explain what a button does.
- **Don't** show scores, percentages, confidence or field names to a shopper.
- **Don't** nest cards, border layout groups, or list aesthetic chips under a product.
- **Don't** use red for anything that is not the one thing to notice.
