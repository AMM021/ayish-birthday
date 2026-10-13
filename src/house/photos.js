import { PALETTE } from '../core/config.js';
import { showPhoto, aspectOf } from './baked.js';

// Their photos (src/assets/pics/): any number, found at build time, in
// natural name order. Where they hang:
//   the letter: every one, turning;
//   the gaming room's three frames: the first three;
//   the entry hall's frames (photo_t0…): the next ones;
//   the house's frames (photo_h0…): from the end of the list (the newest
//   added: the beach), so a frame never repeats another one in its room.
const MODULES = import.meta.glob('../assets/pics/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default'
});
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const PHOTOS = Object.keys(MODULES).sort(collator.compare).map((k) => MODULES[k]);

function pick(role) {
  const n = PHOTOS.length;
  if (!n) return null;
  const m = /^photo_([ht])(\d+)$/.exec(role);
  if (!m) return null;
  const k = Number(m[2]);
  const i = m[1] === 't' ? 3 + k : n - 1 - k;
  return PHOTOS[((i % n) + n) % n];
}

// fillFrames(kept): every kept surface whose role is photo_t… or photo_h…
// shows its photo (paper-coloured if there are no photos at all).
export function fillFrames(kept) {
  for (const [role, mesh] of kept) {
    if (!/^photo_[ht]\d+$/.test(role)) continue;
    const url = pick(role);
    if (url) showPhoto(mesh, url, aspectOf(mesh));
    else mesh.material.color.set(PALETTE.paper);
  }
}
