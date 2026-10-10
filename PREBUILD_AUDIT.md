# Pre-build Audit and Decision Register

This file records the planning repairs made before implementation. It supplements `PROJECT.md` (source of truth), `SPECS.md` (technical detail), `TEXT.md` (locked story copy), and `SETUP.md` (environment/assets). If these documents conflict, Claude must stop and report the conflict rather than guess.

## Current status

**Planning updated with owner decisions — no game source code is included in this package. Do not start implementation until the owner explicitly approves the handoff.**

## Decisions kept

- The timer lock is removed; the experience opens at the passcode screen.
- The glowing orb is the companion; Cinnamoroll is not part of the game.
- The four challenge rooms are TORII, COMPILE, STARS, and PETALS.
- The game is laptop-first with keyboard + mouse; a touch-only device gets a clear notice rather than pretending touch controls are implemented.
- Story copy in `TEXT.md` is not to be paraphrased.
- Passcode `1010` is confirmed.
- The final reveal is **video + voice**. Keep the state name `REVEAL`; do not implement an audio-only variant.
- Personal photos are variable-count and belong in `src/assets/pics/`; use Vite build-time discovery, not a fixed 3–5 list.

## Technical requirements now made explicit

1. **Dev mode:** only the exact `?dev=true` query parameter enables the bypass/debug panel. The `0000` bypass is never shown in player-facing text and must fail in normal mode.
2. **Dialogue/input:** one Enter keydown advances at most one dialogue action; ignore key-repeat for one-shot actions. Enter that completes typing must not also dismiss that same line. Clear held keys on blur, tab hide, pointer-lock loss, and blocking overlays. Prevent Space from scrolling while the game has focus.
3. **Hints:** hint timers pause while a story bubble is visible/queued, a blocking overlay is open, or the tab is hidden. Ambient lines never interrupt story lines.
4. **Threshold/HUB triggers:** the door note opens once per approach sequence and cannot reopen while she stands in range; the second approach requires leaving and re-entering. HUB door triggers are edge-triggered and transition-locked; completed rooms may be replayed without losing completion.
5. **TORII:** do not count crossings during the sequence playback/gaps; only count a genuine crossing through the expected gate; debounce; wrong input resets the current round and replays it. Hints cannot start a second overlapping sequence.
6. **COMPILE:** each lantern counts once. Lanterns may be found in any order, but code lines reveal in the fixed intended order. Ambient counters wait while story dialogue is active.
7. **STARS:** nine distinct positions form a recognizable heart path. Activation is proximity-based, not click-based; the first and last stars must not overlap; each trigger counts once per attempt. Validate positions in a front-on debug view (the heart lies in the x/y plane, so a top-down view cannot show its shape).
8. **PETALS:** the corridor is 80 units long so it fits the documented 100-unit bounds; keep every waypoint and target within bounds.
9. **FINAL:** lock movement during camera movement and the letter. Only arm the turn-around trigger after the letter is complete/skipped, the camera is stable, and the “turn around.” bubble is deliberately dismissed. Record a fresh yaw baseline when arming.
10. **Refresh:** before letter completion, replay the letter; after letter completion, resume at chair-facing with the turn-around beat; after completed reveal, resume at END. Set completion flags only when their corresponding beat actually completes.
11. **Tab/performance:** cap frame delta at 0.05 seconds after a tab return, clear input state, and add a sustained-low-FPS adaptive quality fallback. Test on the actual target laptop.
12. **Media/audio:** browser autoplay may be rejected. Background music and the final video must never trap progression; a deliberate play action and fallback are required. The final reveal is video + voice.
13. **Privacy:** `noindex` discourages search indexing but is not security. A front-end passcode can be bypassed by someone with the public URL; do not store secrets in the repository or put the dev bypass in player-facing UI.
14. **Third-party assets:** verify the specific license/terms for each track, texture, font, or image. Do not label Pixabay or any other platform “CC0” unless the exact asset license says so. Keep `ASSET_CREDITS.md` when external assets are added.
15. **Optional MCP security:** `.mcp.json` invokes `@neturely/okffs@latest` through `npx`. This is third-party executable code and `latest` can change; review the package/source and approve the server only if you trust it. It is optional; if it is not needed, remove `.mcp.json` as described in SETUP.md. Do not put credentials directly in tracked files.
16. **Validation honesty:** a written checklist is not proof of a test. Mark tests complete only after running them and recording the browser/device and outcome.

## Final pre-handoff pass (resolved in the documents)

- Pixel ratio and adaptive quality made consistent: PROJECT.md Rules 3 and 16, SPECS.md config constants, `core/renderer.js`, `core/composer.js` (`updateQuality`), `core/clock.js` (`getRawDelta`), main.js loop.
- rAF pause rule aligned across PROJECT.md and SPECS.md (blocking overlays and the opaque REVEAL video only).
- Final reveal is video + voice everywhere; no "configurable", "adapter" or "pending approval" wording remains. REVEAL releases pointer lock, fades the letter music, has an 8 s start timeout, and falls back to poster + TEXT.md line + Continue. The look hint is suppressed in REVEAL/END.
- STARS: symmetric heart coordinates, edge-triggered activation, spawn in front of the heart, front-on validation.
- THRESHOLD: door "ready" pulse after the note closes.
- Out-of-bounds orb line moved into TEXT.md.
- Audio: `audio.fadeOut`, `M` mute key, speaker status icon.
- Photos: `-auto-orient -strip` and a correct resize command; repository must be private.
- The reveal video starts buffering once the letter is open, so REVEAL does not stall.

## Human decisions still open

- [x] Passcode `1010` confirmed.
- [x] Final reveal chosen: video + voice.
- [x] COMPILE resolution comment approved as written.
- [x] Three instrumental music candidates selected in `SETUP.md`; listen to previews, download, and record dates/credits before shipping.
- [x] Owner approves personal photos; count may vary. Place them in `src/assets/pics/`.
- [ ] Listen to each of the three music previews (instrumental, no vocals, loops cleanly) and confirm the page URLs still work; they were not opened or heard during planning.
- [ ] Record and compress the final reveal video; keep it 45–75 seconds and under 15 MB if possible.

## Build gate / acceptance criteria

Before coding begins, the owner should approve this planning package. Then Claude should first summarize the architecture and the unresolved decisions, list the files it intends to create in Day 1, and wait if anything conflicts. During implementation, each challenge needs a reproducible test; the full QA checklist in `SPECS.md` must pass on the target laptop before the public link is shared.
