// Player settings (the pause menu): music and sound-effect volume, mouse
// sensitivity. Kept apart from progress (save.js) under their own key;
// absent or malformed values fall back to the defaults.

const KEY = 'ayish.settings';
const RANGES = {
  music: [0, 1, 0.6],   // × each track's own level (the music sat over the effects at full)
  sfx: [0, 1, 0.8],     // × the effects bus (audio.js)
  sens: [0.3, 2.5, 1.0] // × LOOK_SENS
};

const values = {};
const listeners = [];

function clamp(k, v) {
  const [lo, hi, def] = RANGES[k];
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
}

{
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    raw = null;
  }
  for (const k of Object.keys(RANGES)) values[k] = clamp(k, raw?.[k]);
}

export const get = (k) => values[k];
export const range = (k) => RANGES[k];

export function set(k, v) {
  if (!(k in RANGES)) return;
  values[k] = clamp(k, v);
  try {
    localStorage.setItem(KEY, JSON.stringify(values));
  } catch {
    /* storage blocked: the setting lasts for this visit */
  }
  for (const fn of listeners) fn(k, values[k]);
}

export function onChange(fn) {
  listeners.push(fn);
}
