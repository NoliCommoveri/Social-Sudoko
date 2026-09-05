// The only place grid dimensions are written down. Every other module in
// core/ derives its numbers from a geometry built out of one of these.

export const SIZES = {
  4: { n: 4, boxW: 2, boxH: 2, openness: 6 },
  6: { n: 6, boxW: 3, boxH: 2, openness: 6 },
  9: { n: 9, boxW: 3, boxH: 3, openness: 6 },
};

// The size dealt when no size preference has been stored yet.
export const DEFAULT_SIZE_KEY = 9;

export const SIZE_KEYS = Object.keys(SIZES).map(Number);
