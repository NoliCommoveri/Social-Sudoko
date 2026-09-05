// How much of the board a person can see at once.
//
// `carve` stops the moment one more removal would break uniqueness, and a
// minimal clue set is the hardest thing a solution grid can produce: it is
// often not solvable by singles at all, and when it is, it can run for dozens
// of turns with one findable cell each. Uniqueness says nothing about that —
// it is a property of the solution, not of the path to it.
//
// Openness is the second axis. A round is one sweep of the board: every cell
// findable right now by a naked single (one candidate left) or a hidden single
// (a value with one home left in some unit). A puzzle's openness floor is the
// fewest cells any round offers.
//
// The endgame is excluded. Once fewer cells remain than the round can fill,
// the count falls purely because the puzzle is ending, and holding that against
// it would mean no puzzle ever passes. So a round constrains the floor only
// while it leaves work behind.
//
// This is not the technique rating of design 4.3, which is a ceiling on how
// hard the hardest deduction is. Openness is a floor on how many deductions are
// on offer. A puzzle can be singles-only and still be a single-file corridor;
// that is exactly what a carved minimal puzzle usually is.

import { popcount, lowestValue, seedCandidates } from './candidates.js';
import { shuffled } from './rng.js';

// Writes each findable cell's value into `found` (0 meaning not findable) and
// returns how many there are.
function findSingles(geom, values, cands, found) {
  found.fill(0);
  let count = 0;

  for (let cell = 0; cell < geom.cellCount; cell++) {
    if (values[cell] === 0 && popcount(cands[cell]) === 1) {
      found[cell] = lowestValue(cands[cell]);
      count++;
    }
  }

  for (const unit of geom.units) {
    for (let value = 1; value <= geom.n; value++) {
      const bit = 1 << (value - 1);
      let placed = false;
      let homes = 0;
      let home = -1;
      for (const cell of unit) {
        if (values[cell] === value) { placed = true; break; }
        if (values[cell] === 0 && (cands[cell] & bit) !== 0) { homes++; home = cell; }
      }
      // A cell already counted as a naked single is the same cell, not a
      // second thing to find.
      if (!placed && homes === 1 && found[home] === 0) {
        found[home] = value;
        count++;
      }
    }
  }

  return count;
}

function place(geom, values, cands, cell, value) {
  values[cell] = value;
  cands[cell] = 0;
  const bit = 1 << (value - 1);
  for (const peer of geom.peersOf[cell]) cands[peer] &= ~bit;
}

/**
 * Solves `givens` by singles alone, one round at a time, reporting the tightest
 * round it hit.
 *
 * A puzzle no round of singles can advance is not open at all: `solved` is
 * false and the floor is 0, whatever it managed before stalling. Nothing in
 * this project wants a partial credit there — a puzzle that stalls is one the
 * players cannot finish with what they know.
 *
 * `floor` is `Infinity` when no round ever constrained it, which is a board
 * whose every round could have filled the rest of the grid.
 *
 * @param {object} geom
 * @param {Uint8Array} givens
 * @returns {{ solved: boolean, floor: number }}
 */
export function measureOpenness(geom, givens) {
  const values = Uint8Array.from(givens);
  const cands = new Uint16Array(geom.cellCount);
  if (!seedCandidates(geom, values, cands)) return { solved: false, floor: 0 };

  let empties = 0;
  for (let cell = 0; cell < geom.cellCount; cell++) if (values[cell] === 0) empties++;

  const found = new Uint8Array(geom.cellCount);
  let floor = Infinity;
  while (empties > 0) {
    const available = findSingles(geom, values, cands, found);
    if (available === 0) return { solved: false, floor: 0 };
    if (available < empties && available < floor) floor = available;
    for (let cell = 0; cell < geom.cellCount; cell++) {
      if (found[cell] !== 0) {
        place(geom, values, cands, cell, found[cell]);
        empties--;
      }
    }
  }
  return { solved: true, floor };
}

/**
 * Adds clues back to a carved puzzle until it solves by singles with every
 * round offering at least `floor` cells.
 *
 * Clues come from `solution` in one shuffled order, so the result is a superset
 * of `base` that agrees with `solution` everywhere — which is what keeps it
 * uniquely solvable without a second uniqueness check. That is the same
 * add-back shape design 4.3 tiers on, run here against openness instead of a
 * technique rating.
 *
 * Termination is guaranteed by the complete grid: it solves with no rounds at
 * all. Reaching it would mean returning a puzzle with nothing to do, so the
 * caller is expected to hold a floor that real boards meet well before then —
 * `SIZES[<size>].openness` does.
 *
 * @param {object} geom
 * @param {Uint8Array} solution
 * @param {Uint8Array} base uniquely solvable, a subset of `solution`
 * @param {() => number} rng
 * @param {number} floor
 * @returns {Uint8Array}
 */
export function ease(geom, solution, base, rng, floor) {
  const puzzle = Uint8Array.from(base);
  const holes = [];
  for (let cell = 0; cell < geom.cellCount; cell++) {
    if (puzzle[cell] === 0) holes.push(cell);
  }
  const order = shuffled(rng, holes);

  let next = 0;
  for (;;) {
    const measured = measureOpenness(geom, puzzle);
    if (measured.solved && measured.floor >= floor) return puzzle;
    if (next >= order.length) return puzzle;
    puzzle[order[next]] = solution[order[next]];
    next++;
  }
}
