import * as THREE from 'three';
import {
  PALETTE, ORB_FOLLOW_DIST, ORB_BOB_AMP, ORB_BOB_SPEED, REDUCED_MOTION,
  ORB_LEAD, ORB_FAR, ORB_NEAR, ORB_ESCORT, ORB_TALK, ORB_MAX_SPEED
} from '../core/config.js';
import { enableBloom } from '../world/layers.js';
import { camera } from '../world/world.js';
import * as dialogue from '../ui/dialogue.js';

// The companion: gold core, lavender halo, soft trail. One instance for the
// whole session (lives in the persistent `companion` group).

const TRAIL = 30;
export let orb = null;

const tmp = new THREE.Vector3();
const off = new THREE.Vector3();
const toCam = new THREE.Vector3();
const tangent = new THREE.Vector3();
const side = new THREE.Vector3();
const her = new THREE.Vector3();
const flat = new THREE.Vector3();
const goal = new THREE.Vector3();
const acc = new THREE.Vector3();

export function create() {
  const root = new THREE.Group();
  root.name = 'companion';

  const body = new THREE.Group();
  body.name = 'orb';
  const coreMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold, fog: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), coreMat);
  enableBloom(core, 3.2);
  // Soft halo: bright toward the centre, fading to nothing at the rim.
  const haloMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.lavender) },
      uIntensity: { value: 1 },
      uOpacity: { value: 0.55 }
    },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 3.0) * uOpacity;
        gl_FragColor = vec4(uColor * uIntensity * f, f);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), haloMat);
  enableBloom(halo, 1.4);
  const light = new THREE.PointLight(PALETTE.gold, 0.8, 12, 1);
  body.add(core, halo, light);
  root.add(body);

  // Trail: camera-facing ribbon through the last TRAIL positions.
  const trailPos = new Float32Array(TRAIL * 2 * 3);
  const trailCol = new Float32Array(TRAIL * 2 * 3);
  const idx = [];
  for (let i = 0; i < TRAIL - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  trailGeo.setIndex(idx);
  const trailMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  root.add(trail);
  const history = Array.from({ length: TRAIL }, () => new THREE.Vector3());
  const trailColor = new THREE.Color(PALETTE.lavender);

  // guide mode: a route (ground points to the goal, cumulative lengths), the
  // way she is walking (smoothed), and whether it has gone back for her
  const g = {
    route: null, lens: null, total: 0, height: 1.5, lead: ORB_LEAD, stop: 2.2,
    heading: new THREE.Vector3(0, 0, -1), lastHer: new THREE.Vector3(), haveLast: false,
    returning: false, talkSpot: null, rest: null, vel: new THREE.Vector3(), waitT: 0,
    prevGoal: new THREE.Vector3(), goalVel: new THREE.Vector3(), haveGoal: false
  };

  function projectOnRoute(p) {
    // arc length of the point on the route nearest p (on the ground plane)
    let best = 0, bd = Infinity;
    for (let i = 0; i < g.route.length - 1; i++) {
      const a = g.route[i], b = g.route[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1e-6;
      const k = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
      const x = a.x + abx * k, z = a.z + abz * k;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = g.lens[i] + Math.sqrt(len2) * k; }
    }
    return best;
  }

  function pointOnRoute(s, out) {
    s = Math.max(0, Math.min(g.total, s));
    for (let i = 0; i < g.route.length - 1; i++) {
      const l = g.lens[i + 1] - g.lens[i];
      if (s <= g.lens[i + 1] || i === g.route.length - 2) {
        return out.copy(g.route[i]).lerp(g.route[i + 1], l > 1e-6 ? (s - g.lens[i]) / l : 1);
      }
    }
    return out.copy(g.route[g.route.length - 1]);
  }

  // where the guide wants to be this frame
  function guideTarget(dt, out) {
    her.copy(camera.position);
    // the way she is walking (not the way she is looking)
    if (g.haveLast && dt > 0) {
      flat.subVectors(her, g.lastHer).setY(0);
      const v = flat.length() / dt;
      if (v > 0.6) g.heading.lerp(flat.normalize(), 1 - Math.pow(0.04, dt)).normalize();
    }
    g.lastHer.copy(her);
    g.haveLast = true;
    flat.subVectors(state.base, her).setY(0);
    const dist = flat.length();
    // it talks: to a spot in front of her, re-picked only when it has left
    // her view (so it does not swing about each time she looks around)
    if (dialogue.isStoryActive()) {
      camera.getWorldDirection(tmp).setY(0).normalize();
      const spotOk = g.talkSpot && (() => {
        flat.subVectors(g.talkSpot, her).setY(0);
        const d = flat.length();
        return d > 1.2 && d < ORB_TALK + 1.5 && flat.normalize().dot(tmp) > 0.8;
      })();
      if (!spotOk) {
        off.set(-tmp.z, 0, tmp.x); // her right
        g.talkSpot = (g.talkSpot || new THREE.Vector3()).copy(her).addScaledVector(tmp, ORB_TALK).addScaledVector(off, 0.65);
        g.talkSpot.y = her.y - 0.1;
      }
      g.rest = null;
      return out.copy(g.talkSpot);
    }
    g.talkSpot = null;
    // she has fallen behind: it comes back for her
    if (dist > ORB_FAR) g.returning = true;
    else if (dist < ORB_NEAR) g.returning = false;
    if (g.returning) {
      flat.normalize();
      g.rest = null;
      return out.copy(her).addScaledVector(flat, 2.4).setY(her.y - 0.1);
    }
    if (g.route) {
      const sHer = projectOnRoute(her);
      const s = Math.min(g.total - g.stop, sHer + g.lead * (state.hint ? 0.7 : 1));
      pointOnRoute(Math.max(0, s), out);
      out.y = Math.max(out.y + g.height, her.y - 0.2);
      // never further from her than she can follow (off the route, it waits
      // toward the way on, where she can see it)
      flat.subVectors(out, her).setY(0);
      const reach = ORB_FAR - 2.5;
      if (flat.length() > reach) out.set(her.x, out.y, her.z).addScaledVector(flat.setLength(reach), 1);
      flat.subVectors(state.base, her).setY(0);
      // it waits: now and then it bobs back toward her, as if to say "this way"
      const waiting = s >= g.total - g.stop - 0.05 || dist > g.lead + 0.6;
      g.waitT = waiting ? g.waitT + dt : 0;
      if (waiting && g.waitT > 3) {
        const k = Math.max(0, Math.sin((g.waitT - 3) * 1.6));
        flat.normalize();
        out.addScaledVector(flat, -0.6 * k);
        if (Math.abs((g.waitT - 3) % 4) < dt) api.pulse();
      }
      return out;
    }
    // no route: keep her company a little ahead of where she walks; stay put
    // while she stands still, unless she has drifted off from it
    off.set(-g.heading.z, 0, g.heading.x);
    const want = goal.copy(her).addScaledVector(g.heading, state.hint ? 1.8 : ORB_ESCORT).addScaledVector(off, 0.8);
    want.y = her.y - 0.1;
    if (!g.rest || g.rest.distanceTo(want) > 1.6 || dist > ORB_ESCORT + 2.2) g.rest = (g.rest || new THREE.Vector3()).copy(want);
    return out.copy(g.rest);
  }

  const state = {
    mode: 'follow', // guide | hold | goto ('follow' is the guide with no route)
    target: new THREE.Vector3(),
    speed: 4,
    t: 0,
    hint: 0,
    pulse: 0,
    haloBase: new THREE.Color(PALETTE.lavender),
    base: new THREE.Vector3()
  };

  function resetTrail() {
    body.getWorldPosition(tmp);
    history.forEach((h) => h.copy(tmp));
  }

  function followTarget(out) {
    const dist = ORB_FOLLOW_DIST * (state.hint ? 0.6 : 1);
    off.set(0.9, -0.2, -dist).applyQuaternion(camera.quaternion);
    return out.copy(camera.position).add(off);
  }

  const api = {
    root,
    anchor: body,
    get position() {
      return state.base;
    },
    getWorldPosition: (v) => body.getWorldPosition(v),
    get parent() {
      return root;
    },
    say(line, opts) {
      return dialogue.say(body, line, opts);
    },
    // Snap next to the camera (on room entry).
    place(pos) {
      if (pos) state.base.copy(pos);
      else followTarget(state.base);
      body.position.copy(state.base);
      g.vel.set(0, 0, 0);
      g.goalVel.set(0, 0, 0);
      g.haveGoal = false;
      g.rest = null;
      resetTrail();
    },
    // A free guide: with a route (ground points to a goal) it goes ahead of
    // her along it and waits for her there; without one it keeps her
    // company. Either way it comes back if she falls behind, and comes to
    // her to talk. opts: { lead, stop (m short of the goal), height }
    guide(route = null, opts = {}) {
      state.mode = 'guide';
      g.route = route && route.length > 1 ? route.map((p) => p.clone()) : null;
      g.lens = null;
      g.total = 0;
      if (g.route) {
        g.lens = [0];
        for (let i = 1; i < g.route.length; i++) g.lens.push(g.lens[i - 1] + Math.hypot(g.route[i].x - g.route[i - 1].x, g.route[i].z - g.route[i - 1].z));
        g.total = g.lens[g.lens.length - 1];
      }
      g.lead = opts.lead ?? ORB_LEAD;
      g.stop = opts.stop ?? 2.2;
      g.height = opts.height ?? 1.5;
      g.returning = false;
      g.rest = null;
      g.haveLast = false;
      g.waitT = 0;
      g.vel.set(0, 0, 0);
      g.goalVel.set(0, 0, 0);
      g.haveGoal = false;
      camera.getWorldDirection(g.heading).setY(0);
      if (g.heading.lengthSq() < 1e-6) g.heading.set(0, 0, -1);
      g.heading.normalize();
    },
    // Lead her from where she is now straight to a goal (ground point).
    leadTo(goalPos, opts) {
      api.guide([tmp.copy(camera.position).setY(goalPos.y), goalPos], opts);
    },
    // (the guide without a route)
    follow() {
      api.guide(null);
    },
    hold(pos) {
      state.mode = 'hold';
      if (pos) state.target.copy(pos);
      else state.target.copy(state.base);
    },
    goTo(pos, speed = 4) {
      state.mode = 'goto';
      state.target.copy(pos);
      state.speed = speed;
    },
    arrived(eps = 0.3) {
      return state.base.distanceTo(state.target) < eps;
    },
    get mode() {
      return state.mode;
    },
    setVisible(v) {
      root.visible = v;
    },
    setColor(hex) {
      state.haloBase.set(hex);
      haloMat.uniforms.uColor.value.copy(state.haloBase);
      trailColor.set(hex);
    },
    setHintLevel(level) {
      state.hint = level;
    },
    pulse() {
      state.pulse = 1;
    },
    update(dt) {
      state.t += dt;
      if (state.mode === 'guide' || state.mode === 'follow') {
        // a soft spring toward where it wants to be, never faster than she runs
        guideTarget(dt, goal);
        // (tracks the target's own speed too, so it keeps its lead as she walks)
        if (g.haveGoal && dt > 0) g.goalVel.lerp(tmp.subVectors(goal, g.prevGoal).divideScalar(dt), 1 - Math.pow(0.02, dt));
        g.prevGoal.copy(goal);
        g.haveGoal = true;
        if (g.goalVel.length() > ORB_MAX_SPEED) g.goalVel.setLength(ORB_MAX_SPEED);
        const w = 2.6;
        acc.subVectors(goal, state.base).multiplyScalar(w * w).addScaledVector(tmp.subVectors(g.goalVel, g.vel), 2 * w);
        g.vel.addScaledVector(acc, Math.min(dt, 0.05));
        if (g.vel.length() > ORB_MAX_SPEED) g.vel.setLength(ORB_MAX_SPEED);
        state.base.addScaledVector(g.vel, Math.min(dt, 0.05));
      } else if (state.mode === 'goto') {
        tmp.subVectors(state.target, state.base);
        const d = tmp.length();
        const step = state.speed * dt;
        if (d <= step) state.base.copy(state.target);
        else state.base.addScaledVector(tmp, step / d);
      } else {
        state.base.lerp(state.target, 1 - Math.pow(0.92, dt * 60));
      }
      const bobSpeed = ORB_BOB_SPEED * (state.hint ? 1.3 : 1);
      const bob = Math.sin(state.t * bobSpeed) * ORB_BOB_AMP;
      body.position.set(state.base.x, state.base.y + bob, state.base.z);

      state.pulse = Math.max(0, state.pulse - dt * 1.2);
      const breathe = REDUCED_MOTION ? 0 : Math.sin(state.t * 2.1) * 0.04;
      halo.scale.setScalar(1 + breathe + state.pulse * 0.6);

      // trail
      for (let i = TRAIL - 1; i > 0; i--) history[i].copy(history[i - 1]);
      history[0].copy(body.position);
      for (let i = 0; i < TRAIL; i++) {
        const p = history[i];
        const n = history[Math.min(TRAIL - 1, i + 1)];
        const pr = history[Math.max(0, i - 1)];
        tangent.subVectors(pr, n);
        if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
        toCam.subVectors(camera.position, p);
        side.crossVectors(tangent, toCam).normalize();
        const k = 1 - i / (TRAIL - 1);
        const w = 0.12 * k;
        side.multiplyScalar(w);
        trailPos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
        const a = k * k * 0.9;
        trailCol.set([trailColor.r * a, trailColor.g * a, trailColor.b * a, trailColor.r * a, trailColor.g * a, trailColor.b * a], i * 6);
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;
    }
  };
  orb = api;
  return api;
}
