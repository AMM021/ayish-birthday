// State name → lazy room module.
export const STATES = {
  PASSCODE: () => import('../rooms/passcode.js'),
  THRESHOLD: () => import('../rooms/threshold.js'),
  HUB: () => import('../rooms/hub.js'),
  TORII: () => import('../rooms/torii.js'),
  COMPILE: () => import('../rooms/compile.js'),
  STARS: () => import('../rooms/stars.js'),
  PETALS: () => import('../rooms/petals.js'),
  FINAL: () => import('../rooms/final.js'),
  REVEAL: () => import('../rooms/reveal.js'),
  END: () => import('../rooms/end.js'),
  EXPLORE: () => import('../rooms/explore.js')
};

export const CHALLENGE_STATES = new Set(['TORII', 'COMPILE', 'STARS', 'PETALS']);
