// Geometry: indices, units, peers. Everything is derived from { n, boxW, boxH }.
//
// Cells are a single row-major index 0 .. n*n-1, never [row][col]. One index
// means peer sets are flat integer arrays and there is no transposition bug to
// make.

// Row, column, box. A count of unit kinds, not a grid dimension: every cell is
// in exactly one of each at 4x4, 6x6 and 9x9 alike.
export const UNIT_KINDS = 3;

const memo = new Map();

/**
 * @param {{ n: number, boxW: number, boxH: number }} size
 * @returns {object} geometry, memoized per size
 */
export function makeGeometry({ n, boxW, boxH }) {
  if (boxW * boxH !== n) {
    throw new Error(`box ${boxW}x${boxH} does not tile a grid of side ${n}`);
  }
  const key = `${n}:${boxW}:${boxH}`;
  const hit = memo.get(key);
  if (hit) return hit;

  const cellCount = n * n;
  const boxesAcross = n / boxW;

  const rowOf = new Uint8Array(cellCount);
  const colOf = new Uint8Array(cellCount);
  const boxOf = new Uint8Array(cellCount);

  for (let cell = 0; cell < cellCount; cell++) {
    const row = Math.floor(cell / n);
    const col = cell % n;
    rowOf[cell] = row;
    colOf[cell] = col;
    boxOf[cell] = Math.floor(row / boxH) * boxesAcross + Math.floor(col / boxW);
  }

  // units[k * n + i] is the i'th unit of kind k. Kinds in order: row, col, box.
  const units = [];
  for (let kind = 0; kind < UNIT_KINDS; kind++) {
    const index = [rowOf, colOf, boxOf][kind];
    for (let i = 0; i < n; i++) {
      const members = new Uint8Array(n);
      let at = 0;
      for (let cell = 0; cell < cellCount; cell++) {
        if (index[cell] === i) members[at++] = cell;
      }
      units.push(members);
    }
  }

  const unitsOf = [];
  const peersOf = [];
  for (let cell = 0; cell < cellCount; cell++) {
    const mine = [
      units[rowOf[cell]],
      units[n + colOf[cell]],
      units[n + n + boxOf[cell]],
    ];
    unitsOf.push(mine);

    const seen = new Set();
    for (const unit of mine) {
      for (const other of unit) {
        if (other !== cell) seen.add(other);
      }
    }
    peersOf.push(Uint8Array.from(seen).sort());
  }

  const geom = {
    n, boxW, boxH, cellCount, boxesAcross,
    rowOf, colOf, boxOf,
    units, unitsOf, peersOf,
    ALL: (1 << n) - 1,
  };
  memo.set(key, geom);
  return geom;
}
