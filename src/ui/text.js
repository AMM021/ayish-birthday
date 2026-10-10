// All player-facing copy, read verbatim from TEXT.md at build time so the
// game can never drift from the locked text.
import raw from '../../TEXT.md?raw';

const sections = {};
{
  let name = null;
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const m = line.match(/^## (.+)$/);
    if (m) {
      name = m[1].trim();
      sections[name] = [];
    } else if (name) {
      sections[name].push(line);
    }
  }
}

// Exact heading, or a heading that starts with `name` (headings carry
// parenthetical notes).
function section(name) {
  const s = sections[name] ?? sections[Object.keys(sections).find((k) => k.startsWith(name))];
  if (!s) throw new Error(`TEXT.md is missing section "${name}"`);
  return s;
}

// Hard-wrapped prose → text. Blank lines separate paragraphs; a line
// starting with "—" (a signature) stays on its own line.
function prose(lines) {
  const paras = [];
  let cur = [];
  const flush = () => {
    if (cur.length) paras.push(cur.join(''));
    cur = [];
  };
  for (const l of lines) {
    const t = l.trim();
    if (!t) {
      flush();
    } else if (t.startsWith('—') && cur.length) {
      cur.push('\n' + t);
    } else {
      cur.push(cur.length ? ' ' + t : t);
    }
  }
  flush();
  return paras.join('\n\n');
}

// "Label: value" entries; unlabeled lines continue the previous value.
function labeled(name) {
  const out = {};
  let key = null;
  for (const l of section(name)) {
    const t = l.trim();
    if (!t) {
      key = null;
      continue;
    }
    const m = t.match(/^([A-Z][A-Za-z0-9 ()-]*?):\s+(.*)$/) || t.match(/^([A-Z][A-Za-z0-9 ()-]*?):$/);
    if (m) {
      key = m[1].trim();
      out[key] = m[2] ? m[2].trim() : '';
    } else if (key) {
      out[key] = out[key] ? `${out[key]} ${t}` : t;
    }
  }
  return out;
}

function numbered(name) {
  const items = [];
  for (const l of section(name)) {
    const t = l.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)\.\s+(.*)$/);
    if (m) items.push(m[2]);
    else if (items.length) items[items.length - 1] += ' ' + t;
  }
  return items;
}

// First non-empty, non-parenthetical body (for single-line sections).
function body(name) {
  return prose(section(name).filter((l) => !/^\(.*\)$/.test(l.trim())));
}

function passcode() {
  const lines = section('PASSCODE screen (first screen — there is no countdown)').map((l) => l.trim());
  const h = lines.indexOf('Heading:');
  const heading = [];
  for (let i = h + 1; i < lines.length && lines[i] && !/^[A-Z][\w ]*:/.test(lines[i]); i++) {
    heading.push(lines[i]);
  }
  const rest = labeled('PASSCODE screen (first screen — there is no countdown)');
  return { heading: heading.join('\n'), hint: rest.Hint, wrong: rest['Wrong code'] };
}

function issueCard() {
  const lines = section('COMPILE — HUD issue card text');
  const get = (k) => {
    const l = lines.find((x) => x.trim().startsWith(k + ':'));
    return l.trim().slice(k.length + 1).trim();
  };
  const code = lines.map((l) => l.trim()).filter((l) => l.startsWith('//'));
  const [from, to] = get('Status').split('→').map((s) => s.trim());
  return { title: get('Title'), statusOpen: from, statusResolved: to, lines: code };
}

const hub = labeled('HUB — orb lines');
const torii = labeled('ROOM: TORII — orb lines');
const compile = labeled('ROOM: COMPILE — orb lines');
const stars = labeled('ROOM: STARS — orb lines');
const petals = labeled('ROOM: PETALS — orb lines');
const ui = labeled('UI hints');

export const TEXT = {
  passcode: passcode(),
  arrival: body('THRESHOLD — arrival line'),
  doorNote: body('THRESHOLD — door note (handwritten)'),
  orbIntro: numbered('ORB intro (HUB, first arrival — 4 beats, one bubble each, Enter to continue)'),
  orbSecond: body('ORB second bubble (beat 5 — plays once, the first time she comes within 20 units of a torii gate; Enter to continue)'),
  sealedNote: body('HUB — sealed door note (small paper on door 5, shown in 3D)'),
  hub: {
    sealed: hub['Sealed door'],
    locked: hub['Locked gate'],
    returning: hub['Returning after a room'],
    allDone: hub['All 4 done (portal appears in front of door 5)']
  },
  torii: {
    intro: torii.Intro, success: torii.Success, wrong: torii.Wrong,
    complete: torii.Complete, hint: torii['Hint (60s)']
  },
  compile: {
    intro: compile.Intro,
    fragments: [1, 2, 3, 4, 5].map((n) => compile[`Fragment ${n}`]),
    complete: compile.Complete,
    hint: compile['Hint (60s)']
  },
  issue: issueCard(),
  resolution: section('COMPILE — resolution comment').map((l) => l.trim()).filter((l) => l.startsWith('//')).join('\n'),
  stars: { intro: stars.Intro, wrong: stars.Wrong, complete: stars.Complete, hint: stars['Hint (60s)'] },
  petals: { intro: petals.Intro, lost: petals['Lost (pause)'], complete: petals.Complete, hint: petals['Hint (60s)'] },
  outOfBounds: body('OUT OF BOUNDS — orb line (ambient)'),
  finalBefore: body('FINAL — orb line before letter'),
  finalAfter: body('FINAL — orb line after letter'),
  letter: prose(section('FINAL — letter (typewriter, serif)')),
  revealFallback: body('FINAL REVEAL — fallback copy (use only if the video cannot play)'),
  endcard: section('END card').map((l) => l.trim()).filter(Boolean),
  lookHint: ui['Look hint'],
  controlsHint: ui['Controls hint'],
  touchNotice: ui['Keyboard-first notice (if touch-only device detected)']
};
