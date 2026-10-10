---
name: new-room
description: Scaffold a new Three.js challenge room with portal, orb companion, palette, and challenge loop. Use when the user says "create a new room", "add a room", or names a room like "torii path" or "compile".
---

# New Room

> Read PROJECT.md (Performance Rules especially) before writing code.
> Grep SPECS.md for the section you're implementing. Use TEXT.md verbatim.
> See SETUP.md for model + effort recommendations.

Create a new room module in `src/rooms/<name>.js` following the
existing room structure. Reuse shared objects — do not reimplement.

## Reference existing rooms first

TORII is built first and is the reference room. If `src/rooms/torii.js`
exists, read it before writing new code and match its shape; if it does
not exist yet, use the shape below:

```js
export default {
  name: '<name>',
  group: null,
  async enter() {
    this.group = world.getGroup('<name>');
    // populate group with objects
  },
  update(dt) { /* per-frame */ },
  exit() {
    world.disposeGroup('<name>');
  },
  hintTargets() { return [/* Vector3[] */]; },
  nudgeLine: '...'  // from TEXT.md
};
```

## Room module requirements

1. Scene setup — fog color/density from `config.js` palette. No hardcoded hex.
2. Portal — one portal object at exit position. Disabled until challenge done.
3. Orb — enters with player, drifts ahead, emits via
   `dialogue.say(orb, line, { mode })` (`'story'` waits for Enter,
   `'ambient'` fades by itself; see SPECS → UI: dialogue.js).
4. Challenge — `challenge` object with `{ done, progress }`. On complete:
   enable portal, play chime, orb says success line, `save.setRoomDone(name)`.
5. Return to hub — portal entry → `machine.go('HUB')`.
6. Backdrop — `world.sky` (the persistent starfield + nebula; never
   created per room) + fog. No visible edges.
7. Reuse, don't recreate — orb, portal, petals, lantern, torii,
   bouquet are shared objects in `src/objects/` (starfield and nebula
   live in `world.sky`).

## Register the room

Add to `src/state/states.js`:
```js
<NAME>: () => import('../rooms/<name>.js')   // e.g. TORII: () => import('../rooms/torii.js')
```

Add portal to hub in `src/rooms/hub.js`.

## Palette rule

Every color must come from `src/core/config.js` PALETTE. Never hardcode hex.

## Anti-patterns (do NOT do)

- `new THREE.Scene()` inside a room
- `new THREE.WebGLRenderer()` anywhere except core/renderer.js
- `new EffectComposer()` anywhere except core/composer.js
- Creating a starfield or nebula inside a room (use `world.sky`)
- Inline hex colors
- Repeating the same inline geometry/material per instance (shared
  pieces go through the `objects/` registry; one-off set pieces such as
  the THRESHOLD door or the FINAL table may create geometry once in
  `enter()` — `disposeGroup` cleans them up)
- >100 individual Meshes where InstancedMesh fits
- `requestAnimationFrame` calls inside rooms (only main.js loops)

## Commit

`feat(room): add <name> challenge room`
