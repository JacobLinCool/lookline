# LookLine presentation

Ten Traditional Chinese slides for a 3–5 minute presentation.

Open `LookLine.html` directly in a modern browser. It bundles images, font, styles and navigation into one portable file. `LookLine.pdf` provides the same ten slides as a static handout.

`LookLine-v2.pptx` is the current PowerPoint export, including the updated five-card artwork on slide 7. Every slide is a single high-resolution image: its layout is preserved, but individual text and image elements are not editable. `LookLine.pptx` is the earlier export with the previous Card artwork.

The editable source lives in `dist/`: no API keys, external image requests, package installation or application backend are required. Run `node presentation/package.mjs` from the repository root after changing source files to regenerate the single-file HTML.

This command regenerates HTML only. Re-export PDF using the browser's print function after changing the source. PowerPoint must also be regenerated separately; it does not update when HTML changes.

## Controls

- Left / right arrows or Page Up / Page Down: previous / next slide.
- Home / End: first / last slide.
- O: slide index. Escape closes the index.
- F: toggle fullscreen where supported.
- Phones: swipe horizontally to change slides and scroll vertically within a slide.
- Browser print: all 10 slides, one landscape slide per page.

## Publishing

Publish only the `dist/` directory. It contains `index.html`, `styles.css`, `deck.js` and local assets. This is compatible with static hosting, including the Sites static-output path. Register the Site and set `static.directory` to `dist` when publishing. No Site has been registered or deployed as part of this preparation.

## Sources and assets

Content is synthesized from the user's product brief, the supplied `聚陽實業題目.md`, `StyleLoop_pitch_deck.pptx` and `hackathon.key`. The final product name and point–line–plane philosophy were explicitly confirmed by the user.

`hero.webp` is a conceptual image extracted from the supplied PowerPoint. `cards.webp` is the replacement conceptual image explicitly supplied by the user (ChatGPT Image 2026年9月20日 上午10_52_43.png). `studio.webp` is the product screenshot from the supplied Keynote. They are captioned accordingly on the slides. The original documents were not modified.

The bundled display font is Geist, provided under the SIL Open Font License included at `dist/assets/FONT-LICENSE.txt`. Traditional Chinese uses the reader's system CJK font.
