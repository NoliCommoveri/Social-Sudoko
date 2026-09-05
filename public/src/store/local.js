// localStorage, and nothing else. Per Q7 this holds the in-progress board and
// UI preferences only — never results or best times, which live in DO SQLite
// from slice 8 and have exactly one authoritative copy.

const PREFIX = 'sudoku.v1.';
const VERSION = 1;

// The `v1` is for a change in the shape of a value, not for a change in which
// values exist. The size suffix is here from the day the key was invented even
// though slice 1 only ever writes size 9, so slice 2 orphans nothing.
const gameKey = (sizeKey) => `${PREFIX}game.${sizeKey}`;
const PREFS_KEY = `${PREFIX}prefs`;

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked store is not worth interrupting a game over.
  }
}

function drop(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Same.
  }
}

/**
 * The saved game for one size, or null. A version mismatch, a parse failure or
 * a shape that does not match the size discards that one key and reports
 * nothing — this data is worth nothing and must never block startup.
 */
export function loadGame(sizeKey, cellCount) {
  const key = gameKey(sizeKey);
  const saved = readJSON(key);
  if (saved === null) return null;

  const isMove = (move) =>
    move !== null && typeof move === 'object' &&
    Number.isInteger(move.cell) && move.cell >= 0 && move.cell < cellCount &&
    Number.isInteger(move.from) && Number.isInteger(move.to);

  const ok =
    saved.version === VERSION &&
    saved.sizeKey === sizeKey &&
    Number.isInteger(saved.seed) &&
    Array.isArray(saved.givens) && saved.givens.length === cellCount &&
    Array.isArray(saved.values) && saved.values.length === cellCount &&
    Array.isArray(saved.moveStack) && saved.moveStack.every(isMove);

  if (!ok) {
    drop(key);
    return null;
  }
  return {
    sizeKey,
    seed: saved.seed,
    givens: Uint8Array.from(saved.givens),
    values: Uint8Array.from(saved.values),
    moveStack: saved.moveStack,
  };
}

export function saveGame(sizeKey, { seed, givens, values, moveStack }) {
  writeJSON(gameKey(sizeKey), {
    version: VERSION,
    sizeKey,
    seed,
    givens: Array.from(givens),
    values: Array.from(values),
    moveStack,
  });
}

export function clearGame(sizeKey) {
  drop(gameKey(sizeKey));
}

/**
 * UI preferences: one key holding many fields, read and written together. A
 * missing field is a default, never an error, so a preference added later
 * costs nothing to a store written before it existed.
 */
export function loadPrefs() {
  const saved = readJSON(PREFS_KEY);
  if (saved === null || saved.version !== VERSION) return { version: VERSION };
  return saved;
}

export function savePrefs(prefs) {
  writeJSON(PREFS_KEY, { ...prefs, version: VERSION });
}

/**
 * Trailing debounce, so a burst of edits costs one write. `flush` runs a
 * pending call now: switching size has to land the old board before the new
 * one is read back, or a save still in the window is read as the old state.
 */
export function debounce(fn, ms) {
  let timer = 0;
  let pending = null;

  const run = () => {
    const args = pending;
    pending = null;
    if (args) fn(...args);
  };

  const wrapped = (...args) => {
    pending = args;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
  wrapped.flush = () => {
    if (pending === null) return;
    clearTimeout(timer);
    run();
  };
  return wrapped;
}
