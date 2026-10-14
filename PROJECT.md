# Ayish's Birthday — Interactive 3D Experience

> Read this file first, every session. It is the source of truth.
> For implementation detail, grep `SPECS.md` by section heading.
> For all copy (letters, note, dialogue), grep `TEXT.md`.
> For dev environment, see `SETUP.md`.

## Vision

A single-page browser 3D experience, designed first for a laptop, played with the keyboard alone (the mouse is optional). It opens directly at the passcode gate (no timer lock). She walks through four Japanese-themed light-purple levels guided by a glowing orb, earning one fragment per level: H, O, M, E. At the laptop in the void she types the four fragments in, lands in his work/gaming room, reads the handwritten letter and turns around: he is there, home. He calls her over, she walks into his arms, and while they hug his words appear as text. Then a soft end card, and then wakes in the finished world: a garden and a three-story house to explore.

Tone: dreamy, playful, romantic, warm, cute. Light purple, never eerie. Not scary. Not static.
Calm (owner, 2026-10-14): the levels never overstimulate. Nothing to fail, no
timers, no restarts. She can wander freely and things go her way.
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
- Device: laptop, keyboard only (the mouse is optional: click to look,
  pointer lock)
- Movement: walking with gravity. ↑/↓ walk, ←/→ turn (owner, 2026-10-14);
  WASD also works. Shift to run, Space to jump, C to crouch (held); no level
  needs them. Floors and walls are solid (capsule vs. a static BVH per room);
  she can never pass through the ground. No flying. (Jump and crouch: owner,
  2026-10-11; C, not Ctrl, because Ctrl+W closes the tab.)
- Levels: 4 levels, strictly linear: TORII → COMPILE → STARS → PETALS →
  FINAL. Each level's portal leads to the next; there is no way back and no
  replay. Each level grants a fragment (H, O, M, E), shown top-left. All
  calm (owner, 2026-10-14): nothing to fail, no timers, no restarts.
- TORII is "wake the garden": no gates (they scared her). Any five of twelve
  sleeping flower buds open as she walks near them.
- The void past the door (state HUB) is a small island where the orb
  introduces itself; its one portal leads to TORII.
- COMPILE is "fix the code": four one-word blanks, then `npm run dev`, then
  the void blooms into the garden with a glimpse of the house.
- STARS is "the stargazing spot": she wanders the lakeshore, sits on the
  bench (Enter) and watches the nine stars rise into a heart in the sky.
- PETALS is "the forest stroll": the orb's light walks the trail at her
  pace and waits for her; nothing in her way. (It is no longer "the
  hardest".)
- FINAL: at the laptop she presses H, O, M, E (each types its code block),
  then lands in his work/gaming room for the letter → "turn around." → he is
  there → "come here my princess" → she walks to him → the hug (third
  person) → his words as typed text → END.
- Avatars: realistic avatars of both of them (MPFB/MakeHuman, built in
  Blender, `public/models/avatars/{ayish,him}.glb`). She wears a hijab that
  matches her dress, her hair fully tucked in. She stays first person
  everywhere except the hug.
- Final reveal: no video (owner, 2026-10-11). The reveal is his avatar, the
  hug animation and his words typed out (TEXT.md "FINAL REVEAL").
- THRESHOLD is the entry hall of their planned dream house; the gaming room
  and the house share its style.
- After END (12 s) she wakes in EXPLORE: Tsuki House (a crescent of rooms
  around a koi pond, a round tower with a spiral stair, a rounded east wing,
  an oval bedroom pod), its garden and the city below in a forever sunset,
  to walk through freely; the sealed round moon door is at the top of the
  tower. It is built and checked in Blender (`art/blender/`, the glitch
  audit must report zero problems), lit by a Cycles bake and exported to
  `public/models/house/` (CC0 Poly Haven models and ambientCG materials).
- Companion: glowing orb, gold core, lavender halo, soft trail
- No Cinnamoroll: the orb is the companion (decided, nothing to build)
- Text: story dialogue types out and waits for Enter; ambient lines never interrupt story dialogue
- Sky: one persistent sky that follows the camera (no edges): a soft
  gradient dome with pastel clouds, plus the starfield for twilight (STARS)
- Vibe: Japanese theming, light cute purples, gold, sparse vermillion;
  the house is luxurious, homey, wooden, nature-filled, whimsical, purple
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
| lilacSky    | `#c9b2f2` | Day sky (top)                    |
| lilacHaze   | `#f3e9ff` | Day sky (horizon), fades, clear  |
| lilacMist   | `#e2d3f8` | Day fog, island ground           |
| wisteria    | `#a68ad9` | Stone, island undersides         |
| blush       | `#f7d6e6` | Pastel clouds, blossom accents   |
| twilight    | `#6e55a8` | STARS sky                        |
| dusk        | `#9a7cc9` | STARS horizon, the lake          |
| meadow      | `#b9dca4` | Garden grass after the bloom     |
| sunlit      | `#fff1d6` | Garden horizon, sunshine         |
| oak         | `#c9a27e` | House wood                       |
| walnut      | `#8b6450` | Dark wood, logs (fallback)       |
| linen       | `#f6efe9` | Soft linen                       |
| peach       | `#ffcfa6` | Sunset horizon                   |
| bark        | `#b59a86` | Weathered timber (avenue trellis) |
| neutral     | `#ffffff` | Texture tint only (map as it is) |
| stoneLilac  | `#f2ecf8` | Texture tint: pale lilac stone   |
| stoneShade  | `#e6dff0` | Texture tint: stone in shade     |

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
│   ├── models/kenney/*.glb   # Furniture Kit (CC0), see ASSET_CREDITS.md
│   └── media/
│       ├── music/{hub.mp3, challenge.mp3, letter.mp3}
│   └── models/avatars/{ayish,him}.glb   # baked in Blender (art/blender/export_avatars.py)
└── src/
    ├── assets/pics/       # any number of personal photos; auto-discovered by Vite
    ├── main.js
    ├── core/{renderer,composer,clock,input,assets,audio,save,settings,config,hints}.js
    ├── world/{world,layers,transitions,physics}.js   # physics: colliders (three-mesh-bvh)
    ├── objects/{orb,arch,lantern,portal,sakura,starfield,nebula,skydome,tree,fragment,bouquet,bud}.js
    ├── rooms/{passcode,threshold,hub,torii,compile,stars,petals,final,reveal,end,explore}.js
    ├── state/{machine,states}.js
    ├── house/{props,models,structure,gamingRoom,avatars,tsuki,town,city}.js   # gaming room (Kenney kit), the avatars, Tsuki House loader (doors), the neighbourhood outside the gate, the valley/train/mountains
    ├── ui/{overlay,dialogue,typewriter,devtools,issuecard,prompts,text,fragments,laptop,pausemenu}.js   # text.js reads TEXT.md verbatim; issuecard = COMPILE editor; pausemenu = Esc (volumes, mouse, fullscreen)
    └── styles/{base,overlay,devtools,issuecard,pause}.css
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
12. Assets lazy-load via `core/assets.js`. The avatars load in FINAL (they
    are first needed in REVEAL), never at boot.
13. Overlays use `contain: strict; will-change: opacity;`.
14. rAF pauses when a blocking overlay is open (not for `dialogue` or
    `line`). Exceptions: REVEAL's `words` overlay (the hug animates behind
    it) and the END `endcard` do not pause, because the scene renders
    behind their translucent gradients.
15. Distant objects use `MeshBasicMaterial`/`MeshLambertMaterial`.
16. Adaptive quality: measure a rolling FPS average. If FPS remains below 30 for 5 seconds, lower renderer pixel ratio in small steps down to 1.0; if still below 30, disable bloom. Do not change gameplay logic or challenge timing to improve FPS. Restore bloom/pixel ratio only after FPS remains above 45 for 10 seconds, and never exceed the initial pixel ratio. Avoid quality oscillation with these separate thresholds.

## State Machine

```
BOOT → PASSCODE → THRESHOLD → HUB (the void: orb intro, one portal)
     → TORII (H) → COMPILE (O) → STARS (M) → PETALS (E)
     → FINAL (laptop: type H·O·M·E → gaming room → letter) → REVEAL → END
     → EXPLORE (the finished world: garden + dream house, free roam)
```
Each portal leads only forward.

Every room module default-exports an object `{ name, async enter(),
update(dt), exit() }` (the four challenge rooms also have
`hintTargets()` and `nudgeLine`). No room creates
Scene/Camera/Renderer/Composer.

Save key: `localStorage['ayish.progress']`
Shape: `{ unlocked:bool, roomsDone:string[], reachedFinal:bool, seenLetter:bool, seenReveal:bool, seenGoodbye:bool }` (`seenGoodbye`: the orb's goodbye in the house has played; it plays once). Treat absent or malformed values as defaults; validate `roomsDone` against the four known room IDs.

## Resume Logic

On boot, load progress and decide:

- `!unlocked` → `PASSCODE`
- `unlocked` and `seenReveal` → `EXPLORE` (the end card was already seen)
- `unlocked` and `reachedFinal` → `FINAL`
- `unlocked`, no level done yet → `HUB`
- otherwise → the first unfinished level in `ROOM_ORDER` (FINAL if all
  four are done)

Refresh mid-level → that level restarts from its beginning; finished
levels and their fragments are kept.
Refresh after passcode → resume at HUB.
Refresh in FINAL before the letter is finished → FINAL, the letter
replays from the top.
Refresh in FINAL after the letter but before the reveal completes → FINAL resumes at the chair-facing view and replays the “turn around.” beat; the letter is not repeated.
Refresh after the reveal → EXPLORE.

Flags are set at: `reachedFinal` on entering FINAL; `seenLetter` only after the letter finishes or is deliberately skipped; `seenReveal` when his words have been typed out and she continues, immediately before END. Do not set `seenReveal` merely because the reveal state was entered.

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
2. Midday — `STARS` (sequence), `PETALS` (follow).
3. Afternoon — `FINAL`, letter overlay, `REVEAL` (avatars, hug, his words), `END`.
4. Evening — Music in, end-to-end test, compress photos, deploy, QR.

Must ship: passcode, free-fly, all four challenge rooms, letter + final reveal, deployed link, dev mode. The story copy promises four rooms/four pieces, so do not cut a challenge room without first asking the owner and revising the story/specs together.

Cut if behind: Petal Storm visual complexity, orb color shifts, koi/shoji/wave ambient, sound effects beyond music. Keep the PETALS follow challenge itself unless the owner explicitly approves a story change.

## Open Items (human must fill before build completes)

- [x] Passcode `1010` confirmed
- [x] Final reveal format: his avatar + the hug + his words as text (video dropped 2026-10-11)
- [x] COMPILE resolution comment approved as written
- [x] Instrumental music choices selected in SETUP.md; verify previews and record credits before shipping
- [ ] Add personal photos to `src/assets/pics/` (any number; see SETUP.md)
- [x] v2 copy (fragments, COMPILE blanks, controls, restart) approved 2026-10-10
- [x] Laptop code blocks for H, O, M, E approved
- [x] The home is their planned dream house (not a real apartment)

## Error / Fallback Specs

- No WebGL → full-page message: "This experience needs WebGL.
  Try Chrome, Firefox, or Edge on a laptop." No 3D.
- Audio blocked → silent, no error, no console spam.
- Avatars fail to load → REVEAL skips him and the hug; his words still type out over the gaming room, then Continue leads to END.
- localStorage blocked → in-memory only, warn once in console.
- Reduced motion (`prefers-reduced-motion`) → disable petal drift,
  slow portal pulse, no bloom animation, no star twinkle or shooting
  stars, typewriter 2× faster; buds open at once without a petal puff, the
  waiting stars hold still, the bench view is instant.
- Favicon → inline SVG data URI in index.html (no file, so it can never be missing).
- Page title → "Something is waiting…"
- Robots → `<meta name="robots" content="noindex">` (discourages indexing; does NOT make the public site private). A client-side passcode is a surprise gate, not security; anyone with the URL can inspect or bypass front-end code.
