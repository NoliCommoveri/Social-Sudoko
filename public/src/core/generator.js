// Fill, count solutions, carve. One search backs all three: MRV cell ordering
// over incrementally maintained candidate masks, with the value order shuffled
// when an rng is supplied and left in index order when it is not.

import { mulberry32, shuffled } from './rng.js';

function popcount(mask) {
  let m = mask;
  let count = 0;
  while (m) {
    m &= m - 1;
    count++;
  }
  return count;
}

function valuesIn(mask) {
  const out = [];
  let m = mask;
  while (m) {
    const low = m & -m;
    out.push(31 - Math.clz32(low) + 1);
    m ^= low;
  }
  return out;
}

// Places `value` in `cell`, clearing its bit from every empty peer that still
// carries it. `trail` collects those peers so the move can be taken back.
function assign(geom, values, cands, cell, value, trail) {
  values[cell] = value;
  cands[cell] = 0;
  const bit = 1 << (value - 1);
  for (const peer of geom.peersOf[cell]) {
    if (values[peer] === 0 && (cands[peer] & bit) !== 0) {
      cands[peer] &= ~bit;
      trail.push(peer);
    }
  }
}

function unassign(geom, values, cands, cell, prevMask, value, trail) {
  const bit = 1 << (value - 1);
  for (const peer of trail) cands[peer] |= bit;
  values[cell] = 0;
  cands[cell] = prevMask;
}

/**
 * Counts solutions of a partially filled board, stopping at `cap`.
 *
 * When it returns because the cap was reached, `values` is left holding the
 * last solution rather than being unwound — which is what lets fillComplete
 * run this with cap 1 and keep the board.
 */
function search(geom, values, cands, rng, cap) {
  let best = -1;
  let bestCount = geom.n + 1;
  for (let cell = 0; cell < geom.cellCount; cell++) {
    if (values[cell] !== 0) continue;
    const count = popcount(cands[cell]);
    if (count < bestCount) {
      bestCount = count;
      best = cell;
      if (count <= 1) break;
    }
  }
  if (best === -1) return 1;
  if (bestCount === 0) return 0;

  const order = rng ? shuffled(rng, valuesIn(cands[best])) : valuesIn(cands[best]);
  let total = 0;
  for (const value of order) {
    const prevMask = cands[best];
    const trail = [];
    assign(geom, values, cands, best, value, trail);
    total += search(geom, values, cands, rng, cap - total);
    if (total >= cap) return total;
    unassign(geom, values, cands, best, prevMask, value, trail);
  }
  return total;
}

// Seeds candidate masks from the filled cells. Returns false if two peers
// already hold the same value, which is a board with no solutions at all.
function seedCandidates(geom, values, cands) {
  cands.fill(geom.ALL);
  for (let cell = 0; cell < geom.cellCount; cell++) {
    const value = values[cell];
    if (value === 0) continue;
    const bit = 1 << (value - 1);
    cands[cell] = 0;
    for (const peer of geom.peersOf[cell]) {
      if (values[peer] === value) return false;
      cands[peer] &= ~bit;
    }
  }
  return true;
}

/**
 * A complete valid grid.
 * @param {object} geom
 * @param {() => number} rng
 * @returns {Uint8Array}
 */
export function fillComplete(geom, rng) {
  const values = new Uint8Array(geom.cellCount);
  const cands = new Uint16Array(geom.cellCount).fill(geom.ALL);
  if (search(geom, values, cands, rng, 1) !== 1) {
    throw new Error('fillComplete found no solution for an empty grid');
  }
  return values;
}

/**
 * How many ways the board completes, counted no further than `cap`.
 * Every uniqueness check in this project passes cap 2 — nobody needs the real
 * count, only "is it more than one".
 *
 * @param {object} geom
 * @param {Uint8Array} values
 * @param {number} [cap]
 * @returns {number}
 */
export function countSolutions(geom, values, cap = 2) {
  const work = Uint8Array.from(values);
  const cands = new Uint16Array(geom.cellCount);
  if (!seedCandidates(geom, work, cands)) return 0;
  return search(geom, work, cands, null, cap);
}

/**
 * Removes clues from a complete grid while the remainder stays uniquely
 * solvable. One pass in shuffled order, so the result is minimal with respect
 * to that order — not globally minimal, which nothing needs.
 *
 * @param {object} geom
 * @param {Uint8Array} solution
 * @param {() => number} rng
 * @returns {Uint8Array}
 */
export function carve(geom, solution, rng) {
  const puzzle = Uint8Array.from(solution);
  const cells = new Array(geom.cellCount);
  for (let cell = 0; cell < geom.cellCount; cell++) cells[cell] = cell;
  for (const cell of shuffled(rng, cells)) {
    const value = puzzle[cell];
    puzzle[cell] = 0;
    if (countSolutions(geom, puzzle, 2) !== 1) puzzle[cell] = value;
  }
  return puzzle;
}

/**
 * A whole puzzle from one seed. Deterministic: the same seed and size always
 * give the same givens and the same solution.
 *
 * @param {object} geom
 * @param {number} seed
 * @returns {{ seed: number, solution: Uint8Array, givens: Uint8Array }}
 */
export function deal(geom, seed) {
  const rng = mulberry32(seed);
  const solution = fillComplete(geom, rng);
  const givens = carve(geom, solution, rng);
  return { seed, solution, givens };
}
