import test from 'node:test';
import assert from 'node:assert/strict';

import { SIZES } from '../public/src/core/sizes.js';
import { makeGeometry, UNIT_KINDS } from '../public/src/core/grid.js';

const allSizes = Object.values(SIZES);

test('every cell belongs to exactly UNIT_KINDS units', () => {
  for (const size of allSizes) {
    const geom = makeGeometry(size);
    for (let cell = 0; cell < geom.cellCount; cell++) {
      assert.equal(geom.unitsOf[cell].length, UNIT_KINDS, `size ${size.n}, cell ${cell}`);
      const containing = geom.units.filter((unit) => unit.includes(cell));
      assert.equal(containing.length, UNIT_KINDS, `size ${size.n}, cell ${cell}`);
    }
  }
});

test('every unit holds n distinct cells', () => {
  for (const size of allSizes) {
    const geom = makeGeometry(size);
    assert.equal(geom.units.length, UNIT_KINDS * geom.n);
    for (const unit of geom.units) {
      assert.equal(unit.length, geom.n);
      assert.equal(new Set(unit).size, geom.n);
    }
  }
});

test('peer count matches 2(n-1) + (boxW*boxH - 1) - (boxW-1) - (boxH-1)', () => {
  for (const size of allSizes) {
    const geom = makeGeometry(size);
    const { n, boxW, boxH } = geom;
    const expected = 2 * (n - 1) + (boxW * boxH - 1) - (boxW - 1) - (boxH - 1);
    for (let cell = 0; cell < geom.cellCount; cell++) {
      assert.equal(geom.peersOf[cell].length, expected, `size ${n}, cell ${cell}`);
    }
  }
});

test('the known peer counts are 7, 12 and 20', () => {
  assert.equal(makeGeometry(SIZES[4]).peersOf[0].length, 7);
  assert.equal(makeGeometry(SIZES[6]).peersOf[0].length, 12);
  assert.equal(makeGeometry(SIZES[9]).peersOf[0].length, 20);
});

test('peering is symmetric and no cell is its own peer', () => {
  for (const size of allSizes) {
    const geom = makeGeometry(size);
    for (let cell = 0; cell < geom.cellCount; cell++) {
      assert.ok(!geom.peersOf[cell].includes(cell), `cell ${cell} peers itself`);
      for (const peer of geom.peersOf[cell]) {
        assert.ok(geom.peersOf[peer].includes(cell), `${cell} -> ${peer} not symmetric`);
      }
    }
  }
});

test('boxes tile the grid: each box is a boxW x boxH rectangle', () => {
  for (const size of allSizes) {
    const geom = makeGeometry(size);
    for (let box = 0; box < geom.n; box++) {
      const members = geom.units[geom.n + geom.n + box];
      const rows = new Set([...members].map((cell) => geom.rowOf[cell]));
      const cols = new Set([...members].map((cell) => geom.colOf[cell]));
      assert.equal(rows.size, geom.boxH);
      assert.equal(cols.size, geom.boxW);
    }
  }
});

test('makeGeometry memoizes per size', () => {
  for (const size of allSizes) {
    assert.equal(makeGeometry(size), makeGeometry({ ...size }));
  }
  assert.notEqual(makeGeometry(SIZES[4]), makeGeometry(SIZES[9]));
});

test('a box that does not tile the grid is rejected', () => {
  assert.throws(() => makeGeometry({ n: 9, boxW: 2, boxH: 2 }), /does not tile/);
});
