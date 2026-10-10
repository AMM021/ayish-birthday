---
name: add-overlay
description: Add a themed DOM overlay (note, letter, end card, dialogue box) on top of the 3D canvas. Use when the user says "add a note", "add a letter", "show text over the game", or "add an end card".
---

# Add Overlay

> Read PROJECT.md (Performance Rules especially) before writing code.
> Grep SPECS.md for the section you're implementing. Use TEXT.md verbatim.

Overlays are DOM elements layered above the Three.js canvas. Blocking
overlays (`note`, `letter`, `endcard`) pause the 3D render loop; `line`
and dialogue bubbles do not. Handwritten/serif type is used only in
`note`, `letter`, `endcard` and `line`; dialogue uses the UI sans.

## Overlay manager

```js
overlay.show('note', {
  html: '...',
  font: 'handwriting',
  onClose: () => { ... }
});
```

## Overlay types

| Type       | Font        | Background            | Interactions     |
|------------|-------------|-----------------------|------------------|
| `note`     | handwriting | paper texture, slight rotation | Enter or click to close |
| `letter`   | serif       | paper texture, soft shadow     | typewriter, skip |
| `endcard`  | serif       | dark warm purple gradient      | none |
| `line`     | serif       | soft caption, no panel         | non-blocking, auto-fades |
| `dialogue` | UI sans     | floating bubble (`dialogue.js`, not `overlay.js`) | Enter to continue (story) or auto-fade (ambient) |

## Rules

1. Palette from `core/config.js` (`paper`, `ink`). Never hardcode hex.
2. Animations gentle. Fade in 600ms, fade out 400ms.
3. Pause the world when a blocking overlay is open (not `line` or
   `dialogue`). Release pointer lock. Restore on close.
4. Typewriter effect on ALL story text (`note`, `letter`, `endcard`,
   `line`, dialogue). Shared utility `typewriter.run(el, text, opts)`,
   ~28ms per char (38 for dialogue), punctuation pauses, soft click
   every 3 chars if music on. Enter or click finishes the typing
   instantly; for `note`, a further Enter/click closes it.
5. Floating polaroids for letter — real images from
   `src/assets/pics/`, slight rotation, gentle float animation.
6. Skip button on letter in small text.
7. Laptop-first but keyboard accessible. If touch-only, show the keyboard-first notice; do not claim touch controls are implemented unless they are.

## Files

- `src/ui/overlay.js` — manager
- `src/ui/typewriter.js` — typing utility
- `src/ui/dialogue.js` — orb speech bubbles
- `src/styles/overlay.css` — styles

## Anti-patterns

- Blocking the main thread during typing
- Creating DOM nodes per character (append text nodes only)
- Using `position: absolute` inside overlay without `contain: strict`
- Forgetting to release pointer lock

## Test

Open via dev mode. Trigger overlay. Confirm: fade works, 3D pauses,
pointer lock releases, Enter or click closes, no console errors.

## Commit

`feat(ui): add <name> overlay`
