---
name: deploy
description: Build the project and deploy to Netlify. Use when the user says "deploy", "ship it", "push to production", or "make it live".
---

# Deploy

> Read PROJECT.md (Performance Rules especially) before writing code.
> See SETUP.md for deploy environment details.

## Pre-deploy checklist

- Confirm planning handoff is approved and the final reveal video and poster are in `public/media/reveal/`.
- Confirm `?dev=true` is the only way to enable developer controls/bypass.
- Confirm the public build has no debug panel, developer bypass copy, secrets, or test media.
- Confirm `noindex` is not being represented as privacy/security.
- Verify asset licenses and `ASSET_CREDITS.md`.
- Run `npm run build` and the complete SPECS.md QA checklist; report only tests actually run.

1. `npm run build` runs clean, no warnings
2. All assets selected for the approved design are present in `public/` (music, images discovered from `src/assets/pics/`, video reveal, fonts; textures are optional thanks to procedural fallbacks)
3. Final reveal video is compressed (<15MB, landscape MP4, faststart) and its failure fallback works (poster + fallback line + Continue)
4. Photos upright, metadata-stripped (no GPS), resized (≤800px long edge, WebP recommended); the GitHub repository is private
5. PROJECT.md, SPECS.md, TEXT.md, and PREBUILD_AUDIT.md agree
6. The dev panel and bypass exist only behind `?dev=true`. Never put that URL in the QR code, card, or anything she sees. The public site is not private merely because it has a passcode or `noindex`.
7. Passcode is `1010` and the experience opens straight on the passcode
   screen (there is no timer lock)
8. `.gitignore` includes `node_modules/`, `dist/`, `.env`
9. No room imports `new THREE.Scene` or `new THREE.WebGLRenderer`
10. Run the full QA Checklist from SPECS.md (all listed items)

## Build

```bash
npm run build
```

Confirm `dist/` contains `index.html`, `assets/`, and all `public/` files.

## Deploy

First time:
```bash
npx netlify-cli deploy --prod --dir=dist
```
Follow login prompt. Netlify gives URL like `random-name-12345.netlify.app`.

Rename site:
Netlify dashboard → Site settings → Change site name →
`ayish-birthday` → URL becomes `ayish-birthday.netlify.app`.

Subsequent deploys:
```bash
npx netlify-cli deploy --prod --dir=dist
```

## Post-deploy verification

1. Open live URL on the laptop
2. Test `?dev=true` — dev panel appears, can jump states
3. Open the plain link (no `?dev=true`) in a fresh private window →
   the passcode screen appears, no dev panel
4. Confirm the owner-approved final reveal plays on the live URL, including its failure fallback
5. Confirm music plays after passcode (first user gesture)
6. Confirm localStorage saves progress
7. Test in Chrome, Firefox, Edge

## Optional: custom domain

Buy cheap domain (~$10/yr), add in Netlify → Domain settings. Point
DNS to Netlify. HTTPS is automatic.

## Commit tag

After successful deploy:
```bash
git tag -a v1.0 -m "Ayish birthday v1.0"
git push --tags
```

## Deliverable to Ayish

- Short URL (`ayish-birthday.netlify.app`)
- QR code (qr-code-generator.com, no signup)
- Handwritten card with the URL and the passcode hint

Do NOT put the passcode on the card. Only the hint: "the month and
day you turned 21."
