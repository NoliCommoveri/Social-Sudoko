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

/** UI preferences. Empty in slice 1; the key exists so slice 2 can fill it. */
export function loadPrefs() {
  const saved = readJSON(PREFS_KEY);
  if (saved === null || saved.version !== VERSION) return { version: VERSION };
  return saved;
}

export function savePrefs(prefs) {
  writeJSON(PREFS_KEY, { ...prefs, version: VERSION });
}

/** Trailing debounce, so a burst of edits costs one write. */
export function debounce(fn, ms) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
