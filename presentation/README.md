# LookLine presentation

The LookLine story in ten slides: a purchase becomes a starting point, a wardrobe gives it continuity, and shared creations give it reach. Designed for a 3–5 minute presentation in Traditional Chinese.

Open `LookLine.html` directly in a modern browser. It bundles images, font, styles and navigation into one portable file. `LookLine.pdf` provides the same ten slides as a static handout.

`LookLine-v2.pptx` is the current PowerPoint export, including the updated five-card artwork on slide 7. Full-slide, high-resolution images preserve the presentation layout. Make text and artwork edits in the HTML source, then export the updated slides. `LookLine.pptx` is the earlier export with the previous Card artwork.

The editable source lives in `dist/`, a complete static presentation with bundled assets. Run `node presentation/package.mjs` from the repository root after changing source files to regenerate the single-file HTML.

After editing, regenerate HTML with the command above, export PDF through the browser's print function, and regenerate PowerPoint from the updated slides.

## Controls

- Left / right arrows or Page Up / Page Down: previous / next slide.
- Home / End: first / last slide.
- O: slide index. Escape closes the index.
- F: toggle fullscreen where supported.
- Phones: swipe horizontally to change slides and scroll vertically within a slide.
- Browser print: all 10 slides, one landscape slide per page.

## Publishing

Publish only the `dist/` directory. It contains `index.html`, `styles.css`, `deck.js` and local assets. This is compatible with static hosting, including the Sites static-output path. Register the Site and set `static.directory` to `dist` when publishing.

## Sources and assets

Content is synthesized from the user's product brief, the supplied `聚陽實業題目.md`, `StyleLoop_pitch_deck.pptx` and `hackathon.key`. The narrative centers on LookLine’s point–line–plane philosophy.

`hero.webp` is a conceptual image extracted from the supplied PowerPoint. `cards.webp` is the replacement conceptual image explicitly supplied by the user (ChatGPT Image 2026年9月20日 上午10_52_43.png). `studio.webp` is the product screenshot from the supplied Keynote. Captions distinguish concept artwork from the product screenshot.

The bundled display font is Geist, provided under the SIL Open Font License included at `dist/assets/FONT-LICENSE.txt`. Traditional Chinese uses the reader's system CJK font.
