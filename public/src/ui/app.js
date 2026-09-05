// Wiring: owns the game state, deals new puzzles, runs undo/redo, answers the
// check button, and notices completion. Nothing here is timed or recorded —
// there is nothing to record until slice 8.

import { SIZES, DEFAULT_SIZE_KEY } from '../core/sizes.js';
import { makeGeometry } from '../core/grid.js';
import { deal } from '../core/generator.js';
import { createBoard } from './board.js';
import { loadGame, saveGame, debounce } from '../store/local.js';

const SAVE_DELAY_MS = 200;

const sizeKey = DEFAULT_SIZE_KEY;
const geom = makeGeometry(SIZES[sizeKey]);

const els = {
  board: document.getElementById('board'),
  pad: document.getElementById('pad'),
  status: document.getElementById('status'),
  newGame: document.getElementById('new-game'),
  undo: document.getElementById('undo'),
  redo: document.getElementById('redo'),
  check: document.getElementById('check'),
};

const state = {
  seed: 0,
  givens: new Uint8Array(geom.cellCount),
  values: new Uint8Array(geom.cellCount),
  solution: new Uint8Array(geom.cellCount),
  moveStack: [],
  redoStack: [],
  marks: new Set(),
  selected: null,
  solved: false,
};

const persist = debounce(() => {
  saveGame(sizeKey, {
    seed: state.seed,
    givens: state.givens,
    values: state.values,
    moveStack: state.moveStack,
  });
}, SAVE_DELAY_MS);

const board = createBoard({
  root: els.board,
  geom,
  onSelect: (cell) => {
    state.selected = cell;
    render();
  },
  onSet: (cell, value) => setValue(cell, value),
});

function randomSeed() {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function newGame(seed = randomSeed()) {
  const dealt = deal(geom, seed);
  state.seed = seed;
  state.givens = dealt.givens;
  state.solution = dealt.solution;
  state.values = Uint8Array.from(dealt.givens);
  state.moveStack = [];
  state.redoStack = [];
  state.marks.clear();
  state.selected = null;
  state.solved = false;
  persist();
  render();
}

// A saved game stores its seed rather than its solution, so restoring means
// re-dealing. If the givens no longer match what that seed produces the save
// predates a generator change: drop it and deal fresh rather than restore a
// board whose solution we cannot trust.
function restore(saved) {
  const dealt = deal(geom, saved.seed);
  for (let cell = 0; cell < geom.cellCount; cell++) {
    if (dealt.givens[cell] !== saved.givens[cell]) return false;
  }
  state.seed = saved.seed;
  state.givens = dealt.givens;
  state.solution = dealt.solution;
  state.values = saved.values;
  state.moveStack = saved.moveStack;
  state.redoStack = [];
  state.marks.clear();
  state.selected = null;
  state.solved = isComplete();
  render();
  return true;
}

function isComplete() {
  for (let cell = 0; cell < geom.cellCount; cell++) {
    if (state.values[cell] !== state.solution[cell]) return false;
  }
  return true;
}

function apply(cell, value) {
  state.values[cell] = value;
  state.marks.clear();
  state.solved = isComplete();
  persist();
  render();
}

function setValue(cell, value) {
  if (state.givens[cell] !== 0) return;
  const from = state.values[cell];
  if (from === value) return;
  state.moveStack.push({ cell, from, to: value });
  state.redoStack.length = 0;
  state.selected = cell;
  apply(cell, value);
}

function undo() {
  const move = state.moveStack.pop();
  if (!move) return;
  state.redoStack.push(move);
  state.selected = move.cell;
  apply(move.cell, move.from);
}

function redo() {
  const move = state.redoStack.pop();
  if (!move) return;
  state.moveStack.push(move);
  state.selected = move.cell;
  apply(move.cell, move.to);
}

// Q3: mistakes are marked only when asked for. Immediate feedback would make
// nine taps brute-force any cell. Marks clear on the next edit.
function check() {
  state.marks.clear();
  for (let cell = 0; cell < geom.cellCount; cell++) {
    const value = state.values[cell];
    if (value !== 0 && value !== state.solution[cell]) state.marks.add(cell);
  }
  render();
}

function statusText() {
  if (state.solved) return 'Solved.';
  if (state.marks.size > 0) {
    return state.marks.size === 1 ? '1 cell is wrong.' : `${state.marks.size} cells are wrong.`;
  }
  const empty = state.values.reduce((count, value) => count + (value === 0 ? 1 : 0), 0);
  return `${empty} to go.`;
}

function render() {
  board.render(state);
  els.status.textContent = statusText();
  els.board.classList.toggle('solved', state.solved);
  els.undo.disabled = state.moveStack.length === 0;
  els.redo.disabled = state.redoStack.length === 0;
}

function buildPad() {
  for (let value = 1; value <= geom.n; value++) {
    const button = document.createElement('button');
    button.className = 'pad-key';
    button.type = 'button';
    button.textContent = String(value);
    button.addEventListener('click', () => {
      if (state.selected !== null) setValue(state.selected, value);
    });
    els.pad.append(button);
  }
  const erase = document.createElement('button');
  erase.className = 'pad-key erase';
  erase.type = 'button';
  erase.textContent = 'Erase';
  erase.addEventListener('click', () => {
    if (state.selected !== null) setValue(state.selected, 0);
  });
  els.pad.append(erase);
}

// The on-screen undo/redo buttons are not optional — the phone has no Ctrl.
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() !== 'z') return;
  event.preventDefault();
  if (event.shiftKey) redo();
  else undo();
});

// Every control hands focus back to the board. Without this a Chromebook
// player who presses Check has to Tab their way back before the keyboard
// drives the grid again.
function control(el, action) {
  el.addEventListener('click', () => {
    action();
    board.focus();
  });
}

control(els.newGame, () => newGame());
control(els.undo, undo);
control(els.redo, redo);
control(els.check, check);

buildPad();

const saved = loadGame(sizeKey, geom.cellCount);
if (!saved || !restore(saved)) newGame();
board.focus();
