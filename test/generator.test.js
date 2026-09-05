import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZES } from '../public/src/core/sizes.js';
import { makeGeometry } from '../public/src/core/grid.js';
import { mulberry32 } from '../public/src/core/rng.js';
import { fillComplete, countSolutions, carve, deal } from '../public/src/core/generator.js';

const allSizes = Object.values(SIZES);
const FILL_SEEDS = 200;
const CARVE_SEEDS = 100;

function assertCompleteAndValid(geom, values, context) {
  for (let cell = 0; cell < geom.cellCount; cell++) {
    assert.notEqual(values[cell], 0, `${context}: cell ${cell} empty`);
  }
  for (const unit of geom.units) {
    const seen = new Set([...unit].map((cell) => values[cell]));
    assert.equal(seen.size, geom.n, `${context}: unit is not a permutation`);
    for (const value of seen) {
      assert.ok(value >= 1 && value <= geom.n, `${context}: value ${value} out of range`);
    }
  }
}

test('fillComplete returns a valid complete grid', () => {
  for (const size of allSizes) {
    const geom = makeGeometry(size);
    for (let seed = 1; seed <= FILL_SEEDS; seed++) {
      const values = fillComplete(geom, mulberry32(seed));
      assertCompleteAndValid(geom, values, `size ${size.n}, seed ${seed}`);
    }
  }
});

test('fillComplete is deterministic per seed, and seeds differ', () => {
  const geom = makeGeometry(SIZES[9]);
  const first = fillComplete(geom, mulberry32(7));
  const again = fillComplete(geom, mulberry32(7));
  assert.deepEqual(Array.from(first), Array.from(again));

  const other = fillComplete(geom, mulberry32(8));
  assert.notDeepEqual(Array.from(first), Array.from(other));
});

test('countSolutions on a complete grid is 1', () => {
  for (const size of allSizes) {
    const geom = makeGeometry(size);
    const values = fillComplete(geom, mulberry32(3));
    assert.equal(countSolutions(geom, values, 2), 1);
  }
});

test('countSolutions on a complete grid with one cell emptied is 1', () => {
  for (const size of allSizes) {
    const geom = makeGeometry(size);
    const values = fillComplete(geom, mulberry32(11));
    for (const cell of [0, Math.floor(geom.cellCount / 2), geom.cellCount - 1]) {
      const holed = Uint8Array.from(values);
      holed[cell] = 0;
      assert.equal(countSolutions(geom, holed, 2), 1, `size ${geom.n}, cell ${cell}`);
    }
  }
});

test('an empty 4x4 grid has exactly 288 solutions', () => {
  const geom = makeGeometry(SIZES[4]);
  assert.equal(countSolutions(geom, new Uint8Array(geom.cellCount), Infinity), 288);
});

test('countSolutions stops at the cap', () => {
  const geom = makeGeometry(SIZES[4]);
  assert.equal(countSolutions(geom, new Uint8Array(geom.cellCount), 2), 2);
});

test('countSolutions on a board with two peers sharing a value is 0', () => {
  const geom = makeGeometry(SIZES[4]);
  const values = new Uint8Array(geom.cellCount);
  values[0] = 1;
  values[1] = 1;
  assert.equal(countSolutions(geom, values, 2), 0);
});

test('carve output is uniquely solvable, and a subset of its solution', () => {
  const geom = makeGeometry(SIZES[9]);
  for (let seed = 1; seed <= CARVE_SEEDS; seed++) {
    const rng = mulberry32(seed);
    const solution = fillComplete(geom, rng);
    const givens = carve(geom, solution, rng);

    assert.equal(countSolutions(geom, givens, 2), 1, `seed ${seed} is not unique`);
    for (let cell = 0; cell < geom.cellCount; cell++) {
      if (givens[cell] !== 0) {
        assert.equal(givens[cell], solution[cell], `seed ${seed}, cell ${cell} disagrees`);
      }
    }
    assert.ok(givens.some((value) => value === 0), `seed ${seed} removed nothing`);
  }
});

test('carve does not mutate the solution it was given', () => {
  const geom = makeGeometry(SIZES[9]);
  const rng = mulberry32(42);
  const solution = fillComplete(geom, rng);
  const before = Array.from(solution);
  carve(geom, solution, rng);
  assert.deepEqual(Array.from(solution), before);
});

test('deal is deterministic per seed', () => {
  const geom = makeGeometry(SIZES[9]);
  const first = deal(geom, 12345);
  const again = deal(geom, 12345);
  assert.deepEqual(Array.from(first.givens), Array.from(again.givens));
  assert.deepEqual(Array.from(first.solution), Array.from(again.solution));
  assert.equal(countSolutions(geom, first.givens, 2), 1);
});
