// Single source of tunable constants. Colours come only from PALETTE.

export const PALETTE = {
  deepIndigo: '#1a0f2e',
  warmPurple: '#4a2c6d',
  lavender: '#c4a5e8',
  softPink: '#e8a5c4',
  gold: '#ffd88a',
  vermillion: '#e85a4f',
  paper: '#f5eee0',
  ink: '#2a1f1a',
  matcha: '#8fc9a3',
  moss: '#3f5e45',
  moonlight: '#fdf8ff',
  lacquer: '#120a1c',
  // v2: the light-purple world (cute, never eerie)
  lilacSky: '#c9b2f2',
  lilacHaze: '#f3e9ff',
  lilacMist: '#e2d3f8',
  wisteria: '#a68ad9',
  blush: '#f7d6e6',
  twilight: '#6e55a8',
  dusk: '#9a7cc9',
  meadow: '#b9dca4',
  sunlit: '#fff1d6',
  // the house: warm wood, soft linen
  oak: '#c9a27e',
  walnut: '#8b6450',
  linen: '#f6efe9',
  peach: '#ffcfa6', // sunset horizon
  bark: '#b59a86', // weathered timber (the avenue's trellis)
  // texture tints: multiplied over a photo texture, never seen as colours
  neutral: '#ffffff', // the texture as it is
  stoneLilac: '#f2ecf8', // pale stone, a breath of lilac
  stoneShade: '#e6dff0' // the same stone in shade (block sides)
};

export const PASSCODE = '1010';
export const DEV_PASSCODE = '0000';

// Only the exact `?dev=true` query parameter enables developer mode.
export const DEV = (() => {
  try {
    return new URLSearchParams(location.search).get('dev') === 'true';
  } catch {
    return false;
  }
})();

export const REDUCED_MOTION = (() => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();

export const ROOM_ORDER = ['torii', 'compile', 'stars', 'petals'];
// The fragment each level grants, in ROOM_ORDER: H · O · M · E.
export const FRAGMENT_LETTERS = { torii: 'H', compile: 'O', stars: 'M', petals: 'E' };

// Sky + fog + light presets. `stars` and `nebula` are 0..1 opacities.
export const ATMOSPHERES = {
  day: {
    top: PALETTE.lilacSky, horizon: PALETTE.lilacHaze, bottom: PALETTE.lilacMist,
    clouds: PALETTE.blush, fog: PALETTE.lilacMist, fogDensity: 0.012,
    stars: 0, nebula: 0, hemi: [PALETTE.lilacHaze, PALETTE.wisteria, 1.1], ambient: 0.45, sun: 1.1
  },
  twilight: {
    top: PALETTE.twilight, horizon: PALETTE.dusk, bottom: PALETTE.twilight,
    clouds: PALETTE.softPink, fog: PALETTE.dusk, fogDensity: 0.008,
    stars: 1, nebula: 0.6, hemi: [PALETTE.lavender, PALETTE.twilight, 0.8], ambient: 0.35, sun: 0.25
  },
  // COMPILE after `npm run dev`: the world he was making, in sunshine
  garden: {
    top: PALETTE.lilacSky, horizon: PALETTE.sunlit, bottom: PALETTE.blush,
    clouds: PALETTE.moonlight, fog: PALETTE.sunlit, fogDensity: 0.006,
    stars: 0, nebula: 0, hemi: [PALETTE.sunlit, PALETTE.meadow, 0.85], ambient: 0.3, sun: 1.15
  },
  // the finished world: a warm, forever sunset over the garden and city
  sunset: {
    top: PALETTE.lilacSky, horizon: PALETTE.peach, bottom: PALETTE.blush,
    clouds: PALETTE.softPink, fog: PALETTE.peach, fogDensity: 0.004,
    stars: 0, nebula: 0, hemi: [PALETTE.sunlit, PALETTE.blush, 0.95], ambient: 0.42, sun: 1.25,
    sunDir: [-0.67, 0.31, 0.67] // low in the south-west, as baked (art/blender/build.py)
  },
  indoor: {
    top: PALETTE.lilacSky, horizon: PALETTE.lilacHaze, bottom: PALETTE.lilacMist,
    clouds: PALETTE.blush, fog: PALETTE.lilacHaze, fogDensity: 0.01,
    stars: 0, nebula: 0, hemi: [PALETTE.lilacHaze, PALETTE.wisteria, 0.9], ambient: 0.5, sun: 0.4
  }
};

export const CAMERA_FAR = 500;
export const PIXEL_RATIO_CAP = 1.5;
export const BLOOM_RESOLUTION = 0.5;
export const MOVE_SPEED = 4.2; // walking pace
export const RUN_MULT = 1.7; // Shift: run
export const MOVE_DAMP = 0.82;
export const GRAVITY = 22;
export const EYE_HEIGHT = 1.6;
export const JUMP_SPEED = 6.6; // Space: ~1 m apex at GRAVITY 22
export const JUMP_COYOTE = 0.1; // s after leaving an edge she can still jump
export const JUMP_BUFFER = 0.12; // s a Space press waits for the ground
export const CROUCH_HEIGHT = 0.95; // C held: feet → eye
export const CROUCH_MULT = 0.5;
export const CROUCH_TIME = 0.15; // s to crouch / stand
export const PLAYER_RADIUS = 0.3;
export const FALL_RESPAWN_DEPTH = 20; // this far below her spawn → back to spawn
export const LOOK_SENS = 0.002;
export const ORB_FOLLOW_DIST = 3;
export const ORB_FOLLOW_DAMP = 0.9;
export const ORB_BOB_AMP = 0.15;
export const ORB_BOB_SPEED = 1.4;
// the orb as a guide (objects/orb.js → guide()): it goes ahead of her along
// a room's route and waits; past ORB_FAR it comes back to her (until it is
// within ORB_NEAR), and it comes to her side to talk
export const ORB_LEAD = 3.4; // m ahead of her along the route
export const ORB_FAR = 7.5; // m: she has fallen behind, it comes back
export const ORB_NEAR = 3.2; // m: close enough again, it leads on
export const ORB_ESCORT = 2.6; // m ahead of where she walks, without a route
export const ORB_TALK = 2.3; // m in front of her while it talks
export const ORB_MAX_SPEED = 8.5; // m/s (she runs at about 7)
export const PORTAL_TRIGGER_RADIUS = 3;
export const ROOM_BOUNDS_RADIUS = 100;
export const HINT_DISTANCE = 60;
export const BLOOM_STRENGTH = 0.8;
export const BLOOM_RADIUS = 0.8;
export const BLOOM_THRESHOLD = 1.0;
export const SKY_RADIUS = 450;
export const SECOND_BUBBLE_DISTANCE = 20;
export const STAR_TRIGGER_RADIUS = 1.1;
export const TURN_ASSIST_DELAY = 8000;
export const TURN_ASSIST_DURATION = 2500;
export const QUALITY_LOW_FPS = 30;
export const QUALITY_LOW_SECONDS = 5;
export const QUALITY_RESTORE_FPS = 45;
export const QUALITY_RESTORE_SECONDS = 10;
export const QUALITY_MIN_PIXEL_RATIO = 1.0;
export const QUALITY_PIXEL_STEP = 0.25;

export const DELTA_CAP = 0.05;
