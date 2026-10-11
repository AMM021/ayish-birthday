# Pre-build Audit and Decision Register

This file records the planning repairs made before implementation. It supplements `PROJECT.md` (source of truth), `SPECS.md` (technical detail), `TEXT.md` (locked story copy), and `SETUP.md` (environment/assets). If these documents conflict, Claude must stop and report the conflict rather than guess.

## Current status

**Handoff approved by the owner (2026-10-10). The full game is implemented (tags v0.2–v0.6). Music and photos are in (2026-10-11). In progress (owner, 2026-10-11): avatars + hug ending, jump/crouch, STARS parkour, PETALS obstacles, house v3. Then a real-laptop test pass and deploy.**

### Automated test record (headless Chrome 2026-10-10, SwiftShader WebGL, ~4–20 fps)

Passed: passcode (wrong code, `0000` rejected without `?dev=true`, `1010`), dev gating in a production build (`?dev=1` gives nothing), save validation (malformed JSON, unknown room IDs), resume to HUB/FINAL/END; THRESHOLD note once per approach plus second approach; HUB intro ordering (Enter completes typing without dismissing; a separate Enter dismisses), second bubble, locked-gate line, ordered unlock, returning/all-done lines; TORII (no crossings during intro/playback, correct counts once, wrong resets the round, three rounds, save, portal); COMPILE (any lantern order, fixed line order, counters wait behind story, no bubble/card overlap, resolution, save); STARS (min distance 2.71, fast pass counts, wrong resets, heart reads front-on); PETALS (bounds, pause plus lost line, return beyond 30, completion); FINAL/REVEAL/END (letter Enter does not skip, keyboard Skip works, turn-around cannot fire before dismissal, refresh after the letter, 8 s turn assist, missing video gives fallback plus Continue, blocked autoplay gives Play then Enter plays, real playback reaches END, `seenReveal` only before END, refresh stays on END); out-of-bounds line plus pull-back; a 3 s main-thread hitch moves her only 0.45 units; adaptive quality steps 1.5 → 1.25 → 1.0 → bloom off; reduced motion types 2× faster; touch-only notice.

Not testable headless; needs the real laptop: pointer lock and mouse look, real frame rate, adaptive-quality restore (> 45 fps), audio and mute with real tracks, fullscreen, headphones (QA 18, 19, 25).

## Decisions kept

- The timer lock is removed; the experience opens at the passcode screen.
- The glowing orb is the companion; Cinnamoroll is not part of the game.
- The four challenge rooms are TORII, COMPILE, STARS, and PETALS.
- The game is laptop-first with keyboard + mouse; a touch-only device gets a clear notice rather than pretending touch controls are implemented.
- Story copy in `TEXT.md` is not to be paraphrased.
- Passcode `1010` is confirmed.
- The final reveal is **his avatar + the hug + his words as typed text** (owner, 2026-10-11; replaces the earlier video + voice). Keep the state name `REVEAL`; no video, no audio-only variant.
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

## Owner decisions — 2026-10-10 (handoff review)

Conflicts raised in the kickoff review, resolved by the owner and written into PROJECT.md, SPECS.md, TEXT.md, SETUP.md and the add-challenge skill:

1. **Git:** private GitHub repo created: `AMM021/ayish-birthday` (branch `main`).
2. **Passcode/date:** keep `1010` as the only gate, with no timer. Her birthday is 10 October.
3. **Sealed-door note:** its copy is now in TEXT.md. It is text on a small paper note on door 5 in 3D, not an overlay.
4. **Off-palette colours:** new PALETTE entries `matcha` (resolved badge/scroll), `moss` (bouquet stems), `moonlight` (flashes), `lacquer` (near-black props). No existing colour changed.
5. **Per-object lighting:** lanterns and torii gates own one material each (`registry.ownMaterial`). `enableBloom` is idempotent (stores the base colour, never compounds). `disposeGroup` skips registry-shared resources. PROJECT.md Rule 7 notes the exception.
6. **TORII hint:** the 60 s hint says its line, replays the current round, then keeps the first gate pulsing until she crosses it.
7. **FINAL group exception:** approved and written into PROJECT.md Rule 11.
8. **Video buffering:** buffering starts when the letter opens, or immediately when FINAL resumes after the letter, or on a dev REVEAL jump. Rule 12 updated.
   **Turn-around:** she turns herself (>120°). If she hasn't turned 8 s after dismissing "turn around.", the camera eases her round 180° over 2.5 s and REVEAL starts.
9. **Favicon:** inline SVG data URI in index.html. `public/favicon.svg` removed from the plan.
10. **Music after refresh:** starts on her first keydown/pointerdown when resuming past PASSCODE.
11. **Room order (new):** gates unlock one at a time, TORII → COMPILE → STARS → PETALS. A locked gate stays dark and the orb says the locked-gate line. Finished gates glow lavender with a check and stay replayable. After all four, the portal in front of door 5 leads to FINAL.
12. **END petals:** 3D petals + sky behind a translucent end card. The `endcard` does not pause the loop (Rule 14 exception).
13. **"Returning after a room"** plays after rooms 1–3 only. After the 4th, "All 4 done" plays instead.
14. **Dialogue font:** system UI sans stack (no extra font file).
15. **STARS usability:** trigger radius raised 0.7 → 1.1, roughly the size of a star's glow, so it is easier to hit in free flight. The closest pair is still 2.7 apart, leaving 0.5 clearance. A swept segment test stops fast passes from skipping a star. `MOVE_DAMP` is applied frame-rate independently.
16. **Model:** the build runs on Opus. Sonnet may take over; all context lives in these docs.

## Owner decisions — 2026-10-10 (v2 redesign after the first playtest)

The owner played v0.6 and asked for a redesign. These items override decisions 11, 13 and 15 above, as well as the free-fly, hub and replay parts of the original plan.

17. **Walking:** she walks with gravity instead of flying. Floors and walls are solid (`world/physics.js`, three-mesh-bvh 0.8.3, exact pin); she can never pass through the ground. Shift jogs (×1.7). Falling 20 units below her spawn returns her to it.
18. **Light purple, cute, never eerie:** a gradient sky dome with pastel clouds and new palette entries (complementary, none overwritten). STARS stays at twilight so the stars still show.
19. **Linear levels:** each portal leads to the next level, then to FINAL. There is no way back and no replay. The hub is now the small void island with the orb intro and one portal. A refresh mid-level restarts that level.
20. **Fragments H · O · M · E:** each level grants one. They show top-left, and the orb line after each level praises her, names the fragment, says what's next and how many remain (copy approved).
21. **COMPILE → fix the code:** four one-word blanks taken from the issue-card lines. Each right answer lights one of four lanterns, so the letter's "lanterns" line stays true. Then `npm run dev` blooms the void into a garden with a glimpse of the house. One typo is forgiven on words of five or more letters.
22. **PETALS → stay in the light (hardest):** the orb's light circle drifts down the avenue, then gusts push it sideways, the circle shrinks and it speeds up. After 3 s outside it, the level restarts gently.
23. **STARS for walking:** the heart lies flat over a lake and the stars float at chest height. Stars passed before star 1 is lit are ignored. On completion the camera rises to show the whole heart, then returns.
24. **Planned, not built yet:** HOME typing at the laptop (blocks to be drafted for approval) → gaming room → letter → turn around → video → END → explore the garden and the three-story house (living room, dining, kitchen, library with a sliding ladder, bathroom with shower, tub, toilet with muslim shower and a sink with mirror, master bedroom with a sunset window and a balcony over a sunset city, and a couple's work/gaming room with both laptops and toy cars). The anniversary door moves into the house. The THRESHOLD home mixes their apartment with the game's style.

25. **Laptop code blocks approved** (TEXT.md → FINAL — laptop fragment code). **The home is the dream house:** it is the house they plan to have, not a real one, so THRESHOLD, the gaming room and the house share one style (luxurious, homey, wooden, nature-filled, whimsical, cute purple). No apartment details are needed.

26. **Furniture looked bland → Kenney Furniture Kit (CC0)**, recoloured to the palette and credited in ASSET_CREDITS (credit not required). **Free roam:** END now fades into EXPLORE (the finished world) after 12 s, and a refresh after the reveal resumes there. **THRESHOLD stairs removed** (the owner saw the handrail clipping through the steps).
27. **COMPILE questions clarified** (owner-approved): answers finish familiar phrases ("princess", "lub dub", "not apart… together", "safe and sound").

## Owner decisions — 2026-10-11 (avatars, the hug, harder levels)

28. **TORII:** while a sequence plays, the camera lifts to frame all nine gates, then returns her exactly where she stood ("matches how you see it for the first time").
29. **Avatars:** realistic avatars of both of them (MPFB 2 + MakeHuman CC0/CC BY assets, credited). Ayish 153 cm, him 163 cm, both Maldivian (she slightly lighter). Her: a modest purple dress with kasabu-style embroidery, **a matching hijab with her hair fully tucked in**, purple glasses, white trainers. Him: wolf cut, sunglasses resting on his hair, white rolled-sleeve linen shirt, cream chinos, the same trainers. She stays first person except during the hug.
30. **The ending (video dropped):** after "turn around." he is standing in the gaming room. He says "come here my princess" (his words, TEXT.md), opens his arms, and she walks to him. The hug cuts to third person (hug_in, then a slow swaying hug), and his script types out as text over it. Then END. This replaces the recorded video + voice and its poster/fallback; `seenReveal` is set when she continues after his words.
31. **Controls:** Space jumps, Shift runs, C crouches (held). The owner asked for Ctrl; C was chosen together because Ctrl+W (crouch while walking forward) closes the browser tab and a page cannot block it. This lifts the "no jump" rule.
32. **STARS → parkour:** jumping, ducking and running between the stars (it was too easy).
33. **PETALS → real obstacles:** the light still leads, but the path has things in the way (it felt like walking forward with nothing stopping her).
34. **Pending owner approval:** the controls hint copy that mentions Space and C (drafted, not shown in the game until approved).

## Human decisions still open

- [x] Passcode `1010` confirmed.
- [x] Final reveal chosen: video + voice → changed 2026-10-11 to avatars + hug + his words as text.
- [x] COMPILE resolution comment approved as written.
- [x] Three instrumental music candidates selected in `SETUP.md`; listen to previews, download, and record dates/credits before shipping.
- [x] Owner approves personal photos; count may vary. Place them in `src/assets/pics/`.
- [ ] Listen to each of the three music previews (instrumental, no vocals, loops cleanly) and confirm the page URLs still work; they were not opened or heard during planning.
- [x] Locked-gate line confirmed by the owner (no longer used after v2: there is no hub).
- [x] H/O/M/E laptop code blocks approved.
- [x] Planning handoff approved.
- [x] Music tracks added by the owner (2026-10-11).
- [x] Photos added (2026-10-11). No video is needed any more.
- [ ] Decide on the Vite chunk-size warning (three.js alone is ~500 kB; the deploy skill wants a clean build, SPECS fixes vite.config).
- [ ] Deploy to Netlify (needs the owner's Netlify login).

## Build gate / acceptance criteria

Before coding begins, the owner should approve this planning package. Then Claude should first summarize the architecture and the unresolved decisions, list the files it intends to create in Day 1, and wait if anything conflicts. During implementation, each challenge needs a reproducible test; the full QA checklist in `SPECS.md` must pass on the target laptop before the public link is shared.
