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
// has to keep walking inside it while gusts of petals push the light
// around. Outside the light for too long → it gently starts over.

const HALF_LEN = 46;
const HALF_W = 10;
const START_Z = 40;
const END_Z = -40;
const LIGHT_R0 = 3.0; // circle radius at the start …
const LIGHT_R1 = 2.1; // … and at the end
const SPEED0 = 2.6; // light speed at the start (walking is 4.2) …
const SPEED1 = 3.6; // … and at the end
const OUT_LIMIT = 3.0; // seconds outside the light before a restart
const ORB_Y = 2.6;

let group = null;
let portal = null;
let petals = null;
let pool = null; // the light circle on the ground
let poolMat = null;
let path = null; // the curve the light follows
let pathLen = 0;
let solid = [];
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
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_W * 2 + 2, 1, HALF_LEN * 2 + 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.lilacMist })
  );
  floor.position.y = -0.5;
  group.add(floor);
  solid.push(floor);
  // the stone path down the middle
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(6, HALF_LEN * 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.moonlight, transparent: true, opacity: 0.55 })
  );
  lane.rotation.x = -Math.PI / 2;
  lane.position.y = 0.01;
  group.add(lane);

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
        s += speedAt(k) * dt;
        challenge.progress = Math.min(0.99, s / pathLen);
        // gusts: the light is blown sideways for a moment
        nextGust -= dt;
        if (!gust && nextGust <= 0 && k > 0.12) {
          gust = { t: 0, dur: 1.8, dir: light.x > 0 ? -1 : 1, off: 0, amp: 2.5 + k * 2.5 };
          audio.softPulse();
        }
        if (gust) {
          gust.t += dt;
          gust.off = gust.dir * gust.amp * Math.sin(Math.min(1, gust.t / gust.dur) * Math.PI);
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
    return { mode, s, pathLen, outT, light: light.toArray(), done: challenge.done, portal: portal.enabled, gust: !!gust };
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
