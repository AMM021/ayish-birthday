# Ayish's Birthday — Claude Code instructions

@PROJECT.md

## Every session

- `PROJECT.md` (imported above) is the source of truth. Grep `SPECS.md`
  by `##` heading for implementation detail and `TEXT.md` for all copy.
  `SETUP.md` covers the dev environment.
- Use `TEXT.md` verbatim. Never paraphrase or "improve" copy.
- Follow the Performance Rules in `PROJECT.md` strictly. Never create a
  Scene, Camera, Renderer or Composer outside `core/` and
  `world/world.js`.
- Colours come from `core/config.js` PALETTE only. No inline hex in JS.
- Use the skills in `.claude/skills/` (new-room, add-challenge,
  add-overlay, deploy) when their triggers apply.
- Commit after each finished item as `feat|fix|chore(scope): ...` and
  tag milestones as listed in `SPECS.md` → Git.
- `PREBUILD_AUDIT.md` tracks known risks, fixes, and unresolved human decisions. Keep it aligned with the other documents.
- Before implementation, check that the planning handoff is explicitly approved. Until then, only audit and edit planning files.
- If the spec is ambiguous, or you think it is wrong, stop and report the conflict before changing it. The final reveal is the approved video + voice; never substitute an audio-only version.
- Do not expose the dev bypass in user-facing copy. `0000` is valid only when the exact `?dev=true` query parameter is active.
- Test keyboard input, dialogue ordering, room bounds, save/resume transitions, and reduced-motion behavior as specified; do not claim tests passed unless actually run.
