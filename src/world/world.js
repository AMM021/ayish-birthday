import * as THREE from 'three';
import {
  PALETTE, CAMERA_FAR, MOVE_SPEED, MOVE_DAMP, LOOK_SENS, ROOM_BOUNDS_RADIUS
} from '../core/config.js';
import * as input from '../core/input.js';

// The one Scene and the one Camera. Rooms add groups; they never
// create either.

export const scene = new THREE.Scene();
// An explicit background (not just the renderer clear colour): RenderPass
// disables autoClear and would otherwise clear with a colour cached in the
// screen's sRGB space, washing the void out to grey-purple.
scene.background = new THREE.Color(PALETTE.deepIndigo);
export const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, CAMERA_FAR);
export const rootGroup = new THREE.Group();
rootGroup.name = 'root';
scene.add(rootGroup);

// Persistent sky (starfield + nebula), never part of a room group.
export const sky = new THREE.Group();
sky.name = 'sky';
sky.renderOrder = -1;
scene.add(sky);

scene.add(new THREE.HemisphereLight(PALETTE.lavender, PALETTE.deepIndigo, 0.45));
scene.add(new THREE.AmbientLight(PALETTE.lavender, 0.35));

const fog = new THREE.FogExp2(PALETTE.deepIndigo, 0.012);
scene.fog = fog;
let fogBase = 0.012;
let fogEnabled = true;

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

// --- player (free-fly 6DOF) ---------------------------------------------
export const player = {
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  canMove: false,
  canLook: false,
  speed: MOVE_SPEED,
  prev: new THREE.Vector3(),
  moved: 0 // seconds spent actually moving (for the controls hint)
};

const bounds = { center: new THREE.Vector3(), radius: ROOM_BOUNDS_RADIUS, active: false };
let oob = { on: false, t: 0, fired: false };
let onOutOfBounds = null;

export function setPlayer(pos, yaw = 0, pitch = 0) {
  camera.position.copy(pos);
  player.prev.copy(pos);
  player.yaw = yaw;
  player.pitch = pitch;
  player.velocity.set(0, 0, 0);
  applyLook();
}

export function setBounds(center, radius = ROOM_BOUNDS_RADIUS) {
  bounds.center.copy(center);
  bounds.radius = radius;
  bounds.active = true;
  oob = { on: false, t: 0, fired: false };
}
export function clearBounds() {
  bounds.active = false;
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

function updatePlayer(dt) {
  player.prev.copy(camera.position);
  const look = input.consumeLook();
  if (player.canLook && input.isLocked()) {
    player.yaw -= look.x * LOOK_SENS;
    player.pitch -= look.y * LOOK_SENS;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
    applyLook();
  }

  wish.set(0, 0, 0);
  if (player.canMove) {
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    if (input.isDown('KeyW')) wish.add(fwd);
    if (input.isDown('KeyS')) wish.sub(fwd);
    if (input.isDown('KeyD')) wish.add(right);
    if (input.isDown('KeyA')) wish.sub(right);
    if (input.isDown('Space')) wish.y += 1;
    if (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) wish.y -= 1;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(player.speed);
  }
  // Frame-rate independent damping toward the wished velocity.
  const k = Math.pow(MOVE_DAMP, dt * 60);
  player.velocity.multiplyScalar(k).addScaledVector(wish, 1 - k);
  if (!player.canMove && player.velocity.lengthSq() < 1e-4) player.velocity.set(0, 0, 0);
  camera.position.addScaledVector(player.velocity, dt);
  if (wish.lengthSq() > 0) player.moved += dt;

  // Soft bounds: fog thickens, she is eased back toward the centre.
  if (bounds.active) {
    const d = camera.position.distanceTo(bounds.center);
    if (d > bounds.radius) {
      if (!oob.on) {
        oob = { on: true, t: 0, fired: false };
      }
    }
    if (oob.on) {
      oob.t += dt;
      if (!oob.fired) {
        oob.fired = true;
        onOutOfBounds?.();
      }
      toCenter.subVectors(bounds.center, camera.position);
      const pull = Math.min(1, dt / 3) * 2;
      camera.position.addScaledVector(toCenter, pull * 0.5);
      player.velocity.multiplyScalar(0.9);
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
