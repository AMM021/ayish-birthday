# Ayish's Birthday — Interactive 3D Experience

> Read this file first, every session. It is the source of truth.
> For implementation detail, grep `SPECS.md` by section heading.
> For all copy (letters, note, dialogue), grep `TEXT.md`.
> For dev environment, see `SETUP.md`.

## Vision

A single-page browser 3D experience, designed first for a laptop with keyboard + mouse. It opens directly at the passcode gate (no timer lock). She free-flies through four Japanese-themed purple rooms guided by a glowing orb. The final door leads to a void where a laptop displays a handwritten letter, followed by a personal video reveal with voice, then a soft end card.

Tone: dreamy, playful, romantic, warm. Not scary. Not static.
Philosophy: she shouldn't just click and read. She should walk through
something. The effort is the gift.

## Story

She finished her university work and came home as fast as she could.
But there was an extra door in her place — one that wasn't there before.
A note was taped to it. It was him — panicked, joking, apologizing.
He'd been building her birthday present when something went wrong and
he got teleported into the void. Before it happened, he wrote a small
program — an orb — and told it to find her if anything went wrong.

The code that brings him home scattered into four rooms. She has to
walk through each room, recover the fragments, and rebuild the code.
The orb doesn't know where the fragments are. It only knows how to
find her.

The orb is his last act of love.

## Locked Decisions

- Passcode: `1010`
- No timer lock: the experience opens straight on the passcode screen
- Device: laptop, keyboard + mouse, pointer lock
- Movement: free-fly 6DOF, WASD + Space/Shift + mouse look
- Rooms: 4 challenges + 1 sealed anniversary door
- Room order: gates unlock one at a time in `ROOM_ORDER` (TORII → COMPILE →
  STARS → PETALS). A locked gate stays dark and the orb says the locked-gate
  line. Finished rooms turn lavender and stay replayable without losing
  completion. After all four, a portal in front of door 5 takes her to FINAL.
- Companion: glowing orb, gold core, lavender halo, soft trail
- No Cinnamoroll: the orb is the companion (decided, nothing to build)
- Text: story dialogue types out and waits for Enter; ambient lines never interrupt story dialogue
- Sky: one persistent celestial sky that follows the camera (no edges)
- Vibe: Japanese theming, dark warm purples, gold, sparse vermillion
- Tech: Three.js + Vite
- Hosting: Netlify free tier
- Admin: `?dev=true` URL param
- Progress: localStorage
- Build model: Claude Opus (Sonnet may continue the build; the planning docs
  and `PREBUILD_AUDIT.md` carry every decision), effort high (low for
  boilerplate)
- Dev environment: see SETUP.md

## Palette (use via `core/config.js`, never inline)

| Name        | Hex       | Use                              |
|-------------|-----------|----------------------------------|
| deepIndigo  | `#1a0f2e` | Void background                  |
| warmPurple  | `#4a2c6d` | Mid fog, distant geometry        |
| lavender    | `#c4a5e8` | Highlights, UI accents, orb halo |
| softPink    | `#e8a5c4` | Sakura petals, warm accents      |
| gold        | `#ffd88a` | Orb core, lantern light          |
| vermillion  | `#e85a4f` | Torii gates (sparingly)          |
| paper       | `#f5eee0` | Note + letter backgrounds        |
| ink         | `#2a1f1a` | Note + letter text               |
| matcha      | `#8fc9a3` | COMPILE `resolved` badge + scroll |
| moss        | `#3f5e45` | Bouquet stems                    |
| moonlight   | `#fdf8ff` | Flashes / whiteouts (never pure white) |
| lacquer     | `#120a1c` | Near-black props (table, chair, bag) |

## File Structure

```
WIFES_BIRTHDAY/
├── index.html
├── package.json
├── vite.config.js
├── PROJECT.md
├── SPECS.md
├── TEXT.md
├── SETUP.md
├── README.md
├── PREBUILD_AUDIT.md
├── ASSET_CREDITS.md
├── CLAUDE.md
├── .mcp.json
├── .gitignore
├── .claude/skills/{new-room,add-challenge,add-overlay,deploy}/SKILL.md
├── public/
│   ├── fonts/{handwriting.woff2, serif.woff2, serif-italic.woff2}
│   ├── textures/{petal.png, star.png, paper.jpg, shoji.png}
│   └── media/
│       ├── music/{hub.mp3, challenge.mp3, letter.mp3}
│       └── reveal/{reveal-video.mp4, reveal-poster.webp}
└── src/
    ├── assets/pics/       # any number of personal photos; auto-discovered by Vite
    ├── main.js
    ├── core/{renderer,composer,clock,input,assets,audio,save,config,hints}.js
    ├── world/{world,layers,transitions}.js
    ├── objects/{orb,torii,lantern,portal,sakura,starfield,nebula,fragment,bouquet}.js
    ├── rooms/{passcode,threshold,hub,torii,compile,stars,petals,final,reveal,end}.js
    ├── state/{machine,states}.js
    ├── ui/{overlay,dialogue,typewriter,devtools,issuecard,prompts,text}.js   # text.js reads TEXT.md verbatim
    └── styles/{base,overlay,devtools,issuecard}.css
```

## Performance Rules (non-negotiable)

1. One `THREE.Scene`, owned by `world.js`. Rooms add a `THREE.Group`.
   Never `new THREE.Scene()` in a room.
2. One renderer, one composer, one clock — singletons in `core/`.
   One scene and one camera — singletons in `world/world.js`. Rooms
   import, never instantiate.
3. Set initial pixel ratio to `Math.min(devicePixelRatio, 1.5)`. Adaptive quality may lower it to 1.0 when sustained FPS is poor, but never raise it above the initial value during a session.
4. Bloom is selective by brightness: only glowing objects (orb,
   lanterns, portals, fragments, the brightest stars) are pushed above
   1.0 via `enableBloom`, and the bloom threshold is 1.0, so nothing
   else glows. One composer, one scene render. Bloom `resolution: 0.5`.
5. No shadow maps. Fake shadows with a dark circle mesh if needed.
6. Max 4 active point lights. Lanterns use emissive, not lights.
7. Geometry and material shared via `objects/*` registry (cached).
   Exception: objects that light up individually (lanterns, torii gates)
   own one material each from the registry, disposed with their group.
   `enableBloom` is idempotent and never compounds.
8. Anything >100 copies → `InstancedMesh`.
9. Camera `far = 500`. Fog hides the edge. The sky (radius 450) ignores
   fog and follows the camera.
10. Frustum culling stays on.
11. Every room's `exit()` calls `world.disposeGroup(name)`. Approved
    exception: FINAL keeps its group when the next state is REVEAL (REVEAL
    reuses it and disposes it on exit).
12. Assets lazy-load via `core/assets.js`. The reveal video starts with
    `preload="none"`; it switches to `preload="auto"` only in FINAL: once
    the letter is open, or immediately when FINAL resumes after the letter
    was already seen (see SPECS → core/assets.js).
13. Overlays use `contain: strict; will-change: opacity;`.
14. rAF pauses when a blocking overlay is open (not for `dialogue` or
    `line`) and while the opaque REVEAL video is playing. Exception: the
    END `endcard` does not pause, because sky + drifting petals render
    behind its translucent gradient.
15. Distant objects use `MeshBasicMaterial`/`MeshLambertMaterial`.
16. Adaptive quality: measure a rolling FPS average. If FPS remains below 30 for 5 seconds, lower renderer pixel ratio in small steps down to 1.0; if still below 30, disable bloom. Do not change gameplay logic or challenge timing to improve FPS. Restore bloom/pixel ratio only after FPS remains above 45 for 10 seconds, and never exceed the initial pixel ratio. Avoid quality oscillation with these separate thresholds.

## State Machine

```
BOOT → PASSCODE → THRESHOLD → HUB
                              ├→ TORII   → HUB   (open from the start)
                              ├→ COMPILE → HUB   (unlocks after TORII)
                              ├→ STARS   → HUB   (unlocks after COMPILE)
                              └→ PETALS  → HUB   (unlocks after STARS)
                                           │
              all 4 rooms done → portal opens in front of door 5
                                           ↓
                                         FINAL → REVEAL → END
```

Every room module default-exports an object `{ name, async enter(),
update(dt), exit() }` (the four challenge rooms also have
`hintTargets()` and `nudgeLine`). No room creates
Scene/Camera/Renderer/Composer.

Save key: `localStorage['ayish.progress']`
Shape: `{ unlocked:bool, roomsDone:string[], reachedFinal:bool, seenLetter:bool, seenReveal:bool }`. Treat absent or malformed values as defaults; validate `roomsDone` against the four known room IDs.

## Resume Logic

On boot, load progress and decide:

- `!unlocked` → `PASSCODE`
- `unlocked` and `seenReveal` → `END`
- `unlocked` and `reachedFinal` → `FINAL`
- otherwise `unlocked` → `HUB` (if all 4 rooms are done, the portal in
  front of door 5 is already open)

Refresh mid-room → back at HUB with finished rooms kept; she walks
into that gate again to restart the room.
Refresh after passcode → resume at HUB.
Refresh in FINAL before the letter is finished → FINAL, the letter
replays from the top.
Refresh in FINAL after the letter but before the reveal completes → FINAL resumes at the chair-facing view and replays the “turn around.” beat; the letter is not repeated.
Refresh after the reveal → END.

Flags are set at: `reachedFinal` on entering FINAL; `seenLetter` only after the letter finishes or is deliberately skipped; `seenReveal` when the reveal video finishes, or its fallback has been shown and she continues, immediately before END. Do not set `seenReveal` merely because the reveal state was entered.

## Dev Mode (`?dev=true`)

- Skip passcode only when `?dev=true` is present; `0000` is accepted only in that same dev mode. Neither bypass may work in a normal URL.
- Panel bottom-right: jump to any state, toggle fog/bloom/music,
  FPS readout, "Complete current challenge", "Replay final reveal",
  "Reset progress"
- Dev panel never appears without the URL param

## Build Schedule

Day 1
1. Morning — Vite + Three.js scaffold. Build locally before the first deploy. Confirm pointer lock + WASD works on laptop.
2. Midday — `PASSCODE`, save, dev mode with state jump (dev bypass must be gated by `?dev=true`).
3. Afternoon — orb, starfield, nebula, composer w/ bloom.
4. Evening — `THRESHOLD`, `HUB` with 5 doors (4 open, 1 sealed), portal,
   orb intro dialogue.

Day 2
1. Morning — `TORII` (tutorial), `COMPILE` (exploration + fragments).
2. Midday — `STARS` (sequence), `PETALS` (follow). Compress the reveal video and make its poster frame once it is recorded.
3. Afternoon — `FINAL`, letter overlay, `REVEAL` video overlay, `END`.
4. Evening — Music in, end-to-end test, compress photos, deploy, QR.

Must ship: passcode, free-fly, all four challenge rooms, letter + final reveal, deployed link, dev mode. The story copy promises four rooms/four pieces, so do not cut a challenge room without first asking the owner and revising the story/specs together.

Cut if behind: Petal Storm visual complexity, orb color shifts, koi/shoji/wave ambient, sound effects beyond music. Keep the PETALS follow challenge itself unless the owner explicitly approves a story change.

## Open Items (human must fill before build completes)

- [x] Passcode `1010` confirmed
- [x] Final reveal format: video + voice
- [x] COMPILE resolution comment approved as written
- [x] Instrumental music choices selected in SETUP.md; verify previews and record credits before shipping
- [ ] Add personal photos to `src/assets/pics/` (any number; see SETUP.md)
- [ ] Record and prepare the final reveal video
- [ ] Confirm or replace the draft HUB locked-gate line in TEXT.md

## Error / Fallback Specs

- No WebGL → full-page message: "This experience needs WebGL.
  Try Chrome, Firefox, or Edge on a laptop." No 3D.
- Audio blocked → silent, no error, no console spam.
- Reveal video errors, or is not playable within 8 s → show `reveal-poster.webp` plus the fallback line from TEXT.md and a Continue prompt (Enter/click) that leads to END.
- localStorage blocked → in-memory only, warn once in console.
- Reduced motion (`prefers-reduced-motion`) → disable petal drift,
  slow portal pulse, no bloom animation, no star twinkle or shooting
  stars, typewriter 2× faster.
- Favicon → inline SVG data URI in index.html (no file, so it can never be missing).
- Page title → "Something is waiting…"
- Robots → `<meta name="robots" content="noindex">` (discourages indexing; does NOT make the public site private). A client-side passcode is a surprise gate, not security; anyone with the URL can inspect or bypass front-end code.
