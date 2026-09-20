---
name: LookLine presentation
description: Paper, ink and tag red carry a point–line–plane product story.
colors:
  paper: "#f7f6f3"
  ink: "#171717"
  muted: "#666660"
  line: "#d6d5cf"
  red: "#c8321e"
  panel: "#efeeea"
typography:
  display:
    fontFamily: "Geist, PingFang TC, Noto Sans TC, sans-serif"
    fontSize: "79px"
    fontWeight: 750
    lineHeight: 1.1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist, PingFang TC, Noto Sans TC, sans-serif"
    fontSize: "58px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontSize: "23px"
    lineHeight: 1.65
  label:
    fontSize: "13px"
rounded:
  control: "5px"
components:
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    width: "40px"
    height: "40px"
  icon-button-hover:
    backgroundColor: "{colors.panel}"
---

# Design System: LookLine presentation

## Overview

The presentation inherits LookLine’s paper, ink and tag-red visual world. Spacious editorial compositions pair Traditional Chinese product statements with Latin typography, product imagery and thin diagrams. The point–line–plane motif makes purchase, continued creation and social connection visible through dots, paths and networks.

This document describes the implemented presentation in `dist/styles.css`, `dist/index.html` and `dist/deck.js`. Its scope is this ten-slide web deck.

## Colors

Tag red is the primary accent: it marks the brand dot, active navigation, progress, changed attributes and selected diagram nodes. Paper supplies the canvas; ink carries primary text and diagrams. Muted text supports captions and secondary explanations. Line separates content, while panel provides restrained tonal surfaces and button hover states.

## Typography

Geist is bundled as a variable WOFF2 font. Traditional Chinese uses the installed PingFang TC or Noto Sans TC family, followed by the system sans-serif. All roles share this stack; no separate display or monospace family is introduced.

The frontmatter captures the desktop defaults. The cover statement uses larger headlines (64px), the conclusion uses 74px, and lead paragraphs use 28px. Headlines have balanced wrapping and compact tracking; paragraph spacing relies on a generous line height. On portrait mobile, default headlines become 35px, section titles 23px, body copy 19px and leads 21px. Page counters use tabular numerals.

## Layout

Desktop slides use a fixed 1440 × 810 canvas. A resize observer scales that canvas into a centered 16:9 stage, constrained by viewport width and the space remaining beneath the header and above the controls. Standard slide padding is 70px top, 86px horizontally and 62px bottom. Individual layouts use editorial columns, full-height image regions, ruled rows and aligned diagrams. A closing sentence often sits above a bottom divider.

At widths up to 760px in portrait orientation, the stage fills the available viewport height and each active slide scrolls vertically. Slides stop scaling, use 30px × 25px × 34px padding, and generally stack their columns. The header and controls remain outside the scrolling slide. Changing slides resets the new slide to its top. Landscape retains the scaled desktop composition.

Print CSS reveals all ten slides, including those hidden during browsing. Each occupies one 1440 × 810 page with zero page margins; navigation, the dialog and stage shadow are omitted. Print colors are preserved.

## Elevation & Depth

Content is primarily flat, separated by rules and tonal panels. A faint stage shadow distinguishes the presentation canvas from the surrounding chrome. The modal overview uses a stronger shadow and dimmed backdrop. Exact elevation and motion values live in `.impeccable/design.json`.

## Shapes

Slide surfaces, image regions, diagram panels and the overview use square corners. Thin rules and open space organize information. Icon controls have lightly softened corners; circular red dots are the recurring brand and diagram signature. Line icons use rounded stroke ends and joins.

## Components

- **Navigation:** Previous and next icon buttons accompany a numbered page label, current title and thin red progress line. First/last controls disable at the respective boundary. Hover uses panel, focus uses a red 3px outline offset by 5px, and disabled controls use 0.25 opacity. Mobile hides the title and fullscreen button and reduces icon controls to 38px.
- **Overview:** The menu button or `O` opens a native modal containing all ten numbered slide titles. The current title is red and receives focus on opening. Selection navigates directly; closing returns focus to the menu control. Escape, the close button and a click outside the dialog close it.
- **Keyboard and touch:** Right arrow or Page Down advances; left arrow or Page Up goes back. Space advances when the document body has focus. Home/End select the first/last slide. `F` toggles fullscreen when the browser supports it. Horizontal swipes navigate without replacing vertical mobile scrolling. Hashes `#1` through `#10` address individual slides.
- **Figures and diagrams:** Cropped imagery anchors the cover. The social slide uses a 56% image / 44% text split with the full user-supplied five-card image contained without cropping; the studio figure presents the product interface. Captions identify figures. Point–line–plane SVGs and thin flow connectors share the ink/red vocabulary.
- **Motion and announcements:** Slides switch directly. The progress indicator transitions over 240ms with ease-out; reduced-motion preferences disable transitions. A polite live region announces each selected slide and reports unavailable fullscreen actions.

## Do's and Don'ts

- **Do** retain the paper/ink foundation and reserve red for emphasis, state and the point motif.
- **Do** preserve readable mobile scroll areas and the ten-page print sequence when revising layouts.
- **Do** keep focus indicators, current-page semantics and meaningful image alternatives.
- **Don't** introduce additional font families or decorative surface treatments that disrupt the existing visual world.
- **Don't** shrink the desktop canvas into unreadable portrait text; retain the implemented mobile reflow.
