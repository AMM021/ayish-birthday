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
  lacquer: '#120a1c'
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

export const CAMERA_FAR = 500;
export const PIXEL_RATIO_CAP = 1.5;
export const BLOOM_RESOLUTION = 0.5;
export const MOVE_SPEED = 12;
export const MOVE_DAMP = 0.88;
export const LOOK_SENS = 0.002;
export const ORB_FOLLOW_DIST = 3;
export const ORB_FOLLOW_DAMP = 0.9;
export const ORB_BOB_AMP = 0.15;
export const ORB_BOB_SPEED = 1.4;
export const PORTAL_TRIGGER_RADIUS = 3;
export const ROOM_BOUNDS_RADIUS = 100;
export const HINT_DISTANCE = 60;
export const BLOOM_STRENGTH = 0.8;
export const BLOOM_RADIUS = 0.8;
export const BLOOM_THRESHOLD = 1.0;
export const SKY_RADIUS = 450;
export const SECOND_BUBBLE_DISTANCE = 20;
export const STAR_TRIGGER_RADIUS = 1.1;
export const REVEAL_START_TIMEOUT = 8000;
export const TURN_ASSIST_DELAY = 8000;
export const TURN_ASSIST_DURATION = 2500;
export const QUALITY_LOW_FPS = 30;
export const QUALITY_LOW_SECONDS = 5;
export const QUALITY_RESTORE_FPS = 45;
export const QUALITY_RESTORE_SECONDS = 10;
export const QUALITY_MIN_PIXEL_RATIO = 1.0;
export const QUALITY_PIXEL_STEP = 0.25;

export const DELTA_CAP = 0.05;
