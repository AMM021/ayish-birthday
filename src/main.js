import './styles/overlay.css';
import './styles/issuecard.css';
import * as THREE from 'three';
import { PALETTE, DEV } from './core/config.js';
import { initRenderer, hasWebGL, renderer } from './core/renderer.js';
import * as composer from './core/composer.js';
import * as clock from './core/clock.js';
import * as input from './core/input.js';
import * as save from './core/save.js';
import * as world from './world/world.js';
import * as starfield from './objects/starfield.js';
import * as nebula from './objects/nebula.js';
import * as skydome from './objects/skydome.js';
import * as orbModule from './objects/orb.js';
import * as machine from './state/machine.js';
import * as dialogue from './ui/dialogue.js';
import * as prompts from './ui/prompts.js';
import * as pausemenu from './ui/pausemenu.js';
import './styles/pause.css';
import { TEXT } from './ui/text.js';

// Palette → CSS custom properties, so stylesheets never hold raw colours.
function exposePalette() {
  const root = document.documentElement.style;
  for (const [name, hex] of Object.entries(PALETTE)) {
    const c = new THREE.Color(hex);
    root.setProperty(`--${name}`, hex);
    root.setProperty(`--${name}-rgb`, `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`);
  }
}

function fallback(message) {
  document.getElementById('loading')?.remove();
  const d = document.createElement('div');
  d.className = 'fallback-page';
  d.textContent = message;
  document.body.appendChild(d);
}

function resumeTarget() {
  const p = save.load();
  if (!p.unlocked) return 'PASSCODE';
  if (p.seenReveal) return 'EXPLORE'; // the end card was seen; she wakes in the finished world
  if (p.reachedFinal) return 'FINAL';
  // Mid-journey: restart the level she was on (levels only go forward).
  if (p.roomsDone.length === 0) return 'HUB';
  return save.currentLevel() ?? 'FINAL';
}

async function boot() {
  exposePalette();
  if (!hasWebGL()) {
    fallback('This experience needs WebGL. Try Chrome, Firefox, or Edge on a laptop.');
    return;
  }

  const loading = document.getElementById('loading');
  const slow = setTimeout(() => {
    if (loading && !loading.classList.contains('done')) {
      loading.textContent = 'loading… still going…';
    }
  }, 5000);

  const canvas = document.getElementById('game');
  initRenderer(canvas);
  composer.initComposer(world.scene, world.camera);
  input.initInput(canvas);
  save.load();

  // Persistent sky.
  const dome = skydome.create();
  const stars = starfield.create();
  const clouds = nebula.create();
  world.registerSky({ dome, stars, nebula: clouds });
  world.sky.add(clouds.group, stars.group, stars.extras);
  world.setAtmosphere('day');
  composer.onPixelRatio((r) => stars.setPixelRatio(r));
  world.onUpdate((dt) => {
    dome.update(dt);
    stars.update(dt);
    clouds.update(dt);
  });

  // Persistent companion.
  const orb = orbModule.create();
  world.rootGroup.add(orb.root);
  orb.setVisible(false);
  world.onUpdate((dt) => orb.update(dt));
  world.setOutOfBoundsHandler(() => {
    if (orb.root.visible) dialogue.say(orb.anchor, TEXT.outOfBounds, { mode: 'ambient' });
  });

  prompts.initPrompts();
  pausemenu.init(machine);

  addEventListener('resize', () => {
    world.resize();
    composer.resize();
  });

  if (DEV) {
    const devtools = await import('./ui/devtools.js');
    devtools.init({ machine, stars });
    // test hook for automated QA; exists only in dev mode
    window.__game = { world, machine, save, input, dialogue, orb, composer, clock, THREE, renderer };
  }

  // --- loop -----------------------------------------------------------
  let running = false;
  let first = true;
  function frame() {
    if (clock.isPaused()) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
    clock.tick();
    const dt = clock.getDelta();
    world.update(dt);
    machine.update(dt);
    dialogue.update(dt);
    prompts.update();
    pausemenu.update();
    composer.updateQuality(clock.getRawDelta());
    composer.render();
    if (first) {
      first = false;
      clearTimeout(slow);
      setTimeout(() => {
        loading?.classList.add('done');
        setTimeout(() => loading?.remove(), 500);
      }, 400);
    }
  }
  function startLoop() {
    if (running) return;
    running = true;
    clock.resync();
    requestAnimationFrame(frame);
  }
  clock.onResume(() => {
    input.clearHeld();
    composer.pauseQuality();
    startLoop();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      input.clearHeld();
      clock.resync();
      composer.pauseQuality();
    }
  });

  clock.start();
  startLoop();
  await machine.go(resumeTarget(), { fadeOut: 0, hold: 0, fadeIn: 600 });
}

boot();
