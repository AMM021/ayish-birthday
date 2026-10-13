# Tests (headless Chrome)

`e2e/` drives the real game in headless Chrome (puppeteer-core, the system
`/usr/bin/google-chrome-stable`) through the dev hook `window.__game`, which
exists only with `?dev=true`.

    cd tests/e2e && npm install          # once
    npx vite build && npx vite preview --port 5300 --strictPort   # the build under test
    # a frozen copy, so a rebuild never changes files under a running test:
    npx vite build --outDir tests/snap && (cd tests/snap && python3 -I -m http.server 5400)
    tests/e2e/runall.sh > tests/runall.log 2>&1     # everything, ~40 min

- `GPU=1` uses the laptop's real GPU (most tests need it); STARS' bot
  (`v3stars.mjs`) runs on the software renderer only.
- `BASE=` picks the server (default in `lib.mjs`); `perf.mjs` uses :5300.
- Screenshots and logs land in `tests/` (ignored by git).

Kept in the repo since 2026-10-13: the harness lived in a temporary folder
and a reboot wiped it (rebuilt from the session transcript).
