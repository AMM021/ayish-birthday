import * as THREE from 'three';
import {
  PALETTE, CAMERA_FAR, MOVE_SPEED, MOVE_DAMP, LOOK_SENS, ROOM_BOUNDS_RADIUS,
  RUN_MULT, GRAVITY, FALL_RESPAWN_DEPTH, ATMOSPHERES, REDUCED_MOTION, EYE_HEIGHT,
  JUMP_SPEED, JUMP_COYOTE, JUMP_BUFFER, CROUCH_HEIGHT, CROUCH_MULT, CROUCH_TIME
} from '../core/config.js';
import * as input from '../core/input.js';
import * as physics from './physics.js';

// The one Scene and the one Camera. Rooms add groups; they never
// create either.

export const scene = new THREE.Scene();
// An explicit background (not just the renderer clear colour): RenderPass
// disables autoClear and would otherwise clear with a colour cached in the
// screen's sRGB space, washing the void out to grey-purple.
scene.background = new THREE.Color(PALETTE.lilacHaze);
export const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, CAMERA_FAR);
export const rootGroup = new THREE.Group();
rootGroup.name = 'root';
scene.add(rootGroup);

// Persistent sky (gradient dome + starfield + nebula), never part of a
// room group.
export const sky = new THREE.Group();
sky.name = 'sky';
sky.renderOrder = -1;
scene.add(sky);

const hemi = new THREE.HemisphereLight(PALETTE.lilacHaze, PALETTE.wisteria, 1.1);
const ambient = new THREE.AmbientLight(PALETTE.lavender, 0.45);
// soft sun; no shadow maps (Performance Rule 5)
const sun = new THREE.DirectionalLight(PALETTE.gold, 1.1);
sun.position.set(40, 60, -30);
scene.add(hemi, ambient, sun);

const fog = new THREE.FogExp2(PALETTE.lilacMist, 0.012);
scene.fog = fog;
let fogBase = 0.012;
let fogEnabled = true;

// --- atmosphere -----------------------------------------------------------
let skyParts = null; // { dome, stars, nebula } registered once by main.js
export function registerSky(parts) {
  skyParts = parts;
  sky.add(parts.dome.mesh);
}
// Blend two presets (0..1), e.g. COMPILE's bloom from the void to sunshine.
const ca = new THREE.Color();
const cb = new THREE.Color();
function mixColor(a, b, k) {
  return '#' + ca.set(a).lerp(cb.set(b), k).getHexString();
}
export function lerpAtmosphere(from, to, k) {
  const A = ATMOSPHERES[from];
  const B = ATMOSPHERES[to];
  const num = (x) => A[x] + (B[x] - A[x]) * k;
  setAtmosphere(from, {
    top: mixColor(A.top, B.top, k), horizon: mixColor(A.horizon, B.horizon, k), bottom: mixColor(A.bottom, B.bottom, k),
    clouds: mixColor(A.clouds, B.clouds, k), fog: mixColor(A.fog, B.fog, k), fogDensity: num('fogDensity'),
    stars: num('stars'), nebula: num('nebula'),
    hemi: [mixColor(A.hemi[0], B.hemi[0], k), mixColor(A.hemi[1], B.hemi[1], k), A.hemi[2] + (B.hemi[2] - A.hemi[2]) * k],
    ambient: num('ambient'), sun: num('sun')
  });
}

const DEFAULT_SUN = [0.4, 0.35, -0.8];
// One call per room: sky gradient, clouds, stars, fog and light levels.
export function setAtmosphere(name, overrides = {}) {
  const a = { ...ATMOSPHERES[name], ...overrides };
  const sunDir = a.sunDir ?? DEFAULT_SUN;
  skyParts?.dome.set({ top: a.top, horizon: a.horizon, bottom: a.bottom, clouds: a.clouds, cloudAmt: a.stars > 0.5 ? 0.25 : 1, sun: a.sun, sunDir });
  sun.position.set(...sunDir).normalize().multiplyScalar(80);
  skyParts?.stars.setOpacity(a.stars);
  skyParts?.nebula.setOpacity(a.nebula);
  scene.background.set(a.horizon);
  hemi.color.set(a.hemi[0]);
  hemi.groundColor.set(a.hemi[1]);
  hemi.intensity = a.hemi[2];
  ambient.intensity = a.ambient;
  sun.intensity = a.sun;
  setFog(a.fog, a.fogDensity);
}

const groups = new Map();

export function getGroup(name) {
  if (!groups.has(name)) {
    const g = new THREE.Group();
    g.name = name;
    rootGroup.add(g);
    groups.set(name, g);
  }
  return groups.get(name);
}
export const hasGroup = (name) => groups.has(name) && groups.get(name).children.length > 0;
export function showGroup(name) {
  if (groups.has(name)) groups.get(name).visible = true;
}
export function hideGroup(name) {
  if (groups.has(name)) groups.get(name).visible = false;
}

function disposeMaterial(m) {
  if (!m || m.userData?.shared) return;
  for (const k in m) {
    const v = m[k];
    if (v && v.isTexture && !v.userData?.shared) v.dispose();
  }
  if (m.uniforms) {
    for (const u of Object.values(m.uniforms)) {
      if (u.value && u.value.isTexture && !u.value.userData?.shared) u.value.dispose();
    }
  }
  m.dispose();
}

export function disposeGroup(name) {
  const g = groups.get(name);
  if (!g) return;
  g.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(disposeMaterial);
      else disposeMaterial(o.material);
    }
    if (o.isInstancedMesh) o.dispose();
  });
  g.removeFromParent();
  groups.delete(name);
}

// --- fog ----------------------------------------------------------------
export function setFog(color, density) {
  fog.color.set(color);
  fogBase = density;
  fog.density = fogEnabled ? density : 0;
}
export function setFogEnabled(on) {
  fogEnabled = on;
  fog.density = on ? fogBase : 0;
}
export const isFogEnabled = () => fogEnabled;

// --- player (walking) ------------------------------------------------------
// She walks: WASD on the ground plane (from yaw only), Shift to run, Space
// to jump, C (held) to crouch, mouse to look. Gravity pulls her onto whatever the room registered as solid
// (world/physics.js); she can never pass through floors or walls. Falling
// far below her spawn puts her back at the spawn.
export const player = {
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  canMove: false,
  canLook: false,
  speed: MOVE_SPEED,
  prev: new THREE.Vector3(),
  eye: new THREE.Vector3(), // physical eye position (camera adds a tiny bob)
  spawn: new THREE.Vector3(),
  spawnYaw: 0,
  grounded: false,
  height: EYE_HEIGHT, // feet → eye; lower while crouching
  standHeight: EYE_HEIGHT,
  crouching: false,
  airT: 0, // seconds since last grounded (coyote time)
  jumpT: 0, // buffered jump press, seconds left
  bob: 0,
  moved: 0 // seconds spent actually moving (for the controls hint)
};

const bounds = { center: new THREE.Vector3(), radius: ROOM_BOUNDS_RADIUS, active: false };
let oob = { on: false, t: 0, fired: false };
let onOutOfBounds = null;

export function setPlayer(pos, yaw = 0, pitch = 0) {
  camera.position.copy(pos);
  player.eye.copy(pos);
  player.prev.copy(pos);
  player.spawn.copy(pos);
  player.spawnYaw = yaw;
  player.yaw = yaw;
  player.pitch = pitch;
  player.velocity.set(0, 0, 0);
  player.bob = 0;
  player.height = player.standHeight;
  player.crouching = false;
  player.jumpT = 0;
  applyLook();
}

// Standing eye height for the room (REVEAL: her own, 1.45).
export function setStandHeight(h = EYE_HEIGHT) {
  player.standHeight = h;
  player.height = h;
}

// Rooms register what is solid. `null`/[] clears (no gravity then).
export function setColliders(objects) {
  if (objects && objects.length) physics.setColliders(objects);
  else physics.clearColliders();
}

export function setBounds(center, radius = ROOM_BOUNDS_RADIUS) {
  bounds.center.copy(center);
  bounds.radius = radius;
  bounds.active = true;
  oob = { on: false, t: 0, fired: false };
}
export function clearBounds() {
  bounds.active = false;
  physics.clearColliders();
}
export function setOutOfBoundsHandler(fn) {
  onOutOfBounds = fn;
}

export function setControls({ move, look }) {
  if (move !== undefined) {
    player.canMove = move;
    if (!move) player.velocity.set(0, 0, 0);
  }
  if (look !== undefined) {
    player.canLook = look;
    input.setLookAllowed(look);
  }
  input.clearHeld();
}

function applyLook() {
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const wish = new THREE.Vector3();
const toCenter = new THREE.Vector3();
const step = new THREE.Vector3();
const probe = new THREE.Vector3();
const MAX_STEP = 0.2; // sub-step length, so nothing thin is tunnelled through

// Is there room to stand up from a crouch here?
function roomToStand() {
  const rise = player.standHeight - player.height;
  if (rise <= 0) return true;
  probe.copy(player.eye);
  probe.y += rise;
  const push = physics.resolveCapsule(probe, player.standHeight);
  return push.y > -1e-4 && Math.hypot(push.x, push.z) < 0.02;
}

function updatePlayer(dt) {
  player.prev.copy(camera.position);
  const look = input.consumeLook();
  if (player.canLook && input.isLocked()) {
    player.yaw -= look.x * LOOK_SENS;
    player.pitch -= look.y * LOOK_SENS;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
    applyLook();
  }

  if (!player.canMove) {
    // A room may be animating the camera (seating, drift): follow it.
    player.eye.copy(camera.position);
    player.velocity.set(0, 0, 0);
    return;
  }

  wish.set(0, 0, 0);
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  if (input.isDown('KeyW')) wish.add(fwd);
  if (input.isDown('KeyS')) wish.sub(fwd);
  if (input.isDown('KeyD')) wish.add(right);
  if (input.isDown('KeyA')) wish.sub(right);
  const solid = physics.hasColliders();
  // crouch (C held); she stays down while something is overhead
  const wantCrouch = input.isDown('KeyC');
  if (wantCrouch) player.crouching = true;
  else if (player.crouching && (!solid || roomToStand())) player.crouching = false;
  const target = player.crouching ? CROUCH_HEIGHT : player.standHeight;
  if (player.height !== target) {
    const rate = (player.standHeight - CROUCH_HEIGHT) / CROUCH_TIME;
    const dh = Math.sign(target - player.height) * Math.min(Math.abs(target - player.height), rate * dt);
    player.height += dh;
    if (player.grounded || !solid) player.eye.y += dh; // feet stay on the ground
  }
  const running = !player.crouching && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
  const mult = player.crouching ? CROUCH_MULT : running ? RUN_MULT : 1;
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(player.speed * mult);

  // Frame-rate independent damping toward the wished horizontal velocity.
  const k = Math.pow(MOVE_DAMP, dt * 60);
  const v = player.velocity;
  v.x = v.x * k + wish.x * (1 - k);
  v.z = v.z * k + wish.z * (1 - k);

  // jump (Space): buffered briefly, allowed just after leaving an edge
  if (input.consumePressed('Space')) player.jumpT = JUMP_BUFFER;
  else player.jumpT = Math.max(0, player.jumpT - dt);
  player.airT = player.grounded ? 0 : player.airT + dt;
  if (solid && player.jumpT > 0 && player.airT <= JUMP_COYOTE) {
    v.y = JUMP_SPEED;
    player.jumpT = 0;
    player.airT = JUMP_COYOTE + 1; // no second jump until she lands
  }
  if (solid) v.y -= GRAVITY * dt;
  else v.y = 0;

  // Move in short sub-steps, resolving the capsule after each.
  const total = Math.hypot(v.x, v.y, v.z) * dt;
  const n = Math.max(1, Math.ceil(total / MAX_STEP));
  player.grounded = false;
  for (let i = 0; i < n; i++) {
    step.copy(v).multiplyScalar(dt / n);
    player.eye.add(step);
    if (!solid) continue;
    const push = physics.resolveCapsule(player.eye, player.height);
    if (push.y > 1e-5 && push.y > Math.hypot(push.x, push.z) * 0.7) {
      player.grounded = true;
      if (v.y < 0) v.y = 0;
    } else if (push.y < -1e-5 && v.y > 0) {
      v.y = 0; // ceiling
    }
  }
  // Standing still on a slope must not slide: drop tiny horizontal drift.
  if (player.grounded && wish.lengthSq() === 0 && Math.hypot(v.x, v.z) < 0.05) {
    v.x = 0;
    v.z = 0;
  }

  if (solid && player.eye.y < player.spawn.y - FALL_RESPAWN_DEPTH) {
    // fell off the world: back to the start of the room, gently
    player.eye.copy(player.spawn);
    player.yaw = player.spawnYaw;
    v.set(0, 0, 0);
    applyLook();
    onOutOfBounds?.();
  }

  const speedH = Math.hypot(v.x, v.z);
  if (wish.lengthSq() > 0) player.moved += dt;
  // a very small walking bob (none with reduced motion)
  if (!REDUCED_MOTION && player.grounded && speedH > 0.5) player.bob += dt * speedH * 2.1;
  const bobY = REDUCED_MOTION ? 0 : Math.sin(player.bob) * 0.035 * Math.min(1, speedH / MOVE_SPEED);
  camera.position.set(player.eye.x, player.eye.y + bobY, player.eye.z);

  // Soft bounds (horizontal): fog thickens, she is eased back.
  if (bounds.active) {
    toCenter.subVectors(bounds.center, player.eye).setY(0);
    const d = toCenter.length();
    if (d > bounds.radius && !oob.on) oob = { on: true, t: 0, fired: false };
    if (oob.on) {
      oob.t += dt;
      if (!oob.fired) {
        oob.fired = true;
        onOutOfBounds?.();
      }
      player.eye.addScaledVector(toCenter, Math.min(1, dt / 3));
      v.x *= 0.9;
      v.z *= 0.9;
      if (fogEnabled) fog.density = fogBase + Math.min(1, oob.t / 2) * 0.03;
      if (d < bounds.radius * 0.85) {
        oob.on = false;
        if (fogEnabled) fog.density = fogBase;
      }
    }
  }
}

export function update(dt) {
  updatePlayer(dt);
  sky.position.copy(camera.position);
  for (const fn of updaters) fn(dt);
}

// Persistent per-frame hooks (sky animation, orb) registered once.
const updaters = [];
export function onUpdate(fn) {
  updaters.push(fn);
}

export function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
