import { REDUCED_MOTION } from '../core/config.js';
import * as audio from '../core/audio.js';

// Paused (the pause menu): every running typewriter holds its place.
let paused = false;
export function setPaused(on) {
  paused = on;
}

// run(el, text, opts) types into a single text node and returns a Promise
// that also carries finish() (complete instantly) and isDone().
export function run(el, text, { speed = 28, clickEvery = 3, pauses = true, quiet = false, sound = true } = {}) {
  const node = document.createTextNode('');
  el.appendChild(node);
  const per = REDUCED_MOTION ? speed / 2 : speed;
  let i = 0;
  let timer = null;
  let done = false;
  let resolve;
  const promise = new Promise((r) => { resolve = r; });

  function end() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    node.nodeValue = text;
    resolve();
  }

  function delayAfter(ch, next) {
    if (!pauses) return per;
    if (ch === '.' && next === '.') return per;
    if (ch === '…' || (ch === '.' && text.slice(i - 3, i) === '...')) return per * 10;
    if (ch === '.' || ch === '?' || ch === '!') return next === undefined || /\s/.test(next) ? per * 8 : per;
    if (ch === '—') return per * 5;
    if (ch === ',') return per * 4;
    return per;
  }

  function step() {
    if (done) return;
    if (paused) {
      timer = setTimeout(step, 120);
      return;
    }
    if (i >= text.length) {
      end();
      return;
    }
    const ch = text[i];
    i++;
    node.nodeValue = text.slice(0, i);
    if (sound && clickEvery > 0 && i % clickEvery === 0 && !/\s/.test(ch)) audio.tick(quiet);
    timer = setTimeout(step, delayAfter(ch, text[i]));
  }

  timer = setTimeout(step, per);
  promise.finish = end;
  promise.isDone = () => done;
  return promise;
}
