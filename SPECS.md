# SPECS

Detailed implementation specs. Grep by `##` heading.

## v3 (2026-10-11) — read first; overrides v2 and older sections

- **Controls:** `world.js` adds jump and crouch. Space jumps when grounded
  (`JUMP_SPEED` 6.6 → about 1 m apex at `GRAVITY` 22), with 0.1 s coyote time
  and a 0.12 s jump buffer. C held crouches: the capsule height (feet → eye)
  eases from `EYE_HEIGHT` 1.6 to `CROUCH_HEIGHT` 0.95 over 0.15 s, speed ×0.5,
  no running; she stays crouched while something is overhead. The capsule
  height is `player.height` (physics.resolveCapsule takes it). Rooms may set
  a different standing height (`world.setStandHeight`; REVEAL uses 1.45, her
  real eye height). Shift runs ×1.7 as before. Ctrl is never bound (Ctrl+W).
- **Avatars:** `public/models/avatars/{ayish,him}.glb`, built by
  `art/blender/avatars.py` (MPFB 2, game_engine rig, garments cut from each
  body in `garments.py`/`outfits.py`, her hijab included), animated in
  `anim.py` (IK poses baked to FK, 30 fps) and exported by
  `export_avatars.py` (shape keys and masks applied, mouth interior dropped,
  every base colour baked to one WebP texture per object). Clips: him
  `idle`, `open_arms`, `open_idle`, `hug_in`, `hug`; her `idle`, `hug_in`,
  `hug` (named `<key>|<clip>`). The hug layout: him at the origin facing +z,
  her at z +0.42 facing −z. `house/avatars.js` loads them (GLTFLoader via
  `assets.model`), sets cut-out materials to alpha-test, and plays clips with
  one `AnimationMixer` each (cross-fades 0.35 s).
- **FINAL → REVEAL (the ending):** the turn-around trigger is unchanged. FINAL
  preloads the avatars once the letter opens (or on resume after it).
  REVEAL keeps FINAL's group, removes the portal, and:
  1. A soft moonlight flash; he stands at `HIM_SPOT` (where the portal was),
     facing her, playing `idle`. She rises from the chair to standing
     height in front of it (1.2 s).
  2. His line (TEXT "FINAL REVEAL — his call") in a story bubble above his
     head; on dismissal he plays `open_arms` → `open_idle`.
  3. She walks to him (move + look on). Within `HUG_REACH` 1.05 m → the
     hug. If she has not arrived 10 s after the bubble, the camera walks her
     to him over 2.5 s.
  4. The hug: a 450 ms `lilacHaze` fade to a third-person shot; her avatar
     stands in his arms (hug layout), both play `hug_in` then `hug`; the
     camera drifts slowly around them at chest height (none with reduced
     motion).
  5. 2.5 s into the hug, his words (TEXT "FINAL REVEAL — his words") type
     out in the `words` overlay (translucent, handwriting font, does not
     pause the loop). Enter completes typing; then the `continue` prompt.
  6. Continue → moonlight flash → `seenReveal` → END. The letter music plays
     on throughout.
  If the avatars fail to load, steps 1–4 are skipped and his words show
  over the room. A refresh during REVEAL resumes at the turn-around beat.
- **STARS / PETALS:** reworked for the new controls; see their v3 entries
  below once built.

## v2 redesign (2026-10-10) — read first; overrides older sections

- **Player:** walking (see PROJECT.md → Locked Decisions). `world.js` drives
  a capsule (radius `PLAYER_RADIUS` 0.3, eye `EYE_HEIGHT` 1.6) with gravity
  `GRAVITY` 22, walk `MOVE_SPEED` 4.2, Shift `RUN_MULT` 1.7, damping
  `MOVE_DAMP` 0.82 (frame-rate independent), 0.2-unit sub-steps, and a tiny
  head bob that is off with reduced motion. Movement uses yaw only.
  `player.eye` is the physical position; `camera.position` = eye + bob.
  While `canMove` is false, rooms may animate the camera and eye follows it.
- **Colliders:** each room calls `world.setColliders([...meshes])` with its
  solid pieces (floors, walls, posts, invisible `physics.ringWall` /
  `physics.solidBox`). Portals, petals and glows are never colliders.
  `world.clearBounds()` also clears colliders.
- **Atmosphere:** `world.setAtmosphere(name, overrides)` / `lerpAtmosphere`
  with presets `day`, `twilight`, `garden`, `indoor` in `config.ATMOSPHERES`
  (sky dome colours, clouds, stars/nebula opacity, fog, light levels).
  Fades use `lilacHaze`.
- **Portal:** the disc blends normally (deep purple → lavender swirl) so it
  never saturates to white on the light sky; motes are gold.
- **Flow:** `save.nextState(room)` / `save.currentLevel()`; each level's
  portal → next level → FINAL. HUB = the void island (intro, beat 5 near the
  portal, one portal to TORII).
- **Fragments:** `ui/fragments.js` (`show`, `hide`, `collect`, `grant(id)`).
  `grant` saves the level, pops its tile and queues the TEXT.md
  "FRAGMENTS" line (E: two bubbles). The machine hides the tiles on every
  transition; levels and FINAL show them.
- **TORII:** gates stand on a meadow island (r 30), with solid pillars and blossom trees.
- **COMPILE:** `ui/issuecard.js` is now the editor. At the desk the editor
  opens, with movement and look off. Blanks are the issue-card lines 2–5; the question
  is typed in the panel; Enter checks. The terminal accepts `npm run dev`
  (spaces collapsed). The bloom runs 4.5 s: `day`→`garden`, ground
  lilacMist→meadow, 700 instanced flowers ripple out, 16 trees grow, and the
  cottage rises far away. The 60 s hint fills `_` with the answer's first letter.
- **STARS:** heart flat at `SCALE` 6, stars at y 1.35, horizontal hit test,
  outline on the water, lake `dusk`, `twilight` atmosphere, camera rise on
  complete (8 s; instant with reduced motion).
- **PETALS:** see PROJECT.md. The light radius goes 3.0 → 2.1 and its speed 2.6 → 3.6
  (walking is 4.2). Gusts arrive every ~5–8 s from 12 % of the path on. `OUT_LIMIT` is 3 s;
  her time outside the light recovers at 2× while she is inside it.
- **FINAL (phase 4):** the `final` group holds two sets, and only one is visible at a time.
  The void set (offset `VOID` z 300: walnut table, gaming chair, laptop,
  bouquet) and the gaming room at the origin (`house/gamingRoom.js`). She
  sits in the void and the orb says the laptop line. `ui/laptop.js` then
  takes H, O, M, E in order; each key types its TEXT.md block, wrong keys
  only nudge the next chip, and M does not mute here
  (`input.setMuteKeyEnabled`). A moonlight flash moves her to the gaming room,
  seated at her laptop (the letter title shows on its screen). The orb says
  the before-letter line, then the letter, then "turn around." The portal
  stands behind her chair (holder scale 0.72) and REVEAL drifts toward it.
  A refresh after the letter resumes seated in the gaming room.
- **THRESHOLD (phase 4):** the entry hall of the dream house: oak floor, lilac
  walls, walnut wainscot, a bench with her bag, a coat on hooks, a console
  with a mirror, lamp and plant, stairs going up (blocked by a collider),
  plants, frames and a pendant light. The extra door and note are unchanged.
- **house/props.js:** shared procedural furniture (plants, toy cars, laptop,
  mug, books, frame, lamp, fairy lights, rug, beanbag, gaming chair, shelf
  with an LED strip). The phase 6 house reuses them.
- **Phases 5–6, the finished world:**
  - *Models:* `public/models/kenney/*.glb` (Kenney Furniture Kit 2.0, CC0) are loaded lazily by
    `assets.model()` (GLTFLoader, dynamic import, geometry marked shared).
    `house/models.js` `preload(names)` then `place(name, {parent, at, rot,
    scale, tint, solid, solids})`. It uses `KIT_SCALE` 2.1, centres each piece on `at`,
    puts its front toward +z at rot 0 (`face(dx, dz)`), and adds an AABB
    collider. Every kit material maps to a PALETTE colour (`MAP`, with `tint`
    overrides), so no colour from the files survives.
  - *Structure:* `house/structure.js` `wall` (with door and window openings and
    trim), `floor` (with holes), `stairs` (oak steps and risers, plus an invisible
    ramp collider, side guards and an optional handrail) and `railing`.
  - *Draw calls:* `house/bake.js` `bakeStatic(group)` merges static untextured
    opaque meshes per material. Colliders must be registered before baking.
  - *House* (`house/house.js`): 20 × 14 m, three floors 3.4 m apart; stairs A (right wall, 1→2) and
    B (left wall, 2→3).
    - Floor 1: an open-plan entry, living room (TV wall, sofa, rugs), dining (table for six) and kitchen (a run of
      units with uppers and a hood, an island with stools, and a fridge, washer, coffee
      machine, toaster and blender).
    - Floor 2: the library (walnut shelves full of books, a brass rail and a sliding ladder, reading
      chairs), the bathroom (big tub under the window, shower, toilet with a muslim shower
      (bracket, hose, spray head), pedestal sink with a mirror, cabinet, towels),
      the gaming room (`gamingRoom.build` turned 180° with its window to the garden, a
      door, no own light or outside) and a lounge.
    - Floor 3: the hall with the anniversary door
      (note = TEXT "HOUSE — sealed door note"; the orb's ambient line within 2.4 m), and the
      bedroom (big bed with pillows and fairy lights, nightstands with lamps, wardrobes,
      vanity, ottoman, ceiling fan, chair corner) opening onto a balcony with
      loungers.
    - Outside: flower boxes, a pitched roof and a chimney.
  - *Garden:* a meadow (r 70) with a stone path from the torii gate to the front door, 1400
    instanced flowers, 30 blossom trees, a pond with stones, lily pads and lotus, a bench, six
    stone lanterns, a hedge ring (collider r 42.8) and 160 instanced city towers with
    lit windows far toward the sunset (+z).
  - *EXPLORE* (`rooms/explore.js`): `sunset` atmosphere (sunDir low toward +z); spawn in the garden
    facing the house; the orb follows; the TEXT "AFTER END" line; `hub` music. The
    whole world is three point lights plus the sun.
  - *END* fades into EXPLORE after 12 s. A refresh after the reveal resumes in EXPLORE.
- **THRESHOLD furniture:** kit pieces (sofa with pillows and a teddy, coffee
  table, armchair, bookcase with books and a radio, floor lamp, console with a mirror
  and lamp, coat rack, bench with her bag, doormat, plants, rugs). The stairs
  were removed (their rail clipped through the steps).
- **Older sections below** that describe free flight, the hub gates, door 5,
  lantern hunting in COMPILE or "follow the guide" in PETALS are superseded.

## Bootstrap

package.json (exact):
```json
{
  "name": "ayish-birthday",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "three": "^0.169.0"
  },
  "devDependencies": {
    "vite": "^5.4.0"
  }
}
```

vite.config.js:
```js
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 4096 }
});
```

Bootstrap commands (run inside the existing `WIFES_BIRTHDAY` folder —
do NOT run `npm create vite`: it makes a new nested folder and a demo
app that would have to be deleted):
```
# 1. create package.json, vite.config.js and index.html exactly as
#    specified above, then the src/ structure from PROJECT.md
npm install
# 2. fonts: see SETUP.md → Fonts
npm run dev
```

## index.html

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Something is waiting…</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%23c4a5e8'/%3E%3Ccircle cx='16' cy='16' r='4' fill='%23ffd88a'/%3E%3C/svg%3E" />
  <link rel="stylesheet" href="/src/styles/base.css" />
</head>
<body>
  <canvas id="game"></canvas>
  <div id="ui"></div>
  <div id="loading">loading…</div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

## main.js — boot sequence

1. Read `?dev` from URL.
2. Check WebGL; if absent, render fallback message and stop.
3. Show `#loading`, fade out after first frame rendered.
4. Init `renderer`, `composer`, `world`, `input`, `audio`, `save`.
5. Register all room modules in `state/states.js`.
6. Load progress from localStorage.
7. If `?dev=true`, enable developer tools and bypass; otherwise use the production resume logic in PROJECT.md. Never infer dev mode from localStorage or a saved flag.
8. Start rAF loop. Each frame: read `clock.getDelta()` (capped) and
   `clock.getRawDelta()`, then call `world.update(dt)`,
   `machine.update(dt)`, `dialogue.update(dt)`,
   `composer.updateQuality(rawDt)` and `composer.render()`.
9. rAF pauses only while a blocking overlay (`note`, `letter`) is open
   or the opaque REVEAL video is playing (PROJECT.md Rule 14; the END
   `endcard` keeps the loop running). `line` captions and dialogue bubbles never pause it. On
   resume, clear held keys and apply only the capped delta.

## core/config.js

Exports: `PALETTE` (all twelve entries from PROJECT.md), `PASSCODE`,
`DEV`, `ROOM_ORDER = ['torii','compile','stars','petals']`,
`CAMERA_FAR = 500`, `PIXEL_RATIO_CAP = 1.5`, `BLOOM_RESOLUTION = 0.5`,
`MOVE_SPEED = 12`, `MOVE_DAMP = 0.88`, `LOOK_SENS = 0.002`,
`ORB_FOLLOW_DIST = 3`, `ORB_FOLLOW_DAMP = 0.9`, `ORB_BOB_AMP = 0.15`,
`ORB_BOB_SPEED = 1.4`, `PORTAL_TRIGGER_RADIUS = 3`,
`ROOM_BOUNDS_RADIUS = 100`, `HINT_DISTANCE = 60`,
`BLOOM_STRENGTH = 0.8`, `BLOOM_RADIUS = 0.8`, `BLOOM_THRESHOLD = 1.0`,
`SKY_RADIUS = 450`, `SECOND_BUBBLE_DISTANCE = 20`,
`STAR_TRIGGER_RADIUS = 1.1`, `REVEAL_START_TIMEOUT = 8000` (ms),
`TURN_ASSIST_DELAY = 8000` (ms), `TURN_ASSIST_DURATION = 2500` (ms),
`QUALITY_LOW_FPS = 30`, `QUALITY_LOW_SECONDS = 5`,
`QUALITY_RESTORE_FPS = 45`, `QUALITY_RESTORE_SECONDS = 10`,
`QUALITY_MIN_PIXEL_RATIO = 1.0`, `QUALITY_PIXEL_STEP = 0.25`.
`MOVE_DAMP` is a per-1/60 s factor; apply it as `MOVE_DAMP ** (dt * 60)`
so movement feels the same at any frame rate.

## core/renderer.js

Single `WebGLRenderer`. `antialias: false` (MSAA happens inside the
composer's render target), `alpha: false`,
`powerPreference: 'high-performance'`. Set `setClearColor(PALETTE.deepIndigo)`,
`setPixelRatio(Math.min(devicePixelRatio, PIXEL_RATIO_CAP))` once at boot
(this is the session's *initial* ratio; adaptive quality in
core/composer.js may only lower it later).
No shadow map. `outputColorSpace = SRGBColorSpace`.
`toneMapping = NeutralToneMapping`, `toneMappingExposure = 1.0` (keeps
the palette's hues true while rolling off bright glows gently; it is
applied by the composer's `OutputPass`).

## core/composer.js

`EffectComposer` with this pass chain, in order: `RenderPass` →
`UnrealBloomPass` → `ShaderPass(VignetteShader)` (`darkness: 1.0`,
`offset: 0.9`, about 40% darker corners; three's shader *lightens* edges
when darkness < 1, so the earlier 0.4 was a bug) → `OutputPass`. `OutputPass` is mandatory: it does the
linear → sRGB conversion and tone mapping, and without it every palette
colour renders dark and muddy. It is the last pass, so the composer
sends it to the screen (do not set `renderToScreen` by hand).

Composer target: `new WebGLRenderTarget(1, 1, { type: HalfFloatType,
samples: 4 })` passed to `new EffectComposer(renderer, target)`. This
gives 4× MSAA on all geometry (the canvas itself is never rendered to
directly) and keeps HDR values above 1.0 intact for bloom. Call
`composer.setPixelRatio(...)` and `composer.setSize(innerWidth,
innerHeight)` on boot and on every resize.

Bloom: `new UnrealBloomPass(new Vector2(innerWidth * BLOOM_RESOLUTION,
innerHeight * BLOOM_RESOLUTION), BLOOM_STRENGTH, BLOOM_RADIUS,
BLOOM_THRESHOLD)` = strength 0.8, radius 0.8 (wide, soft, dreamy
halos), threshold 1.0, resolution 0.5 (update the Vector2 on resize).

Adaptive quality (PROJECT.md Rule 16) lives here as
`composer.updateQuality(rawDt)`, called once per frame from main.js. It
averages FPS over a rolling window using the raw (uncapped) frame time,
and ignores frames longer than 0.25 s, frames while the tab is hidden,
and the first 2 s after boot or after any overlay/video pause, so tab
returns and loading hitches never count as low FPS. Step down: if the
average stays below `QUALITY_LOW_FPS` for `QUALITY_LOW_SECONDS`, lower the
pixel ratio by `QUALITY_PIXEL_STEP` (never below
`QUALITY_MIN_PIXEL_RATIO`); once at the minimum and still low, disable the
bloom pass. Step up: only after the average stays above
`QUALITY_RESTORE_FPS` for `QUALITY_RESTORE_SECONDS`, undo one step (bloom
first, then pixel ratio), never above the initial ratio. After each step,
wait a full window before judging again. A ratio change calls
`renderer.setPixelRatio`, `composer.setPixelRatio`, `composer.setSize`,
`bloomPass.setSize` and `starfield.setPixelRatio(r)`. The bloom pass's
`enabled` is `userBloomOn && !qualityBloomOff`, so the dev bloom toggle
and adaptive quality never fight. Adaptive quality never touches
simulation, timers or challenge logic.

Selective bloom is by brightness, not by layers. Glowing objects (orb,
lanterns, portals, fragments, the brightest stars) are pushed above 1.0
with `enableBloom(obj, intensity)` (see world/layers.js); everything
else stays below 1.0, so the threshold leaves it untouched. This keeps
one composer and one scene render per frame (Performance Rules 2 and 4)
and works correctly with fog, transparency and additive materials,
which a darken-and-re-render selective bloom does not. Keep scene lights
modest so no ordinary surface crosses 1.0; if something blooms that
should not, lower its emissive or the light, not the threshold. Tune
glow intensities by eye in dev mode (bloom toggle).

## core/input.js

Keyboard: `W A S D`, `Space` (up), `Shift` (down), `Esc` (release pointer lock), `Enter` (dialogue/typewriter actions), and `M` (toggle mute; the pointer is locked during play, so an on-screen icon alone could not be clicked). Use `event.code`; ignore repeated keydown events for one-shot actions; prevent Space/arrows from scrolling while the game has focus. Pointer lock is requested only after a deliberate canvas click. On `visibilitychange`, blur, pointer-lock loss, or any blocking overlay, clear all held-key state and zero movement velocity. Cap frame delta at 0.05 seconds after a tab return. One keydown may advance at most one dialogue action: if Enter completes typing, it must not also dismiss that line. If a device appears touch-only (coarse pointer with no fine pointer), show the keyboard-first notice from TEXT.md; do not pretend touch controls exist. Mouse sensitivity `LOOK_SENS`, damping `MOVE_DAMP`, and per-room bounds are configurable.

## core/assets.js

(v3: the reveal video below is gone; `assets.model()` also loads the avatars.)


Texture loader with cache. Methods: `get(key)`, `preload(keys[])`, `dispose(key)`. Keys map to `public/textures/`. Audio via `Audio()` elements, lazy. The reveal video (`public/media/reveal/reveal-video.mp4`, poster
`reveal-poster.webp`) is a single `<video>` element created with
`preload="none"` and `playsinline`; nothing downloads at boot. Once the
FINAL letter overlay has finished opening, set `preload="auto"` and call
`load()` so it buffers while she reads. When FINAL resumes with
`seenLetter` already true (refresh), or REVEAL is entered from dev tools,
buffer immediately instead. Never earlier than FINAL. It starts playing
only in REVEAL.

Procedural fallbacks: if a texture file is missing (`petal`, `star`,
`paper`, `shoji`), `get(key)` returns a `CanvasTexture` drawn in code
(petal = soft pink teardrop, star = radial glow, paper = warm noise in
`paper`, shoji = pale grid). The build never breaks on missing art, and
real files can be dropped into `public/textures/` later with the same
names.

## core/audio.js

Three tracks: `hub`, `challenge`, `letter`. `play(name, {fade:1200})`
crossfades from current track over 1200ms. `mute()`, `unmute()`,
`fadeOut(ms = 800)` (fades the current track to silence; used when REVEAL
begins). The `M` key toggles mute; a small speaker icon in
`ui/prompts.js` shows the muted/blocked state.
The first `play()` must come from a user gesture: the passcode submit
on a fresh run, or, when progress resumes past PASSCODE (HUB, FINAL or
END after a refresh), her first keydown or pointerdown on the page.
`audio.armOnFirstGesture(name)` registers that one-shot listener. If play rejects or a track is missing, continue silently and expose a discreet mute/audio status control; never block progression or spam the console. Do not rely on autoplay succeeding on every browser.

## core/save.js

Key: `ayish.progress`. API: `load()`, `save(state)`, `setUnlocked()`, `setRoomDone(name)`, `setReachedFinal()`, `setSeenLetter()`, `setSeenReveal()`, `reset()`. Validate loaded values and known room IDs; malformed JSON/unknown room IDs must not crash boot. On storage failure, use an in-memory fallback and warn once. Progress cannot persist across refreshes when storage is unavailable.
Wrap every read/write in try/catch. On failure, fall back to in-memory
object and warn once via `console.warn`.

## core/clock.js

Single `THREE.Clock`. Exports `getDelta()` (the frame delta capped at
0.05 s, so a tab return can never teleport anything) and `getRawDelta()`
(the same frame's uncapped value, used only by adaptive quality). No
`Date.now()` in loops.

## core/hints.js

Tracks `timeSinceProgress` per room. Room calls `hints.reset()` on any progress. Timers use capped simulation `dt`, not wall-clock time. Pause hint timers while a story dialogue is visible/queued, a blocking overlay is open, or the tab is hidden; resume from the same remaining time. Room calls `hints.update(dt, orb, room)` only when eligible. It triggers:
- 30s → orb drifts closer, bob speed ×1.3
- 60s → `dialogue.say(orb, room.nudgeLine, { mode: 'ambient' })`, then
  `room.onNudge?.()` (optional; TORII replays the current round and
  keeps its first gate pulsing, as its hint line promises)
- 90s → orb pulse + beam toward nearest `room.hintTargets()[i]` (3s)
- 150s → repeat beam every 30s

Beam: `ConeGeometry(1.2, 8, 12, 1, true)`, `MeshBasicMaterial(lavender,
additive, transparent)`, positioned from orb toward target, opacity
animated 0→0.6→0 over 3s, then disposed. Only one beam at a time.

Room modules implement `hintTargets()` returning array of `Vector3`.

## world/world.js

Creates `THREE.Scene`, `PerspectiveCamera(60, aspect, 0.1, CAMERA_FAR)`,
`rootGroup`. `getGroup(name)` creates-if-missing and adds to root.
`showGroup(name)`, `hideGroup(name)`, `disposeGroup(name)` walks and
disposes geometries, materials, textures it finds, then removes group.
It skips resources marked `userData.shared` (the `objects/*` registry
cache), so shared pieces survive into the next room.
Adds `HemisphereLight` and `AmbientLight(lavender, 0.35)` once.

Also owns `world.sky`: a persistent group (starfield + nebula, see their
sections) that is NOT part of any room group and is never disposed by
rooms. Each frame `world.update(dt)` copies the camera position onto
`world.sky.position`, so the sky sits at infinity like a real one: no
parallax, no edge, and it cannot be flown out of. Radius `SKY_RADIUS`
(450, inside camera far 500). All sky materials use `fog: false`,
`depthWrite: false` and `renderOrder = -1`. The sky is visible in every
state except THRESHOLD (indoor room), where `world.sky.visible = false`.

Also sets `scene.background` to deepIndigo explicitly: RenderPass turns
autoClear off and would otherwise clear the HDR target with a colour cached
in the screen's sRGB space, washing the void out to grey-purple.

## world/layers.js

Named layers: `0` default, `1` glow tag. `enableBloom(obj, intensity =
2.5)` tags `obj.layers.enable(1)` recursively (the object stays on layer
0, so it renders normally; the tag lets dev tools and hints find glowing
things) AND raises each material's colour / emissive to `base ×
intensity` so its luminance rises above the bloom threshold (1.0).
It is idempotent: the base colour is stored once in
`material.userData.baseColor` and every call sets from that base, so
repeated calls never compound. `disableBloom(obj)` restores the base.
Shared glow materials (orb, portal, fragment) get their glow once in the
registry. Objects that light up individually (lanterns, torii gates)
take their own material from the registry (`assets.own(material)`; the
cache itself is `assets.shared(key, factory)` in core/assets.js), so lighting
one never lights the others; those materials are disposed with the
room group. Layers are not used for rendering; bloom is by brightness
(see core/composer.js).

## world/transitions.js

`fade(out = 400, hold = 200, in = 600)` — CSS overlay div in deepIndigo.
`portalFlash(color)` — moonlight/lavender flash. Returns a Promise.

## state/machine.js + state/states.js

`states.js` maps each state name from the State Machine diagram to a
lazy import of its module, e.g. `TORII: () => import('../rooms/torii.js')`
(same for `PASSCODE`, `THRESHOLD`, `HUB`, `COMPILE`, `STARS`,
`PETALS`, `FINAL`, `REVEAL`, `END`). Each module default-exports
`{ name, async enter(), update(dt), exit() }` (+ `hintTargets()`,
`nudgeLine` and optional `onNudge()` for the four challenge rooms).

`machine.go(name)`: `transitions.fade` out → `current.exit(nextName)` (which
disposes its group, except FINAL when `nextName === 'REVEAL'`; see REVEAL) → `await import` + `enter()` → fade in. Calls made
while a transition is running are ignored. `machine.update(dt)` forwards
to the current room; `hints.update` runs only in the four challenge
rooms. `machine.current` is exposed for devtools. State names are
uppercase in code (`'HUB'`); room names in saved progress are lowercase
(`'torii'`).

## Out-of-bounds

Every room has a soft bounds sphere (radius `ROOM_BOUNDS_RADIUS`).
If player position > bounds.radius from room origin:
- Fog density ramps up over 2s
- Orb moves to player and says the "Out of bounds" line from TEXT.md
  (ambient)
- Player position lerps back toward origin over 3s
No hard wall, no error.

## Loader screen

`#loading` visible from page load until first frame of PASSCODE renders.
Contents: centered lavender text "loading…" in serif, pulsing opacity
0.4 → 1.0 every 1.2s. Fades out 400ms after world first renders.
If load >5s: append "still going…". If WebGL fails: fallback message.

## objects/orb.js

Exports `create()` returning a Group with:
- Core sphere `radius 0.15`, `MeshBasicMaterial(gold)`, `enableBloom()`.
- Halo sphere `radius 0.5`, additive transparent lavender, `enableBloom()`.
- `PointLight(gold, 0.8, 12)`.
- Trail: 30-segment ribbon via `BufferGeometry`, updated per frame.
Per-frame: bob via `sin(t * ORB_BOB_SPEED) * ORB_BOB_AMP`, follow
player at `ORB_FOLLOW_DIST` with `ORB_FOLLOW_DAMP`. `say(line, opts)` calls
`dialogue.say(this, line, opts)`. Color shifts per room via
`setColor(hex)` (core stays gold, halo shifts).

## objects/torii.js

Cached geometry: two pillars (BoxGeometry 0.4×4×0.4), top beam
(BoxGeometry 4.4×0.5×0.5), upper beam (5×0.4×0.4). Material:
`MeshStandardMaterial(vermillion, roughness 0.7)`, one per gate via
`assets.own` (see world/layers.js). `create(opts)` returns
a Group. `setLit(bool)` toggles emissive intensity (lit = above the bloom
threshold, so it glows).
`flash(color, ms)` pulses emissive briefly. `setState(state)` for HUB
gates: `'locked'` (dark, no emissive), `'open'` (vermillion, soft glow),
`'done'` (emissive lavender glow + small check mark; still enterable).

## objects/lantern.js

Cylinder (radius 0.5, height 0.8) `MeshStandardMaterial(paper, emissive
gold, emissiveIntensity 0)`, one material per lantern via
`assets.own`. Ring caps top/bottom in ink.
`light()` animates emissiveIntensity 0→1.2 over 600ms and calls
`enableBloom()` so the lit lantern crosses the bloom threshold, then
plays the chime. (Gold is the palette's lantern light; a warmPurple
emissive would stay too dark to glow.)

## objects/portal.js

Ring `TorusGeometry(1.8, 0.15, 16, 64)` `MeshBasicMaterial(lavender)`,
`enableBloom()`, additive. Inner disc `CircleGeometry(1.8)` with radial
gradient shader (lavender → transparent). Particles: 200 points
orbiting slowly, recycled. `enable()` fades opacity 0.15 → 1 over
800ms and starts a soft pulse (scale 1.0 ↔ 1.05). `disable()` inverse.
`checkEntry(playerPos)` returns true if within `PORTAL_TRIGGER_RADIUS`.

## objects/sakura.js

`InstancedMesh(PlaneGeometry(0.15, 0.1), MeshBasicMaterial({
map: petal, transparent: true, depthWrite: false }), count)`.
`create(count, bounds)` returns instance with `update(dt)` that
recycles petals: below `bounds.y.min` → reset to `bounds.y.max` at
new random x/z. Count 800 in PETALS, 200 in HUB, 0 elsewhere.

## objects/starfield.js

`THREE.Points`, 4000 stars on the sky sphere (radius `SKY_RADIUS`),
part of `world.sky`. Custom `ShaderMaterial` (additive, transparent,
`depthWrite: false`, `fog: false`) using the `star` texture, with
per-star attributes `color`, `size`, `phase`.
- Placement: 65% uniform on the sphere, 35% concentrated in a Milky Way
  band (gaussian, ~10° half-width) along a great circle tilted ~60° to
  the horizon.
- Brightness: power-law magnitudes (many faint stars, few bright).
  Pixel sizes 1.5–6 (× pixel ratio; `starfield.setPixelRatio(r)` updates it when adaptive
  quality changes the ratio). The brightest ~40 are pushed above
  1.0 (HDR) so they bloom softly.
- Colour: spectral variety from PALETTE only: lavender 45% (cool,
  blue-white), paper 30% (white), gold 15% (warm), softPink 10% (red
  giants).
- Twinkle: atmospheric scintillation in the vertex shader,
  `size *= 0.85 + 0.15 * sin(time * (1.5 + phase) + phase * 40)`,
  smaller amplitude for faint stars.
- Rotation: the whole sky turns slowly, `0.02 rad/s`, about the Milky
  Way's tilted axis (like real night-sky motion).
- Shooting star: one soft streak (stretched additive quad) every 14–28 s
  at random, 0.8 s lifetime.
- Reduced motion: no twinkle, no shooting stars, no rotation.

## objects/nebula.js

Part of `world.sky`. 4 large planes (sizes 300–500) placed at different
directions on the sky sphere, each `lookAt(0,0,0)` so they face the
camera at the centre; one is stretched along the Milky Way band. Shader:
4-octave fbm value noise computed in the fragment shader (no texture
file), colour mixed between `warmPurple` and `lavender` with a touch of
`softPink` at the brightest knots, smooth radial falloff at the edges.
Additive, transparent, `depthWrite: false`, `fog: false`, opacity ≈ 0.25.
The noise offset drifts slowly with time (≈ 0.004 units/s) so the clouds
appear to breathe. Reduced motion: no drift.

## objects/fragment.js

Small rotating cube (0.3u), lavender emissive, `enableBloom()`. Particle
trail as it flies to orb over 800ms (eased). On arrival: 3-note
ascending chime, cube disappears into orb. Reusable geometry + material.

## objects/bouquet.js

A small purple bouquet. Reused in HUB (on shrine) and FINAL (on table
next to laptop). Reference: the letter says "I hope you liked the
flowers." This object makes that line true.

Geometry:
- 7–9 small cone/flattened-sphere blossoms in lavender, warmPurple,
  softPink
- Stems (thin cylinders, MeshLambertMaterial moss)
- Paper wrapper cone (paper color, slight transparency)
- Ribbon ring at base (vermillion or gold)

Material: `MeshStandardMaterial` (close-up object, worth the cost).
Only the blossom tips use `enableBloom()`.
`create()` returns Group; no per-frame update needed.

## Room: PASSCODE

First screen of the experience (there is no timer lock). Backdrop:
`world.sky` (starfield + nebula), fog density 0.03 in deepIndigo, one
distant torii (dim), lavender accents. DOM overlay, serif: the heading
lines and the hint line from TEXT.md (they type out once) + 4 box
inputs (auto-advance on digit). Enter key submits. Wrong → shake 400ms,
clear, wrong-code line from TEXT.md (types out). Correct →
`save.setUnlocked()`, `audio.play('hub')`, fullscreen request, moonlight
flash 600ms, `machine.go('THRESHOLD')`.
Developer bypass: only when `?dev=true` is present. In production mode, `0000` must be treated as an ordinary incorrect code. Never render or announce the bypass code in user-facing UI.

## Room: THRESHOLD

Plot beat (locked): She just got home after finishing her university
work. Bag still on her shoulder. She sees an extra door in her place —
one that wasn't there before. A note is taped to it.

3D setup:
- Small dark room. Warm low light.
- Floor plane `MeshLambertMaterial(warmPurple, opacity 0.4)`.
- A bag (BoxGeometry, lacquer) on the floor near the door.
- A plain door (BoxGeometry, warmPurple) as the "normal" door.
- An extra door on the side wall (BoxGeometry, warmPurple) with a
  faint lavender rim glow.
- A note (Plane with paper texture) taped to the extra door.

Interaction (edge-triggered; do not run a proximity action every frame):
- The first time she enters the 2-unit door radius, open the `note` overlay with TEXT.md door-note. Set `noteSeenThisVisit` before opening it so it cannot reopen while she remains in range. Enter/click finishes the typewriter and closes the note.
- Indoors she moves at walking pace (speed 5) and the walls are solid.
- After the note closes, arm the second approach only after she has left the door radius (distance >2.5 units). On the next entry into the 2-unit radius, play the portal flash and transition to `HUB`. Do not transition while the note is open. Reset these local flags only if THRESHOLD is intentionally restarted; a normal refresh returns to PASSCODE or HUB according to saved progress, not to an endless note loop.

Ready cue: once the note has closed, the extra door's lavender rim glow
starts a slow pulse (about a 2 s cycle, brighter than before, no text)
and keeps pulsing until she goes through; it is the only hint that the
door is ready. If she is still inside the 2-unit radius when the note
closes, the cue still shows and the door stays inactive until she has
left (>2.5 units) and come back. Reduced motion: hold the brighter glow
steady.

A short `line` overlay (non-blocking) types in the arrival line from
TEXT.md (see "THRESHOLD — arrival line") on entry and fades out 4 s
after it finishes. Right after it, the look hint and controls hint
appear (see UI: prompts.js). `world.sky.visible = false` while in THRESHOLD
(indoor room); it is shown again on leaving.

## Room: HUB

Implementation notes: the next `open` gate pulses gently so she knows where
to go; walking into a gate while a story bubble is still open waits until
it is dismissed (the transition would otherwise cut the line off).

Torii shrine floating in void. `world.sky`, 200 petals.
Small bouquet on the shrine altar (objects/bouquet.js).

Five doors arranged in a semicircle:
- Doors 1–4: torii gates in `ROOM_ORDER`, rune above each. They unlock one at a time: a gate is `open` when every earlier room in `ROOM_ORDER` is done, `done` once its own room is done, otherwise `locked` (see objects/torii.js `setState`). Use an edge-triggered proximity crossing with a transition lock so a single approach starts only one room transition. Walking into a `locked` gate never starts a room; it plays the locked-gate orb line from TEXT.md (ambient, once per approach). `done` gates glow lavender with a small check mark and remain replayable; replaying a completed room must not erase its saved completion, and `setRoomDone(name)` is idempotent. Dev-mode state jumps ignore the lock.
- Door 5: sealed. Dark, no glow. A small paper note on the door shows
  the sealed-door note from TEXT.md, rendered as text on the note's
  texture in 3D (not an overlay). Walking into it → sealed-door orb line.

When all 4 rooms are done, a portal spawns in front of door 5
(objects/portal.js). Walking into the portal → `machine.go('FINAL')`.

Returning after a room: play the "Returning after a room" line (ambient)
after rooms 1–3 only. After the 4th, the "All 4 done" story line plays
instead.

Orb intro: on first arrival (only when `roomsDone.length === 0`) the orb
says the 4 beats of "ORB intro" from TEXT.md, one story bubble at a time
(each types out; Enter continues). The 5th beat, "ORB second bubble",
plays once, the first time she comes within `SECOND_BUBBLE_DISTANCE`
(20 units) of any torii gate. "Already played" flags live in memory
only; a refresh before her first room is finished replays the intro
(acceptable).

## Room: TORII (challenge — pattern memory, tutorial)

9 torii gates in a loose arc. 3 rounds. Each round flashes 3 distinct gates in a stored sequence (600ms lit, 300ms gap). The orb visibly indicates which gate is currently being demonstrated. Do not accept crossings while the sequence is flashing or during the inter-flash gap. After playback finishes, accept only a player crossing through the opening of the next expected gate (not proximity to its frame or passing behind it). Correct → gate stays lit and progress advances. Wrong → all gates dim, 800ms pause, show the Wrong line once, and replay the current round from the beginning. Debounce each crossing so one movement cannot count twice. After all 3 rounds, spawn the portal, show the Complete line, and save `torii` once. Portal returns to HUB.

`hintTargets()` returns gates in the current sequence. `onNudge()` (60 s hint, after the Hint line) replays the current round, then keeps the round's first gate softly pulsing until she crosses it, so the line ("watch them again. i'll flash the first one for you.") is true on both counts. It runs only when no story dialogue or sequence is active; never overlap two flash sequences, and crossings are not accepted during the replay.

## Room: COMPILE (challenge — exploration + code fragments)

Small shrine with 5 chōchin lanterns at varying heights, partly
hidden by shoji panels and drifting petals.

- Flying within 3 units of a lantern lights it (chime, emissive up)
- On light: spawns a `fragment` cube that flies to orb
- On orb arrival: `issuecard.revealNextLine()` types the next code line
- Each lantern = one fragment = one line on HUD issue card

HUD issue card (top-right DOM): keep it inside a reserved top-right safe zone. The orb dialogue bubble must clamp away from that safe zone; if necessary, place the bubble on the opposite side of the orb. They must never overlap or obscure each other.
- Header: `#0042 — bring-him-home`
- Status: `open` → `resolved`
- Body: 5 code lines revealed one per fragment
- Resolution comment (revealed after 5th): see TEXT.md
  "COMPILE — resolution comment". This is the "why he got teleported"
  beat — the issue card closes the loop on the mystery.

Lanterns can be discovered in any order, but the issue card reveals the next unrevealed code line in the fixed sequence. A lantern can count only once; entering its radius repeatedly must not create duplicate fragments. While a story bubble is open, enqueue COMPILE fragment counters in the `progress` queue rather than overlaying the bubble. Do not queue generic hints or stale ambience behind story dialogue.

On 5th fragment:
- Issue card animates to `resolved` (checkmark, color shift to matcha)
- Resolution comment types out below the code
- Compile animation: rapid matcha scroll 1.2s
- Floating panel in room center shows assembled code for 3s, then fades
- Portal opens
- Orb line: "that's the last piece. the code is whole. he can come home now."
- `save.setRoomDone('compile')`

`hintTargets()` returns unlit lantern positions.

## Room: STARS (challenge — ordered traversal)

Deep void, 9 large glowing stars arranged along a recognizable heart outline. Stars are activated by proximity, not clicking; use a trigger radius of `STAR_TRIGGER_RADIUS` (1.1 world units, about the size of each star's visible glow) and activate each star once per attempt. Test entry with a swept check (the segment from last frame's position to this frame's against the sphere), so a fast pass at the 0.05 s delta cap cannot skip a star. Triggers are edge-triggered: a star counts only at the moment she enters its sphere; after a reset, a star she is still inside does not count until she has left and re-entered. All nine coordinates must be distinct: star 1 and star 9 must not overlap. Player reaches the next expected star → it brightens and the trail advances. Entering any other star trigger resets the sequence and trail, plays a soft pulse, and queues the Wrong line without interrupting story dialogue. All 9 → heart outline glows, portal opens, and `stars` is saved once.

Use these nine ordered points in unit space (a symmetric heart; x right, y up, lying in the x/y plane), then scale x/y by 4 and use fixed z offsets alternating -0.5 and +0.5 (star 1 gets -0.5, star 2 gets +0.5, and so on): `(0.44,0.78) (1.0,0.49) (0.9,-0.14) (0.41,-0.6) (0,-1.12) (-0.41,-0.6) (-0.9,-0.14) (-1.0,0.49) (-0.44,0.78)`. Star 5 is the bottom tip; stars 1 and 9 sit just either side of the heart's top notch, so after the ninth star the glowing outline fills the small gap. The closest pair of stars is about 2.7 units apart (more than twice the 1.1 trigger radius, with 0.5 units of clearance), so trigger spheres never overlap. Spawn the player about 14 units in front of the heart (on its +z side, at its vertical centre), facing it, so the heart reads from the front on arrival. Validate the outline in a front-on debug view (looking down -z) before polish.

`hintTargets()` returns only the next correct star position.

Implementation notes (owner asked for gentle guidance): the next expected
star's halo breathes slightly; re-entering a star already lit in this
attempt is ignored rather than resetting (only an unlit, out-of-order star
resets). The nine SPECS points alone read as a shield (stars 1 and 9 are
the highest points), so the glowing outline is one smooth closed curve
through the nine stars plus a notch point at (0, 0.42) between stars 9 and
1; with it the finished shape reads clearly as a heart. Star positions are
unchanged.

## Room: PETALS (challenge — follow the guide)

Corridor ~80 units long and 20 wide, centred inside the standard 100-unit room bounds. 800 petals stream from the far end toward the player; use instancing. Soft wind streaks (dashed segments) in warmPurple. Orb drifts forward. If player is >15 units behind, the orb pauses; if >30 units behind, it returns toward the player. Reaching the corridor end opens the portal, shows the Complete line, and saves `petals` once. Walking through the portal returns to HUB (where the door-5 portal may now be open). All room geometry and waypoint targets must stay inside bounds.

`hintTargets()` returns orb's own next-waypoint position.

## Room: FINAL

Reached from HUB by walking through the portal that spawned in front
of door 5 (after all 4 rooms are done).

Void. Lacquer table (BoxGeometry 2×0.1×1). Chair in lacquer. Office chair (seat box +
back box + cylinder leg). Laptop (base box 0.35×0.02×0.25 + screen
box 0.35×0.24×0.01 tilted, screen uses `MeshBasicMaterial` with
canvas texture showing the letter title). Small bouquet
(objects/bouquet.js) on the table next to the laptop. Portal
(disabled) in front of the table, present from the start.

She arrives off to the side of the table (not looking through the waiting
portal). Approach chair → lock movement, lower camera over 1.2s, then open the letter overlay (typewriter, floating polaroids from `src/assets/pics/`, music `letter`). The Skip control must be explicit and keyboard accessible (Tab to it,
Enter). Enter while the letter is typing does not skip it; once it has
fully typed, Enter/click closes it. The paper reserves its full size and
scrolls to follow the typing on short screens. Only after typing completes or she deliberately skips: fade the overlay, save `seenLetter`, restore the chair-facing camera, and show the “turn around.” story bubble. Do not allow the reveal transition to arm during the camera move or while the letter is open. When the letter overlay has finished opening, start buffering the reveal video (see core/assets.js).

Arm the turn-around trigger only after the “turn around.” bubble has been dismissed with Enter/click and the camera is in its stable chair-facing pose. Then require a wrap-safe shortest-angle yaw change greater than 120° from that recorded baseline to enter `REVEAL`; ordinary movement before arming must not trigger it. Gentle backup: if she has not turned within `TURN_ASSIST_DELAY` (8 s) of arming, ease the camera's yaw 180° over `TURN_ASSIST_DURATION` (2.5 s, ease-in-out; mouse look ignored during it), then enter `REVEAL`. The timer pauses while the tab is hidden. Clear held keys and input repeat state at each transition.

On enter, save `reachedFinal`. If `seenLetter` is already true after a refresh, restore the chair-facing view and replay the “turn around.” beat without showing the letter again, and start buffering the reveal video immediately.

## Room: REVEAL (superseded 2026-10-11 by v3: avatars, the hug, his words; the video below is no longer used)

The final reveal is the owner's recorded full-screen video with voice. There is no audio-only variant and nothing to configure. Files: `public/media/reveal/reveal-video.mp4` and `public/media/reveal/reveal-poster.webp`.

Enter only after the FINAL turn-around trigger is armed and activated. On entry:
1. Release pointer lock and clear held keys (so the Play control can be clicked), pause the 3D loop like a blocking overlay, and `audio.fadeOut(800)` the letter music.
2. Fade in the full-screen `<video>` over 1500 ms (`object-fit: cover`, no native controls, `poster` = the poster image) and call `play()`.
3. If `play()` is rejected (autoplay blocked), show a deliberate Play control over the poster (a calm button; Enter or click starts playback).
4. If the video raises an `error`, or has not started playing within `REVEAL_START_TIMEOUT` (8 s) of the play attempt (or stalls that long mid-play), show `reveal-poster.webp` with the fallback line from TEXT.md and a Continue prompt (Enter or click). The reveal must never trap her.

Scene continuity: REVEAL reuses FINAL's scene group (`final`), because the portal glow and camera drift happen in it. `final.exit(nextName)` therefore does NOT dispose its group when `nextName === 'REVEAL'`. FINAL exposes `buildScene()` (table, chair, laptop, bouquet, portal); `REVEAL.enter()` calls `world.getGroup('final')` and, if the group is missing or empty (for example after the dev tools' "Replay final reveal" jump), calls `buildScene()` first. `REVEAL.exit()` disposes the group.

Completion (video `ended`, or Continue in the fallback): resume the 3D loop, fade the video out over 1000 ms, glow the portal, ease the camera to face it and drift toward it over 3 s, moonlight flash, then END. Save `seenReveal` immediately before entering END, never on entry to REVEAL. There is no skip button during normal playback (dev mode's state jumps cover testing).

## Room: END

Dark warm purple gradient (DOM, translucent: deepIndigo → warmPurple at
about 75% opacity) over a live 3D backdrop of `world.sky` plus 200
drifting petals (objects/sakura.js, group `end`). The `endcard` is the one
blocking overlay that does not pause the loop (PROJECT.md Rule 14).
Reduced motion: petals hold still. Text from TEXT.md (end card), serif,
the second line smaller. No button. The lines type out one after the
other (typewriter). Music fades to hub track at low volume (after a
refresh, on her first gesture; see core/audio.js).

## UI: overlay.js

`show(type, opts)`, `close()`, `isOpen()`, `type`. Types: `note`,
`letter`, `endcard` (blocking: release pointer lock; `note` and `letter`
pause rAF, `endcard` does not, see Room: END) and
`line` (non-blocking caption: no pause, keeps pointer lock, fades out 4 s
after its text finishes typing). Each is a
`<div class="overlay overlay-<type>">` appended to `#ui`. Fade in 600ms,
fade out 400ms. `contain: strict; will-change: opacity;`.
Dialogue bubbles are NOT handled here (see dialogue.js). PASSCODE
uses its own DOM inside `#ui` and does not pause the loop. All
text in these overlays types out via typewriter.js.

## UI: dialogue.js

`say(orb, line, { mode = 'story' })` creates a bubble `<div>` anchored to the orb's screen position (above it, clamped to screen edges), updated each frame by `dialogue.update(dt)`. Bubble: lavender background, ink text, rounded, max-width 320px. Reserve its final size up front using a hidden full-text copy so it does not resize while typing.

- The line types as if the orb is speaking (38ms per character, punctuation pauses).
- `mode: 'story'`: after typing, show a small pulsing `⏎ enter` hint. The bubble stays until Enter or click. Enter during typing completes the line and consumes that keydown; it must not also dismiss the newly completed line. A separate, non-repeated Enter keydown or click dismisses it. Start the next queued story bubble 400ms later.
- `mode: 'ambient'`: no Enter; fades 2s after typing (+40ms per character beyond 40). Ambient lines never interrupt a visible/queued story line. Ordinary hints may be dropped while story dialogue is active.
- `mode: 'progress'`: used only for COMPILE fragment counters; enqueue each counter in order and show it when no story bubble is visible/queued. Never display two bubbles simultaneously.
- Story lines queue in order. The FINAL “turn around.” bubble is dismissed only by Enter/click; it never auto-dismisses based on yaw. FINAL arms the separate turn-around trigger only after dismissal and after the camera is stable.
- Story = ORB intro beats, ORB second bubble, “All 4 done”, each room's Intro and Complete lines, FINAL lines. Ambient = Success, Wrong, Hint, Lost, sealed door, “Returning after a room”, out-of-bounds line. COMPILE fragment counters use `progress`.
- Reduced motion: typing 2× faster, no pulsing hint.

## UI: typewriter.js

`run(el, text, { speed = 28, clickEvery = 3, pauses = true })` returns a
Promise (resolves when typing ends or is finished early). Writes into a
single text node (no per-character nodes). With `pauses`, extra delay
after punctuation, in multiples of `speed`: `,` ×4, `—` ×5, `.` `?` `!`
×8, `…` or `...` ×10. `clickEvery` triggers a soft tick if `audio` is
unmuted (dialogue uses a quieter, slightly pitch-varied tick,
synthesized with WebAudio, no asset; cut if behind). Enter or click
completes the text instantly. Used for ALL story text: dialogue bubbles
(38 ms), arrival `line`, note, letter, end card, issue card, resolution
comment, PASSCODE lines. Not used for loading text, error
fallbacks, devtools or the small prompts hints. On `prefers-reduced-motion`
the per-character delay is halved (2× faster).

## UI: prompts.js

Three tiny non-blocking DOM elements (serif, lavender text on translucent
deepIndigo, no panel; they fade in/out, no typing). Copy is in TEXT.md →
"UI hints".
- Look hint: shown whenever pointer lock is released and no blocking
  overlay is open (first entry to THRESHOLD, and after Esc). A click on
  the canvas requests pointer lock and hides it. Never shown in REVEAL
  or END (pointer lock is released on purpose there).
- Controls hint: shown once, right after the THRESHOLD arrival line;
  fades out after her first ~3 seconds of movement.
- Audio icon: a tiny speaker glyph at the bottom-left showing on/muted
  (dim when autoplay was blocked or a track is missing). Status only; `M`
  toggles it, and it is also clickable when the pointer is unlocked.

## UI: issuecard.js

DOM panel fixed top-right. Header row, status badge, monospace body.
`revealNextLine()` types the next code line in the fixed canonical order, then reveals it fully. The lantern/fragment index is not used to choose the code line because lanterns may be found in any order.
`resolve()` plays checkmark animation, swaps status to `resolved`,
matcha color shift, and types out the resolution comment from TEXT.md.
`reset()` clears.

## UI: control labels

Button labels not covered by TEXT.md are lowercase single words in the
same voice as the `⏎ enter` hint: `skip` (letter), `play` (blocked
autoplay), `continue` (reveal fallback).

## UI: devtools.js

Only if `DEV`. Fixed bottom-right panel. Buttons: one per state name,
"Complete challenge", "Replay final reveal", "Reset progress". Toggles: fog,
bloom, music. Readout: FPS, camera XYZ. Collapsible. Monospace, dark.

## Styles

base.css: reset, `body { margin:0; overflow:hidden; background:#1a0f2e }`,
`canvas { display:block }`, `#ui { position:fixed; inset:0; pointer-events:none }`,
`#ui > * { pointer-events:auto }`, `#loading` centered fades out.

overlay.css: `.overlay { position:fixed; inset:0; display:grid;
place-items:center; contain: strict; will-change: opacity }`.
`.overlay-note` paper bg, slight rotation, handwriting font.
`.overlay-letter` paper bg, max-width 640px, serif, polaroids absolutely
positioned with `float` animation.

issuecard.css: monospace, dark panel top-right, GitHub-ish. Matcha
`resolved` badge, checkmark SVG. Resolution comment styled as
italic serif, smaller, dimmed.

devtools.css: monospace, dark panel, small buttons.

Fonts in CSS: `handwriting` (Caveat) for `note`; `serif` (Lora) for
`letter`, `endcard`, `line`, PASSCODE and prompts; dialogue bubbles use
the system UI sans stack (`system-ui, -apple-system, "Segoe UI",
Roboto, sans-serif`); issue card uses monospace.

## Asset specs

Photos for letter overlay:
- Source folder: `src/assets/pics/` (the owner may add any number of images).
- Discover supported image files at build time with `import.meta.glob`; do not hard-code a photo count or require a manifest.
- Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`; sort filenames naturally for a stable order.
- Missing/empty folder must not crash the game; omit polaroids gracefully.
- Recommend WebP, max 800px on long edge, quality 80; target around 1 MB total where practical, but do not silently omit extra photos just to enforce a fixed count.
- Before adding photos: apply orientation and strip metadata (EXIF/GPS) and resize; see SETUP.md → Photo prep. The deployed site is public to anyone with the link.
- Render as floating polaroids, with a responsive cap on how many are visible at once while still accepting all files.

Final reveal media (owner chose video + voice):
- MP4 H.264, landscape (1920×1080 or 1280×720), CRF 26, AAC 128k, web-optimized (faststart), target <15MB, duration 45–75s. Poster: `public/media/reveal/reveal-poster.webp` (1280px wide, WebP q80).
- Provide a deliberate Play control if browser autoplay is blocked. Media failure must show the fallback copy from TEXT.md and allow progression to END.

Fonts:
- Google Fonts only (Caveat for handwriting, Lora for serif)
- Download woff2, self-host in public/fonts/
- Subset to Latin
- Files: `handwriting.woff2` (Caveat 400), `serif.woff2` (Lora 400),
  `serif-italic.woff2` (Lora italic, used by the resolution comment).
  Sourcing steps are in SETUP.md → Fonts

Music:
- MP3, 128–192kbps, loopable, target <5MB per track
- Use the three owner-approved instrumental candidates listed in SETUP.md; preview each and reject anything with vocals/lyrics or a song-like lead.
- Record the exact track page, creator, and license in ASSET_CREDITS.md before shipping. Do not assume a whole platform has one license.

## Git

Init once, commit early. Linear history is fine for solo work.

Convention:
```
feat(scope): short description
fix(scope): short description
chore(scope): short description
```

Milestones = tags:
```
v0.1  scaffold deployed
v0.2  passcode
v0.3  hub + orb
v0.4  rooms 1-2
v0.5  rooms 3-4
v0.6  final + reveal
v1.0  shipped
```

## GitHub Issues for task tracking

Create one issue per Build Schedule phase. Labels:
`day-1`, `day-2`, `must-ship`, `cut-if-behind`, `room`, `ui`,
`audio`, `deploy`.

Optional: use okffs MCP to have Claude Code create and manage issues
conversationally. See SETUP.md.

## QA Checklist (run end-to-end before showing her)

1. Fresh browser, no localStorage → PASSCODE screen shows (sky,
   heading lines, hint, 4 boxes); no countdown anywhere
2. Wrong code → shake, wrong-code line from TEXT.md types out, clears
3. Correct code (1010) → request fullscreen + start music + flash → THRESHOLD; if fullscreen/audio is denied, continue without trapping her
4. THRESHOLD: arrival line types in, "click to look around" and the
   controls hint appear then fade, note types out, Enter closes,
   extra door → HUB
5. HUB: orb intro plays as 4 Enter-paced beats, second bubble fires
   near the torii, only TORII is open at first, bouquet visible, sealed
   door shows its note and reads its line
6. TORII: three rounds; no crossings accepted during flash playback; wrong gate resets only current round; correct gate counts once; hints never overlap sequence playback; portal works
7. COMPILE: 5 lanterns light (and visibly glow), fragments fly, HUD
   card fills, resolution comment shows, compile anim plays
8. STARS: nine distinct positions; flying straight through a star at full speed always counts it; stars activate by proximity; from the spawn point they read as a symmetric heart; star 1 and 9 do not overlap; wrong star resets; each trigger counts once; standing inside a star after a reset does not re-trigger it; heart glows
9. PETALS: corridor and all targets fit within room bounds; orb pauses/returns at thresholds; hint timers pause during story dialogue; end opens portal and returns to HUB
10. HUB: portal in front of door 5 now open → FINAL
11. FINAL: bouquet visible on table, letter types fully, skip works,
    polaroids float, orb says "turn around"
12. REVEAL: pointer lock is released and no look hint shows; letter music fades out; the video plays with sound; if autoplay is rejected a Play control appears and Enter/click starts it; a failed, missing or stalled video (>8 s) shows poster + fallback line + Continue; completion → portal glows → camera eases toward it → whiteout → END
13. END: text displays over drifting petals and sky, music fades
14. Refresh mid-room → back at HUB with finished rooms kept
15. Refresh in FINAL before letter completion → letter replays; refresh after letter completion → chair-facing view and “turn around.” beat; refresh after completed reveal → END
16. `?dev=true` → developer panel/bypass work; without it, no developer panel, `0000` bypass, or shortcut exists; verify this in a fresh production URL
17. Wrong URL path → 404 or redirect to /
18. Test resolution, audio, fullscreen on her actual laptop
19. Test with headphones and without
20. Hint system: verify timers pause during story dialogue, blocking overlays, and hidden tabs; beam appears after eligible idle time and never overlaps another sequence
21. Out-of-bounds: fly far in each room, confirm soft return
22. Dialogue: story bubbles type out and wait for Enter; Enter while typing completes the line without also dismissing the newly completed line; repeated keydown does not double-advance; ambient lines never interrupt or overlap story lines; held movement keys clear when overlays/pointer lock change
23. Sky + bloom: fly to every edge of every room — stars and nebula never end, shift, or get fogged out; only intended glowing objects bloom
24. Background-tab recovery: return after 30+ seconds; no teleport/jump, stuck movement, or huge delta; simulation resumes smoothly
25. Performance: test on the target laptop; throttle the GPU/CPU in dev tools and confirm adaptive quality steps the pixel ratio down, then disables bloom, and restores only after sustained good FPS; a tab return or loading hitch never triggers a step
26. Touch-only device: keyboard-first notice appears; laptop controls remain clear
27. Storage disabled/private browsing: game still runs in memory; refresh-resume limitations are disclosed in developer QA
28. Public build: `noindex` is present but do not treat it as access control; developer bypass/panel are inactive and invisible unless `?dev=true`
29. THRESHOLD note opens only once on first approach; it never reopens while standing nearby; after it closes the door pulses; second approach works only after leaving and re-entering the radius
30. HUB gate proximity causes one transition per approach; gates unlock strictly in order (a locked gate plays the locked-gate line and never starts a room); completed gates glow lavender with a check and can be replayed without losing their completion marks
34. FINAL turn-around: turning herself >120° after dismissing "turn around." starts REVEAL; doing nothing for 8 s makes the camera turn her gently and REVEAL starts; nothing triggers before the bubble is dismissed
31. COMPILE issue card and orb dialogue never overlap; fragment counters display in order after story dialogue clears
32. Audio: `M` mutes/unmutes; the speaker icon reflects the state; blocked autoplay or a missing track never blocks progress
33. Photos: every photo in `src/assets/pics/` appears upright and carries no GPS/EXIF metadata (check with `identify -verbose`); an empty folder does not crash the letter

## Favicon

Inline SVG data URI in index.html (exact markup in ## index.html):
lavender circle with gold dot. No `public/favicon.svg` file.
