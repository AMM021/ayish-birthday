import * as typewriter from './typewriter.js';
import * as dialogue from './dialogue.js';
import { TEXT } from './text.js';

// HUD issue card (top-right). Code lines are revealed in the fixed
// canonical order, whichever lantern was lit.

const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

let el = null;
let body = null;
let badge = null;
let comment = null;
let revealed = 0;
let chain = Promise.resolve();

function updateSafeZone() {
  if (!el) {
    dialogue.setSafeZone(null);
    return;
  }
  const r = el.getBoundingClientRect();
  // reserve the card's full (resolved) height up front so it never grows into a bubble
  dialogue.setSafeZone({ left: r.left - 12, top: r.top - 12, right: r.right + 12, bottom: Math.max(r.bottom, r.top + 320) + 12 });
}

export function show() {
  reset();
  el = document.createElement('div');
  el.className = 'issuecard passive';
  const head = document.createElement('div');
  head.className = 'issuecard-head';
  const title = document.createElement('span');
  title.className = 'issuecard-title';
  title.textContent = TEXT.issue.title;
  badge = document.createElement('span');
  badge.className = 'issuecard-badge';
  badge.innerHTML = CHECK;
  badge.append(document.createTextNode(TEXT.issue.statusOpen));
  head.append(title, badge);
  body = document.createElement('pre');
  body.className = 'issuecard-body';
  comment = document.createElement('p');
  comment.className = 'issuecard-comment';
  el.append(head, body, comment);
  document.getElementById('ui').appendChild(el);
  requestAnimationFrame(() => el?.classList.add('show'));
  updateSafeZone();
  addEventListener('resize', updateSafeZone);
}

export function revealNextLine() {
  if (!el || revealed >= TEXT.issue.lines.length) return chain;
  const text = TEXT.issue.lines[revealed++];
  chain = chain.then(() => {
    if (!body) return;
    const line = document.createElement('span');
    line.className = 'line';
    body.appendChild(line);
    return typewriter.run(line, text, { speed: 30, sound: false });
  });
  return chain;
}

export function resolve() {
  chain = chain.then(async () => {
    if (!el) return;
    el.classList.add('compiling');
    const scroll = document.createElement('div');
    scroll.className = 'compile-scroll passive';
    const inner = document.createElement('div');
    const junk = [];
    for (let i = 0; i < 40; i++) junk.push(`${(i * 37).toString(16).padStart(4, '0')}  ${['ok', 'link', 'bind', 'emit', 'pack'][i % 5]} ${'·'.repeat(4 + (i * 7) % 18)}`);
    inner.textContent = junk.join('\n');
    inner.style.whiteSpace = 'pre';
    scroll.appendChild(inner);
    document.getElementById('ui').appendChild(scroll);
    await new Promise((r) => setTimeout(r, 1200));
    scroll.remove();
    if (!el) return;
    el.classList.remove('compiling');
    el.classList.add('resolved');
    badge.lastChild.nodeValue = TEXT.issue.statusResolved;
    await typewriter.run(comment, TEXT.resolution, { speed: 32, sound: false });
    updateSafeZone();
  });
  return chain;
}

export function reset() {
  removeEventListener('resize', updateSafeZone);
  el?.remove();
  el = null;
  body = null;
  revealed = 0;
  chain = Promise.resolve();
  updateSafeZone();
}

export const rect = () => el?.getBoundingClientRect() ?? null;
