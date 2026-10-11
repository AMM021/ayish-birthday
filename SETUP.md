# SETUP — Development Environment

## CachyOS (Arch-based)

### 1. System packages

```bash
sudo pacman -S --needed nodejs npm git github-cli
node --version   # needs 20.12 or newer (okffs requires it; Vite 5 needs 18+)
```

### 2. Claude Code (terminal)

Native installer (no root, updates itself):

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude --version
```

(Arch alternative: `yay -S claude-code`.) The binary lands in
`~/.local/bin`. If `claude` is not found, open a new terminal; if it
still is not, add that folder to your PATH (CachyOS uses fish by
default: `fish_add_path ~/.local/bin`).

Then, from the project folder:

```bash
cd ~/path/to/WIFES_BIRTHDAY
claude
```

Sign in with your Claude account when prompted. Claude Code needs a paid
plan such as Pro (the free plan does not include it). On Pro, Claude Code
and claude.ai share one usage limit.

### 3. VS Code (optional, you already have it)

```bash
yay -S visual-studio-code-bin
```

(Or `paru -S visual-studio-code-bin`.) The terminal flow above works the
same in VS Code's integrated terminal (`Ctrl+``). The Claude Code
extension is optional: `Ctrl+Shift+X` → search "Claude Code" → install
from publisher **Anthropic**.

### 4. GitHub CLI

```bash
gh auth login
```

Choose HTTPS, authenticate via browser. This lets Claude Code create
issues, PRs, and manage your project board. (VS Code's GitHub link and
`gh` are separate logins; do both.)

### 5. Optional: okffs MCP for richer GitHub integration

Requires Node 20.12+. In your project root:

```bash
npx @neturely/okffs setup
```

Follow prompts. The wizard writes a `.env` with your GitHub details
(`.env` is git-ignored: never commit it). This repo already contains the
`.mcp.json` that registers okffs with Claude Code; the first time you
run `claude` in this folder it asks you to approve that server: approve
it. This lets Claude Code create issues and project boards
conversationally, and push matching branches. The repository configuration
currently uses `@neturely/okffs@latest`, which can change over time. Review
the package and trust its source before approving the server; do not blindly
approve an unfamiliar MCP server. If you skip okffs, delete `.mcp.json` so
you are not asked about it.

### 6. Project bootstrap

The folder `WIFES_BIRTHDAY` already exists and is linked to GitHub, so do
NOT run `npm create vite` (it creates a new nested folder and a demo
app). Check the link with `git remote -v`, then start `claude` and paste
the kickoff prompt from README.md. Day 1 Morning creates `package.json`,
`vite.config.js` and `index.html` exactly as given in SPECS.md →
Bootstrap, then runs `npm install`. (The npm package name stays
`ayish-birthday`: npm names must be lowercase.)

### 7. Run

```bash
npm run dev
```

Open `http://localhost:5173` in Chrome or Firefox on the laptop.

## Claude Code model & effort

Inside a Claude Code session:

- The build started on Opus. `/model sonnet` can take over at any point:
  the conversation carries on, and every decision lives in the planning
  docs and `PREBUILD_AUDIT.md`, so a fresh session loses nothing either.
- `/effort high` — for 3D math, game logic, shaders, state machine
- `/effort low` — for boilerplate, refactors, cleanup, comments

Rule of thumb: high for anything that touches Three.js or timing.
Low for CSS tweaks, renames, file moves.

Claude Code reads `CLAUDE.md` automatically at the start of every
session, and that file imports `PROJECT.md`, so the source of truth is
always loaded. Run `/clear` between Build Schedule phases to keep the
context lean, commit after each phase, and keep an eye on usage (on Pro,
Claude Code shares one limit with claude.ai).

## Git workflow

Keep the GitHub repository **private**: it will contain your photos and the letter.

If VS Code already initialised this folder and linked it to GitHub, skip
ahead (check with `git remote -v` and `git status`). Otherwise:

```bash
git init
git add .
git commit -m "chore: initial scaffold"
git remote add origin <your-repo-url>
git push -u origin main
```

Convention:
```
feat(scope): short description
fix(scope): short description
chore(scope): short description
```

Milestone tags:
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

Create one issue per Build Schedule phase. Suggested labels:

- `day-1` / `day-2`
- `must-ship` / `cut-if-behind`
- `room` / `ui` / `audio` / `deploy`

Tick them off as you go. This is your "goals on GitHub" board.

Optional: use okffs to have Claude Code create and update issues
conversationally ("create an issue for the TORII room and add it to
the project board").

## Fonts

Run these once, after the Day 1 scaffold has created `package.json`:

```bash
npm install --save-dev @fontsource/caveat @fontsource/lora
mkdir -p public/fonts
cp node_modules/@fontsource/caveat/files/caveat-latin-400-normal.woff2 public/fonts/handwriting.woff2
cp node_modules/@fontsource/lora/files/lora-latin-400-normal.woff2 public/fonts/serif.woff2
cp node_modules/@fontsource/lora/files/lora-latin-400-italic.woff2 public/fonts/serif-italic.woff2
npm uninstall @fontsource/caveat @fontsource/lora
```

These are the Google Fonts Latin subsets as woff2, self-hosted. The
uninstall keeps `package.json` exactly as specified; the copied files
are all that is used. If a file name differs, look with
`ls node_modules/@fontsource/caveat/files | grep latin`.

## Textures

`petal`, `star`, `paper` and `shoji` have procedural fallbacks (SPECS →
core/assets.js), so nothing breaks without files and building can start
immediately. To upgrade later, drop your own into `public/textures/`
with the same names (`petal.png`, `star.png`, `paper.jpg`, `shoji.png`).
For `paper.jpg`, CC0 paper textures from ambientCG.com or Poly Haven work
well (resize to ≤1024px, JPEG quality 80).

## Final reveal (no media to record)

The owner dropped the video on 2026-10-11. The reveal is built from the
avatars (`public/models/avatars/*.glb`, made with `art/blender/avatars.py`,
`anim.py` and `export_avatars.py`; see ASSET_CREDITS.md) and his words in
TEXT.md. Nothing needs to be recorded.

## Music sourcing and selected instrumental tracks

Requirement: instrumentals only. No singing, lyrics, or vocal samples; avoid tracks that feel like standalone pop songs. Keep the music quiet under dialogue and the video voice. These are the selected candidates; preview each before downloading, since web metadata cannot replace listening. All three pages list free use under the Pixabay Content License, which is not the same thing as CC0. Save the actual downloaded files with the filenames below and record the download date in `ASSET_CREDITS.md`.

- `hub.mp3` — [Japanese Aikoto Instrumental 9](https://pixabay.com/music/ambient-japanese-aikoto-instrumental-9-470508/) by KOTO-JAPAN-SOUNDTRACK. Dreamy, slow, Japanese-inspired ambient texture for the hub. The creator labels it 100% instrumental / no vocals.
- `challenge.mp3` — [Softer Version — Healing Anime 10](https://pixabay.com/music/ambient-softer-version-healing-anime-10-470676/) by KOTO-JAPAN-SOUNDTRACK. A slightly more forward, hopeful instrumental for exploration/challenges; keep its volume low and loop gently. The creator labels this series instrumental / no vocals.
- `letter.mp3` — [Peaceful Ambient Background](https://pixabay.com/music/ambient-peaceful-ambient-background-478782/) by samsabt. Slow evolving pads and soft piano, explicitly described as instrumental with no vocals, for the letter scene.

Preview each candidate before use and replace it if it has vocals, a distracting lead melody, or a noticeable loop seam. Check the individual page and current Pixabay Content License before shipping; keep each track under 5 MB where practical. Credit is courteous even where not required. The letter/video voice must remain clearly audible; duck or pause background music during the reveal video.

## Photo prep for letter overlay

- Put your personal photos in `src/assets/pics/` (create the folder if needed). The number can vary; there is no 3–5 limit.
- Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`. Give files clear names such as `01-first-date.jpg`, `02-us-at-the-beach.jpg`; natural filename sorting determines display order.
- Recommended: WebP, max 800px on the long edge, quality 80. Keep the total reasonably small for quick loading, but the game must accept any number of files and gracefully handle an empty folder.
- Tools: **Squoosh.app** (browser, free) or ImageMagick:
  ```bash
  magick input.jpg -auto-orient -strip -resize "800x800>" -quality 80 output.webp
  ```
- `-auto-orient` rotates phone photos upright *before* `-strip` removes the rotation tag; `-strip` removes EXIF metadata, including GPS location; `"800x800>"` shrinks only photos larger than 800px on their long edge (portrait or landscape). Check a result with `identify -verbose output.webp | grep -i -E 'gps|exif'` (no output means clean). Squoosh also re-encodes without metadata, but still check that photos are upright.
- Your photos and video end up on a public URL: keep the GitHub repository private and share the link only with her.
- Implementation should use Vite `import.meta.glob` over `src/assets/pics/*` so the build automatically discovers images; no manifest or hand-edited list should be required. A responsive visual cap is okay, but do not hard-code the total photo count.

## Favicon

Nothing to create: the favicon (lavender circle, gold dot) is an inline
SVG data URI in `index.html` (SPECS → index.html), so it can never be
missing.

## Deployment

```bash
npm run build
npx netlify-cli deploy --prod --dir=dist
```

Follow the login prompt the first time. Then rename the site in the
Netlify dashboard to `ayish-birthday` → URL becomes
`ayish-birthday.netlify.app`.

## QR code for the physical card

Generate at qr-code-generator.com (no signup). Print. Hand her the
card with the QR code and the passcode hint: "the month and day you
turned 21." Do NOT put the passcode itself on the card.
