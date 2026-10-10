# Ayish's Birthday

A planning package for a single-page browser 3D experience. The game source code has not been built yet. The intended experience is passcode-gated: free-fly through four Japanese-themed purple rooms guided by a glowing orb to rebuild the code that brings him home.

## Read first

- `PROJECT.md` — source of truth, read every session
- `SPECS.md` — implementation detail, grep by section heading
- `TEXT.md` — locked copy, use verbatim
- `SETUP.md` — dev environment, tooling, model settings
- `CLAUDE.md` — loaded automatically by Claude Code; imports `PROJECT.md`

## Setup

See `SETUP.md` for full environment setup (CachyOS, Claude Code in the
terminal, GitHub CLI, okffs MCP, fonts).

Quick start (once the Day 1 scaffold exists):
```bash
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome or Firefox on a laptop.

## Dev mode

Add `?dev=true` to the URL to enable the developer-only bypass and debug panel (jump states, complete challenges, replay the final reveal, reset). Without that exact parameter, neither the bypass nor the panel may exist. Never test dev mode using the public gift URL. The passcode is a surprise gate, not strong security.

## Build & deploy

```bash
npm run build
npx netlify-cli deploy --prod --dir=dist
```

## Personal photos

Add any number of personal photos to `src/assets/pics/` (create the folder if needed). Supported extensions are `.jpg`, `.jpeg`, `.png`, and `.webp`. The Vite build should discover them automatically; no manifest or fixed photo count is required.

## Structure

See PROJECT.md File Structure section.

## QA

Run every item in the QA Checklist in SPECS.md before showing her; update the checklist if the spec changes.

## Kickoff prompt for Claude Code

Paste this once files are in place:

> Read PROJECT.md, SPECS.md, TEXT.md, SETUP.md, and PREBUILD_AUDIT.md. First summarize the rules and unresolved human decisions; do not start implementation until I explicitly say the planning handoff is approved. Do not paraphrase TEXT.md. Follow PROJECT.md Performance Rules. Never create duplicate Scene/Camera/Renderer/Composer instances. Use the project skills when applicable. If any document conflicts, stop and report the exact conflict instead of guessing.

In a fresh session after `/clear`, `CLAUDE.md` already loads
`PROJECT.md`, so this is enough: "Continue with the next item in the
Build Schedule."
