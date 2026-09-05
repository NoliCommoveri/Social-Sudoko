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
 * @param {{ n: number, boxW: number, boxH: number, openness: number }} size
 * @returns {object} geometry, memoized per size
 */
export function makeGeometry({ n, boxW, boxH, openness }) {
  if (boxW * boxH !== n) {
    throw new Error(`box ${boxW}x${boxH} does not tile a grid of side ${n}`);
  }
  // Not a geometric fact, but every caller that holds a geometry needs it and
  // none of them get to choose it: it is fixed per size, unlike the difficulty
  // tier of design 4.3, which is a per-deal argument. Checked here because the
  // way it fails downstream — `ease` never satisfying an undefined floor — fills
  // the whole grid in silence.
  if (!Number.isInteger(openness) || openness < 1) {
    throw new Error(`size ${n} has no openness floor`);
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

  // Where the heavy rules fall: a cell carries one when the next column or row
  // starts a new box. The grid's outer frame is not a box edge and is drawn by
  // the container, so the last column and the last row are excluded — at 6x6
  // that is column 2, and rows 1 and 3.
  const boxEdgeRight = new Uint8Array(cellCount);
  const boxEdgeBottom = new Uint8Array(cellCount);
  for (let cell = 0; cell < cellCount; cell++) {
    const col = colOf[cell];
    const row = rowOf[cell];
    boxEdgeRight[cell] = (col + 1) % boxW === 0 && col !== n - 1 ? 1 : 0;
    boxEdgeBottom[cell] = (row + 1) % boxH === 0 && row !== n - 1 ? 1 : 0;
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
    n, boxW, boxH, openness, cellCount, boxesAcross,
    rowOf, colOf, boxOf,
    boxEdgeRight, boxEdgeBottom,
    units, unitsOf, peersOf,
    ALL: (1 << n) - 1,
  };
  memo.set(key, geom);
  return geom;
}
