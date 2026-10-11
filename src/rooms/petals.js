import * as THREE from 'three';
import { PALETTE } from '../core/config.js';
import * as world from '../world/world.js';
import * as physics from '../world/physics.js';
import * as save from '../core/save.js';
import * as audio from '../core/audio.js';
import * as hints from '../core/hints.js';
import * as transitions from '../world/transitions.js';
import * as machine from '../state/machine.js';
import * as dialogue from '../ui/dialogue.js';
import * as fragments from '../ui/fragments.js';
import * as portalObj from '../objects/portal.js';
import * as sakura from '../objects/sakura.js';
import * as treeObj from '../objects/tree.js';
import { orb } from '../objects/orb.js';
import { TEXT } from '../ui/text.js';

// PETALS — stay in the light (the last, hardest level). The orb drifts
// down a long blossom avenue and casts a circle of light on the path. She
// has to keep walking inside it while gusts of petals push the light (and
// her) around, and the avenue is in the way: fallen branches to jump,
// low wisteria trellises to duck under, streams to leap and rocks to walk
// round. The light eases a little just past each obstacle. Outside the
// light for too long → it gently starts over.

const HALF_LEN = 46;
const HALF_W = 10;
const START_Z = 40;
const END_Z = -40;
const LIGHT_R0 = 3.0; // circle radius at the start …
const LIGHT_R1 = 2.4; // … and at the end
const SPEED0 = 2.6; // light speed at the start (walking is 4.2) …
const SPEED1 = 3.6; // … and at the end
const OUT_LIMIT = 4.0; // seconds outside the light before a restart
const ORB_Y = 2.6;
const GUST_PUSH = 1.5; // m/s sideways on her while a gust blows
const EASE_ZONE = [1, 4]; // light slows from 1 m before to 4 m past an obstacle
const EASE_MULT = 0.78;
// obstacles along the light's path (fraction k of the path)
const COURSE = [
  [0.1, 'log'], [0.18, 'trellis'], [0.27, 'stream', 1.8], [0.36, 'rocks'],
  [0.45, 'log'], [0.49, 'trellis'], [0.57, 'stream', 2.3], [0.65, 'trellis'],
  [0.73, 'stones'], [0.81, 'log'], [0.88, 'trellis'], [0.95, 'log']
];
const STREAM_DEPTH = 0.8; // she can jump back out if she falls in

let group = null;
let portal = null;
let petals = null;
let pool = null; // the light circle on the ground
let poolMat = null;
let path = null; // the curve the light follows
let pathLen = 0;
let solid = [];
let obstacles = []; // { kind, z, w } (z along the avenue)
const challenge = { done: false, progress: 0, total: 1 };
let mode = 'wait'; // wait | ready | lead | restart | done
let s = 0; // distance along the path
let outT = 0;
let lostSaid = false;
let gust = null; // { t, dur, dir, off, amp }
let nextGust = 0;
let leaving = false;
let t = 0;
const tmp = new THREE.Vector3();
const light = new THREE.Vector3();

function makePath() {
  // gentle at first, then wider swings
  const pts = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const z = START_Z - 2 - k * (START_Z - END_Z - 2);
    const amp = 2 + k * 5;
    const x = i < 2 ? 0 : Math.sin(i * 1.15) * amp;
    pts.push(new THREE.Vector3(x, 0, z));
  }
  path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  pathLen = path.getLength();
}

function build() {
  solid = [];
  obstacles = COURSE.map(([k, kind, w]) => ({ kind, z: path.getPointAt(k).z, x: path.getPointAt(k).x, w: w || (kind === 'stones' ? 4.4 : 0) }));
  // the ground, cut by the streams (each a shallow channel across the avenue)
  const groundMat = new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist });
  const cuts = obstacles.filter((o) => o.w).map((o) => [o.z + o.w / 2, o.z - o.w / 2]).sort((a, b) => b[0] - a[0]);
  let top = HALF_LEN + 1;
  const laneMat = new THREE.MeshLambertMaterial({ color: PALETTE.moonlight, transparent: true, opacity: 0.55 });
  const piece = (z0, z1, y0, h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + 2, h, z0 - z1), groundMat);
    m.position.set(0, y0 - h / 2, (z0 + z1) / 2);
    group.add(m);
    solid.push(m);
    if (y0 === 0) {
      // the stone path down the middle
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(6, z0 - z1), laneMat);
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(0, 0.01, (z0 + z1) / 2);
      group.add(lane);
    }
  };
  for (const [z0, z1] of cuts) {
    piece(top, z0, 0, 1);
    piece(z0, z1, -STREAM_DEPTH, 1); // the channel bed
    top = z1;
  }
  piece(top, -HALF_LEN - 1, 0, 1);
  buildObstacles(groundMat);

  // blossom trees on both sides of the avenue
  for (let i = 0; i < 14; i++) {
    for (const side of [-1, 1]) {
      const z = HALF_LEN - 3 - i * 6.6;
      const tr = treeObj.create({
        height: 3.4 + ((i + (side > 0 ? 1 : 0)) % 3) * 0.5,
        tint: (i + side) % 5 === 0 ? 'lavender' : 'softPink',
        seed: 0.31 + i * 0.05 + side * 0.01
      });
      tr.position.set(side * (HALF_W - 0.5), 0, z);
      group.add(tr);
      solid.push(tr.userData.collider);
    }
  }
  // invisible walls: both sides and both ends
  for (const side of [-1, 1]) {
    const w = physics.solidBox(1, 6, HALF_LEN * 2 + 2);
    w.position.set(side * (HALF_W + 0.5), 3, 0);
    group.add(w);
    solid.push(w);
  }
  for (const z of [HALF_LEN + 0.5, -HALF_LEN - 0.5]) {
    const w = physics.solidBox(HALF_W * 2 + 2, 6, 1);
    w.position.set(0, 3, z);
    group.add(w);
    solid.push(w);
  }

  // petals streaming toward her
  petals = sakura.create(700, { x: [-HALF_W, HALF_W], y: [0, 10], z: [-HALF_LEN, HALF_LEN] }, {
    wind: new THREE.Vector3(0, 0, 3.5), fall: 0.35, size: 1.4
  });
  group.add(petals.mesh);

  // the light circle: a soft disc, its rim bright enough to bloom; it
  // warms toward pink while she is outside it
  poolMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.gold) },
      uWarn: { value: new THREE.Color(PALETTE.softPink) },
      uK: { value: 0 },
      uTime: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uWarn;
      uniform float uK;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float edge = smoothstep(1.0, 0.86, r);
        float ring = smoothstep(0.8, 0.93, r) * edge;
        vec3 c = mix(uColor, uWarn, uK);
        float a = edge * 0.32 + ring * (0.9 + 0.1 * sin(uTime * (3.0 + uK * 9.0)));
        gl_FragColor = vec4(c * (1.2 + ring * 0.8), a);
      }
    `,
    transparent: true,
    depthWrite: false
  });
  pool = new THREE.Mesh(new THREE.CircleGeometry(1, 48), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.03;
  pool.visible = false;
  group.add(pool);

  portal = portalObj.create();
  portal.group.position.set(0, 1.9, END_Z - 3);
  portal.group.visible = false;
  group.add(portal.group);
}

// fallen branches, trellises, streams, rocks (all across or on the path)
function buildObstacles(groundMat) {
  const W = HALF_W * 2;
  const wood = new THREE.MeshLambertMaterial({ color: PALETTE.walnut });
  const bloom = new THREE.MeshLambertMaterial({ color: PALETTE.wisteria, emissive: PALETTE.lavender, emissiveIntensity: 0.25 });
  const blossom = new THREE.MeshLambertMaterial({ color: PALETTE.softPink, flatShading: true });
  const water = new THREE.MeshPhongMaterial({ color: PALETTE.dusk, specular: PALETTE.lavender, shininess: 80, transparent: true, opacity: 0.85 });
  const stone = new THREE.MeshLambertMaterial({ color: PALETTE.wisteria, flatShading: true });
  const strandGeo = new THREE.ConeGeometry(0.11, 0.55, 6);
  strandGeo.rotateX(Math.PI);
  const puffGeo = new THREE.IcosahedronGeometry(0.28, 0);
  for (const o of obstacles) {
    if (o.kind === 'log') {
      // a fallen blossom branch: a 0.62 m box to jump, drawn as a round log
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, W, 12), wood);
      log.rotation.z = Math.PI / 2;
      log.position.set(0, 0.31, o.z);
      group.add(log);
      const col = physics.solidBox(W, 0.62, 0.62);
      col.position.set(0, 0.31, o.z);
      group.add(col);
      solid.push(col);
      const puffs = new THREE.InstancedMesh(puffGeo, blossom, 40);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 40; i++) {
        m4.makeTranslation(-HALF_W + (i + 0.5) * (W / 40), 0.55 + (i % 3) * 0.08, o.z + ((i * 7) % 5 - 2) * 0.07);
        puffs.setMatrixAt(i, m4);
      }
      group.add(puffs);
    } else if (o.kind === 'trellis') {
      // a low wisteria trellis: beam 1.3–1.8 m (crouch), strands hanging
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, 0.4), wood);
      beam.position.set(0, 1.55, o.z);
      group.add(beam);
      solid.push(beam);
      for (const x of [-HALF_W + 0.3, HALF_W - 0.3]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 0.25), wood);
        post.position.set(x, 0.9, o.z);
        group.add(post);
        solid.push(post);
      }
      const strands = new THREE.InstancedMesh(strandGeo, bloom, 70);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 70; i++) {
        const x = -HALF_W + (i + 0.5) * (W / 70);
        m4.makeTranslation(x, 1.3 - 0.06 * ((i * 5) % 3), o.z + ((i % 2) - 0.5) * 0.24);
        strands.setMatrixAt(i, m4);
      }
      group.add(strands);
    } else if (o.kind === 'stream' || o.kind === 'stones') {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, o.w), water);
      w.rotation.x = -Math.PI / 2;
      w.position.set(0, -0.35, o.z);
      group.add(w);
      if (o.kind === 'stones') {
        // stepping stones in a wide stream (two 1.5 m hops): one on the
        // light's line, others either side
        o.stones = [];
        for (const x of [-5.2, -2.6, 0, 2.6, 5.2]) {
          o.stones.push(THREE.MathUtils.clamp(o.x + x, -HALF_W + 1, HALF_W - 1));
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, STREAM_DEPTH + 0.05, 10), stone);
          st.position.set(THREE.MathUtils.clamp(o.x + x, -HALF_W + 1, HALF_W - 1), -STREAM_DEPTH / 2 + 0.02, o.z);
          group.add(st);
          solid.push(st);
        }
      }
    } else if (o.kind === 'rocks') {
      // standing stones on the light's line: a slalom (channels ≥ 1.5 m)
      o.rocks = [];
      for (const [dx, dz, r, h] of [[0, 1.5, 0.8, 2.2], [-2.9, -1.2, 0.7, 1.7], [2.9, -1.2, 0.7, 1.9], [0, -3.9, 0.8, 2.0]]) {
        o.rocks.push([o.x + dx, o.z + dz, r]);
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
        rock.scale.set(1, h / (2 * r), 1);
        rock.position.set(o.x + dx, h / 2, o.z + dz);
        group.add(rock);
        solid.push(rock);
      }
    }
  }
}

function nearObstacle(z, m) {
  return obstacles.some((o) => Math.abs(o.z - z) < m + (o.w || 0) / 2);
}

// near an obstacle the light waits a little for her
function easeAt(z) {
  for (const o of obstacles) {
    const d = o.z - z; // > 0 once the light is past it (moving toward −z)
    if (d > -EASE_ZONE[0] - (o.w || 0) / 2 && d < EASE_ZONE[1] + (o.w || 0) / 2) return EASE_MULT;
  }
  return 1;
}

const radiusAt = (k) => LIGHT_R0 + (LIGHT_R1 - LIGHT_R0) * k;
const speedAt = (k) => SPEED0 + (SPEED1 - SPEED0) * k;

function placeLight(sv) {
  const k = Math.min(1, sv / pathLen);
  path.getPointAt(k, light);
  if (gust) light.x += gust.off;
  light.x = THREE.MathUtils.clamp(light.x, -HALF_W + 2, HALF_W - 2);
  const r = radiusAt(k);
  pool.scale.set(r, r, 1);
  pool.position.set(light.x, 0.03, light.z);
  return k;
}

function startOver() {
  s = 0;
  outT = 0;
  gust = null;
  nextGust = 7;
  lostSaid = false;
  poolMat.uniforms.uK.value = 0;
  placeLight(0);
  orb.place(tmp.set(light.x, ORB_Y, light.z));
  orb.hold(tmp);
  mode = 'ready';
}

async function restart() {
  mode = 'restart';
  audio.softPulse();
  orb.pulse();
  dialogue.say(orb.anchor, TEXT.petals.restart, { mode: 'ambient' });
  await transitions.fade(500, 300, 600);
  if (leaving) return;
  world.setPlayer(new THREE.Vector3(0, 1.6, START_Z + 3), 0, 0);
  startOver();
}

function complete() {
  challenge.done = true;
  challenge.progress = 1;
  mode = 'done';
  pool.visible = false;
  orb.hold(tmp.set(0, 3, END_Z - 1));
  portal.group.visible = true;
  portal.enable();
  audio.chimeUp();
  dialogue.say(orb.anchor, TEXT.petals.complete, { mode: 'story' });
  fragments.grant('petals');
}

async function leave() {
  leaving = true;
  world.setControls({ move: false });
  await transitions.portalFlash(PALETTE.lavender, 500);
  machine.go(save.nextState('petals'));
}

export default {
  name: 'petals',
  nudgeLine: TEXT.petals.hint,

  async enter() {
    group = world.getGroup('petals');
    challenge.done = false;
    challenge.progress = 0;
    leaving = false;
    t = 0;
    makePath();
    build();
    world.sky.visible = true;
    world.setAtmosphere('day', { fogDensity: 0.018 });
    world.setBounds(new THREE.Vector3(0, 0, 0), HALF_LEN + 6);
    world.setColliders(solid);
    world.setPlayer(new THREE.Vector3(0, 1.6, START_Z + 3), 0, 0);
    world.setControls({ move: true, look: true });
    orb.setVisible(true);
    orb.setColor(PALETTE.softPink);
    startOver();
    mode = 'wait';
    fragments.show();
    audio.play('challenge');
    dialogue.say(orb.anchor, TEXT.petals.intro, { mode: 'story' }).then(() => {
      if (mode === 'wait') mode = 'ready';
    });
  },

  update(dt) {
    t += dt;
    petals.update(dt);
    portal.update(dt);
    poolMat.uniforms.uTime.value = t;
    if (leaving) return;
    const p = world.camera.position;

    if (mode === 'ready' || mode === 'lead') {
      pool.visible = true;
      const k = placeLight(s);
      const inside = Math.hypot(p.x - light.x, p.z - light.z) < radiusAt(k);
      if (mode === 'ready') {
        // the light waits until she steps into it
        if (inside) {
          mode = 'lead';
          hints.reset();
        }
      } else {
        s += speedAt(k) * easeAt(light.z) * dt;
        challenge.progress = Math.min(0.99, s / pathLen);
        // gusts: the light is blown sideways for a moment
        nextGust -= dt;
        // (never while she is getting over something)
        if (!gust && nextGust <= 0 && k > 0.12 && !nearObstacle(light.z, 6)) {
          gust = { t: 0, dur: 1.8, dir: light.x > 0 ? -1 : 1, off: 0, amp: 2.5 + k * 2.5 };
          audio.softPulse();
        }
        if (gust) {
          gust.t += dt;
          gust.off = gust.dir * gust.amp * Math.sin(Math.min(1, gust.t / gust.dur) * Math.PI);
          // the wind leans on her too (against where the light goes)
          world.player.velocity.x -= gust.dir * GUST_PUSH * Math.sin(Math.min(1, gust.t / gust.dur) * Math.PI) * dt * 6;
          if (gust.t >= gust.dur) {
            gust = null;
            nextGust = 5 + Math.random() * 3 - k * 2;
          }
        }
        if (inside) {
          outT = Math.max(0, outT - dt * 2);
          if (outT === 0) lostSaid = false;
        } else {
          outT += dt;
          if (!lostSaid) {
            lostSaid = true;
            dialogue.say(orb.anchor, TEXT.petals.lost, { mode: 'ambient' });
          }
          if (outT >= OUT_LIMIT) {
            restart();
            return;
          }
        }
        poolMat.uniforms.uK.value = Math.min(1, outT / OUT_LIMIT);
        if (s >= pathLen) {
          complete();
          return;
        }
      }
      orb.hold(tmp.set(light.x, ORB_Y, light.z));
    }

    if (challenge.done && portal.checkEntry(p) && !dialogue.isStoryActive()) leave();
  },

  hintsEligible() {
    return mode === 'ready' && !challenge.done;
  },

  hintTargets() {
    return challenge.done ? [] : [light.clone().setY(0.5)];
  },

  _debug() {
    return { mode, s, pathLen, outT, light: light.toArray(), done: challenge.done, portal: portal.enabled, gust: !!gust, obstacles };
  },

  devComplete() {
    if (!challenge.done) complete();
  },

  exit() {
    world.clearBounds();
    world.disposeGroup('petals');
    group = null;
  }
};
