---
name: add-challenge
description: Add a self-contained challenge mechanic to an existing room. Use when the user says "add a challenge", "make the player collect/find/sequence", or "add a mini-game".
---

# Add Challenge

> Read PROJECT.md (Performance Rules especially) before writing code.
> Grep SPECS.md for the section you're implementing. Use TEXT.md verbatim.

Challenges live inside their room file, but the mechanic pattern is
shared. Follow this contract.

## Challenge object shape

```js
const challenge = {
  name: 'lanterns',
  done: false,
  progress: 0,
  total: 5,

  update(dt, playerPos) { ... },
  onPlayerInteract(object) { ... },
  onPlayerProximity(object, dist) { ... },
  reset() { ... },
  complete() {
    this.done = true;
    this.onComplete?.();
  }
};
```

## Rules

1. No fail states. Wrong input → soft reset + gentle feedback.
2. Feedback is generous. Highlights, chimes, glow pulses near right answer.
3. Completion reward consistent: portal enables, orb says line, chime,
   `save.setRoomDone(roomName)`.
4. Visual language consistent. Glowing = interactable. Lit = done.
   Dim = inactive.
5. No time pressure unless room explicitly timed (none are).

## Existing challenge patterns to reuse

- Sequence memory — `src/rooms/torii.js`
- Proximity collection + code fragments — `src/rooms/compile.js`
- Ordered traversal — `src/rooms/stars.js`
- Follow the guide — `src/rooms/petals.js`

Copy the shape of the nearest matching pattern.

## Hint integration

Every room implements `hintTargets()` returning current uncollected
positions. `core/hints.js` uses them for the 90s+ beam. A room may also
define `onNudge()` for room-specific help at 60s (TORII flashes the
first gate of the current round).

## Anti-patterns

- Creating a new material per instance
- Using MeshStandardMaterial on distant or numerous objects
- Real point lights instead of emissive materials for lanterns
- Time-based logic using `Date.now()` instead of `core/clock.js`
- Creating a challenge outside its room file

## Test

Open room via dev mode (`?dev=true`, "Jump to state"), complete the
challenge, confirm portal opens, confirm localStorage shows room done.

## Commit

`feat(challenge): add <name> mechanic to <room>`
