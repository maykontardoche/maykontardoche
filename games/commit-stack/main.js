// Commit Stack — jogo de blocos em 3D com Three.js.
// Tabuleiro 10×20 visível (+2 linhas ocultas para o spawn). Linha 0 é o fundo do poço.

import * as THREE from 'three';

const COLS = 10;
const VISIBLE_ROWS = 20;
const ROWS = VISIBLE_ROWS + 2;
const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;
const CLEAR_FLASH = 0.2;
const LINE_SCORE = [0, 100, 300, 500, 800];
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mesma paleta validada dos gráficos do perfil (dataviz: separação para daltonismo e contraste).
const PIECES = {
  I: { color: 0x3987e5, shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  O: { color: 0xc98500, shape: [[1, 1], [1, 1]] },
  T: { color: 0x9085e9, shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  S: { color: 0x199e70, shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  Z: { color: 0xe66767, shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
  J: { color: 0x00b7d9, shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  L: { color: 0xd95926, shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
};
const KINDS = Object.keys(PIECES);

// ── DOM ───────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const ui = {
  score: $('score'), lines: $('lines'), level: $('level'), best: $('best'),
  start: $('start'), paused: $('paused'), over: $('over'), play: $('play'), again: $('again'),
  finalScore: $('final-score'), finalLines: $('final-lines'), finalBest: $('final-best'), verdict: $('verdict'),
};
const storage = {
  get() { try { return Number(localStorage.getItem('commit-stack:best')) || 0; } catch { return 0; } },
  set(v) { try { localStorage.setItem('commit-stack:best', String(v)); } catch { /* sem storage: só não guarda */ } },
};
const fmt = (n) => n.toLocaleString('pt-BR');

// ── regras (sem Three.js: dá para testar sozinho) ────────────────────────
const rotateCW = (m) => m[0].map((_, j) => m.map((row) => row[j]).reverse());
const rotations = Object.fromEntries(KINDS.map((k) => {
  const states = [PIECES[k].shape];
  for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1]));
  return [k, states];
}));

function cellsOf(piece, rot = piece.rot, px = piece.x, py = piece.y) {
  const out = [];
  rotations[piece.kind][rot].forEach((row, i) => row.forEach((v, j) => { if (v) out.push([px + j, py - i]); }));
  return out;
}

const state = {
  mode: 'idle', // idle | playing | paused | over
  grid: [], piece: null, next: null, bag: [],
  score: 0, lines: 0, level: 1, best: storage.get(),
  fall: 0, lockTimer: 0, lockResets: 0, softDrop: false,
  clearing: null, // { rows, t }
};

function emptyGrid() { return Array.from({ length: ROWS }, () => new Array(COLS).fill(null)); }

function fits(piece, rot, px, py) {
  return cellsOf(piece, rot, px, py).every(([c, r]) => c >= 0 && c < COLS && r >= 0 && r < ROWS && !state.grid[r][c]);
}

// saco de 7: cada peça aparece uma vez a cada 7, sem sequências injustas
function draw() {
  if (!state.bag.length) {
    state.bag = [...KINDS];
    for (let i = state.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
    }
  }
  return state.bag.pop();
}

function spawn() {
  const kind = state.next ?? draw();
  state.next = draw();
  const n = rotations[kind][0].length;
  state.piece = { kind, rot: 0, x: Math.floor((COLS - n) / 2), y: ROWS - 1 };
  state.fall = state.lockTimer = state.lockResets = 0;
  if (!fits(state.piece, 0, state.piece.x, state.piece.y)) gameOver();
}

const onGround = () => !fits(state.piece, state.piece.rot, state.piece.x, state.piece.y - 1);

function touched() {
  if (onGround() && state.lockResets < MAX_LOCK_RESETS) { state.lockTimer = 0; state.lockResets++; }
}

function move(dx) {
  const p = state.piece;
  if (state.mode !== 'playing' || state.clearing || !p) return false;
  if (!fits(p, p.rot, p.x + dx, p.y)) return false;
  p.x += dx;
  touched();
  return true;
}

function rotate(dir = 1) {
  const p = state.piece;
  if (state.mode !== 'playing' || state.clearing || !p || p.kind === 'O') return false;
  const rot = (p.rot + dir + 4) % 4;
  // wall kicks simples: tenta no lugar, depois para os lados e para cima
  for (const [kx, ky] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, 1], [-1, 1], [1, 1]]) {
    if (fits(p, rot, p.x + kx, p.y + ky)) {
      Object.assign(p, { rot, x: p.x + kx, y: p.y + ky });
      touched();
      return true;
    }
  }
  return false;
}

function hardDrop() {
  const p = state.piece;
  if (state.mode !== 'playing' || state.clearing || !p) return;
  let dropped = 0;
  while (fits(p, p.rot, p.x, p.y - 1)) { p.y--; dropped++; }
  state.score += dropped * 2;
  lock();
}

function lock() {
  const cells = cellsOf(state.piece);
  for (const [c, r] of cells) state.grid[r][c] = state.piece.kind;
  state.piece = null;
  // travou com bloco acima da área visível: estourou a pilha
  if (cells.some(([, r]) => r >= VISIBLE_ROWS)) { gameOver(); return; }
  const full = [];
  for (let r = 0; r < ROWS; r++) if (state.grid[r].every(Boolean)) full.push(r);
  if (full.length) {
    state.clearing = { rows: full, t: CLEAR_FLASH };
    burstRows(full);
  } else {
    spawn();
  }
}

function finishClear() {
  const rows = state.clearing.rows;
  state.grid = state.grid.filter((_, r) => !rows.includes(r));
  while (state.grid.length < ROWS) state.grid.push(new Array(COLS).fill(null));
  state.lines += rows.length;
  state.score += LINE_SCORE[rows.length] * state.level;
  state.level = 1 + Math.floor(state.lines / 10);
  state.clearing = null;
  spawn();
}

const gravity = () => Math.max(0.05, 0.8 * Math.pow(0.85, state.level - 1));

function step(dt) {
  if (state.mode !== 'playing') return;
  if (state.clearing) {
    state.clearing.t -= dt;
    if (state.clearing.t <= 0) finishClear();
    return;
  }
  if (!state.piece) return;
  const interval = state.softDrop ? Math.min(gravity(), 0.035) : gravity();
  if (onGround()) {
    state.lockTimer += dt;
    if (state.lockTimer >= LOCK_DELAY) lock();
    return;
  }
  state.fall += dt;
  while (state.fall >= interval && !onGround()) {
    state.fall -= interval;
    state.piece.y--;
    if (state.softDrop) state.score += 1;
  }
}

function start() {
  Object.assign(state, { grid: emptyGrid(), bag: [], next: null, score: 0, lines: 0, level: 1, clearing: null, softDrop: false });
  state.mode = 'playing';
  spawn();
  ui.start.hidden = ui.over.hidden = ui.paused.hidden = true;
}

function togglePause(force) {
  if (state.mode !== 'playing' && state.mode !== 'paused') return;
  const pause = force ?? state.mode === 'playing';
  state.mode = pause ? 'paused' : 'playing';
  ui.paused.hidden = !pause;
}

function gameOver() {
  state.mode = 'over';
  if (state.score > state.best) { state.best = state.score; storage.set(state.score); }
  ui.finalScore.textContent = fmt(state.score);
  ui.finalLines.textContent = fmt(state.lines);
  ui.finalBest.textContent = fmt(state.best);
  ui.verdict.textContent = state.score >= state.best && state.score > 0 ? 'Novo recorde. Esse merge vai pro changelog.'
    : state.lines >= 20 ? 'Pilha bonita. Mais uma rodada?'
    : 'Até o melhor código estoura a pilha às vezes.';
  setTimeout(() => { ui.over.hidden = false; ui.again.focus(); }, 500);
}

// ── renderer, cena, câmera ────────────────────────────────────────────────
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  document.body.innerHTML = '<p style="padding:24px;font-family:monospace">Seu navegador não tem WebGL disponível.</p>';
  throw new Error('WebGL indisponível');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
const FOCUS = new THREE.Vector3(2.4, 0.4, 0);

scene.add(new THREE.HemisphereLight(0xb8d4ff, 0x140a24, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.8);
key.position.set(-6, 14, 12);
scene.add(key);

// coordenada de célula → mundo
const wx = (c) => c - (COLS - 1) / 2;
const wy = (r) => r - (VISIBLE_ROWS - 1) / 2;

// poço: fundo com grade e paredes de neon
function wellTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#080b13'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(0,217,255,.16)'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(COLS, VISIBLE_ROWS);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const back = new THREE.Mesh(new THREE.PlaneGeometry(COLS, VISIBLE_ROWS), new THREE.MeshBasicMaterial({ map: wellTexture() }));
back.position.set(0, 0, -0.55);
scene.add(back);

const neon = new THREE.MeshBasicMaterial({ color: 0x00d9ff });
const neon2 = new THREE.MeshBasicMaterial({ color: 0xbd93f9 });
for (const [w, h, x, y, m] of [
  [0.12, VISIBLE_ROWS + 0.24, -COLS / 2 - 0.06, 0, neon],
  [0.12, VISIBLE_ROWS + 0.24, COLS / 2 + 0.06, 0, neon],
  [COLS + 0.24, 0.12, 0, -VISIBLE_ROWS / 2 - 0.06, neon2],
]) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.1), m);
  bar.position.set(x, y, 0);
  scene.add(bar);
}

const stars = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
    Array.from({ length: 1200 }, (_, i) => (i % 3 === 2 ? -20 - Math.random() * 40 : (Math.random() - 0.5) * 120)), 3)),
  new THREE.PointsMaterial({ color: 0x8b949e, size: 0.15, transparent: true, opacity: 0.7 }),
);
scene.add(stars);

// blocos: um material por peça, compartilhados pelo pool
const blockGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const edgeGeo = new THREE.EdgesGeometry(blockGeo);
const mats = Object.fromEntries(KINDS.map((k) => [k, {
  body: new THREE.MeshStandardMaterial({ color: PIECES[k].color, emissive: PIECES[k].color, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.25 }),
  edge: new THREE.LineBasicMaterial({ color: new THREE.Color(PIECES[k].color).lerp(new THREE.Color(0xffffff), 0.55) }),
  ghost: new THREE.MeshBasicMaterial({ color: PIECES[k].color, transparent: true, opacity: 0.16, depthWrite: false }),
}]));
const flash = new THREE.MeshBasicMaterial({ color: 0xffffff });

function makeBlock() {
  const mesh = new THREE.Mesh(blockGeo, mats.I.body);
  const edges = new THREE.LineSegments(edgeGeo, mats.I.edge);
  mesh.add(edges);
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}
const setBlock = (mesh, kind, material) => { mesh.material = material ?? mats[kind].body; mesh.children[0].material = mats[kind].edge; };

const boardBlocks = Array.from({ length: ROWS * COLS }, makeBlock);
const pieceBlocks = Array.from({ length: 4 }, makeBlock);
const ghostBlocks = Array.from({ length: 4 }, makeBlock);
const nextBlocks = Array.from({ length: 4 }, makeBlock);
nextBlocks.forEach((b) => b.scale.setScalar(0.8));

function label(text, color = '#00d9ff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 34px ui-monospace, Menlo, Consolas, monospace';
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, 4, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
  s.scale.set(4, 1, 1);
  return s;
}
const NEXT_AT = new THREE.Vector3(COLS / 2 + 3.2, VISIBLE_ROWS / 2 - 3.2, 0);
const nextLabel = label('NEXT');
nextLabel.position.set(NEXT_AT.x + 0.4, NEXT_AT.y + 2.3, 0);
scene.add(nextLabel);
const nextFrame = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(4.6, 3.8)),
  new THREE.LineBasicMaterial({ color: 0x30363d }),
);
nextFrame.position.copy(NEXT_AT);
scene.add(nextFrame);

// partículas de merge
const debris = [];
const MAX_DEBRIS = 160;
function burstRows(rows) {
  if (REDUCED_MOTION || debris.length > MAX_DEBRIS) return;
  for (const r of rows) {
    for (let c = 0; c < COLS; c++) {
      const kind = state.grid[r][c];
      const m = new THREE.Mesh(blockGeo, mats[kind].body);
      m.scale.setScalar(0.35);
      m.position.set(wx(c), wy(r), 0);
      scene.add(m);
      debris.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 6, 2 + Math.random() * 6), life: 0.9 });
    }
  }
}

function render(time) {
  const flashing = state.clearing && Math.floor(state.clearing.t / 0.05) % 2 === 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = boardBlocks[r * COLS + c];
      const kind = state.grid[r]?.[c];
      b.visible = Boolean(kind);
      if (!kind) continue;
      setBlock(b, kind, flashing && state.clearing.rows.includes(r) ? flash : undefined);
      b.position.set(wx(c), wy(r), 0);
    }
  }

  const p = state.piece;
  const showPiece = p && state.mode !== 'idle';
  if (showPiece) {
    let gy = p.y;
    while (fits(p, p.rot, p.x, gy - 1)) gy--;
    cellsOf(p).forEach(([c, r], i) => { setBlock(pieceBlocks[i], p.kind); pieceBlocks[i].position.set(wx(c), wy(r), 0); });
    cellsOf(p, p.rot, p.x, gy).forEach(([c, r], i) => { setBlock(ghostBlocks[i], p.kind, mats[p.kind].ghost); ghostBlocks[i].position.set(wx(c), wy(r), 0); });
  }
  pieceBlocks.forEach((b) => { b.visible = Boolean(showPiece); });
  ghostBlocks.forEach((b) => { b.visible = Boolean(showPiece); });

  if (state.next) {
    const shape = rotations[state.next][0];
    const n = shape.length;
    cellsOf({ kind: state.next, rot: 0, x: 0, y: 0 }).forEach(([c, r], i) => {
      setBlock(nextBlocks[i], state.next);
      nextBlocks[i].position.set(NEXT_AT.x + (c - (n - 1) / 2) * 0.82, NEXT_AT.y + (r + (n - 1) / 2) * 0.82 - (n === 4 ? 0.4 : 0), 0);
      nextBlocks[i].rotation.y = time * 0.0008;
      nextBlocks[i].visible = state.mode !== 'idle';
    });
  }

  // tela inicial: blocos caindo como demo
  if (state.mode === 'idle') demo(time);

  const sway = REDUCED_MOTION ? 0 : 1;
  camera.position.x = FOCUS.x + Math.sin(time * 0.00035) * 1.6 * sway;
  camera.position.y = FOCUS.y + 2.2 + Math.cos(time * 0.00027) * 0.8 * sway;
  camera.lookAt(FOCUS);

  ui.score.textContent = fmt(state.score);
  ui.lines.textContent = fmt(state.lines);
  ui.level.textContent = fmt(state.level);
  ui.best.textContent = fmt(state.best);
  renderer.render(scene, camera);
}

// demo da tela inicial: uma pilha estática bonita
let demoReady = false;
function demo() {
  if (demoReady) return;
  demoReady = true;
  state.grid = emptyGrid();
  const rows = ['IIIIZZ.LLL', 'JJTOOZZ.LS', 'J.TTOOSSLS', 'JJJTIIIIS.'];
  rows.reverse().forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.') state.grid[r][c] = ch; }));
}

function fit() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const needH = VISIBLE_ROWS + 5;  // poço + folga para o HUD
  const needW = COLS + 10;         // poço + painel NEXT
  const dist = Math.max(needH / 2 / Math.tan(half), needW / 2 / (Math.tan(half) * camera.aspect));
  camera.position.set(FOCUS.x, FOCUS.y + 2.2, dist);
  camera.updateProjectionMatrix();
}
addEventListener('resize', fit);
fit();

// ── controles ─────────────────────────────────────────────────────────────
addEventListener('keydown', (e) => {
  const k = e.code;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(k)) e.preventDefault();
  if (state.mode !== 'playing') {
    if ((k === 'Space' || k === 'Enter') && (!ui.start.hidden || !ui.over.hidden)) start();
    else if ((k === 'KeyP' || k === 'Escape') && state.mode === 'paused') togglePause(false);
    return;
  }
  if (k === 'ArrowLeft' || k === 'KeyA') move(-1);
  else if (k === 'ArrowRight' || k === 'KeyD') move(1);
  else if (k === 'ArrowUp' || k === 'KeyX' || k === 'KeyW') rotate(1);
  else if (k === 'KeyZ') rotate(-1);
  else if (k === 'ArrowDown' || k === 'KeyS') state.softDrop = true;
  else if (k === 'Space') { if (!e.repeat) hardDrop(); }
  else if (k === 'KeyP' || k === 'Escape') togglePause(true);
});
addEventListener('keyup', (e) => { if (e.code === 'ArrowDown' || e.code === 'KeyS') state.softDrop = false; });

let drag = null;
const CELL_PX = 28;
renderer.domElement.addEventListener('pointerdown', (e) => {
  drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, t: performance.now(), moved: false };
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!drag || state.mode !== 'playing') return;
  while (e.clientX - drag.x > CELL_PX) { move(1); drag.x += CELL_PX; drag.moved = true; }
  while (drag.x - e.clientX > CELL_PX) { move(-1); drag.x -= CELL_PX; drag.moved = true; }
  state.softDrop = e.clientY - drag.y0 > 60 && Math.abs(e.clientX - drag.x0) < 40;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const dy = e.clientY - drag.y0, dt = performance.now() - drag.t;
  state.softDrop = false;
  if (state.mode === 'paused') togglePause(false);
  else if (dy > 70 && dt < 260) hardDrop();
  else if (!drag.moved && Math.abs(dy) < 15 && dt < 300) rotate(1);
  drag = null;
});

ui.play.addEventListener('click', start);
ui.again.addEventListener('click', start);
ui.paused.addEventListener('click', () => togglePause(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

// ?debug expõe as regras para testar sem depender do frame rate
if (new URLSearchParams(location.search).has('debug')) {
  window.__stack = { state, step, start, move, rotate, hardDrop, cellsOf, fits, COLS, ROWS };
}

// ── loop ──────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
renderer.setAnimationLoop((time) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  step(dt);
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.v.y -= 18 * dt;
    d.m.position.addScaledVector(d.v, dt);
    d.m.rotation.x += dt * 8;
    d.life -= dt;
    d.m.scale.setScalar(Math.max(0.01, 0.35 * d.life / 0.9));
    if (d.life <= 0) { scene.remove(d.m); debris.splice(i, 1); }
  }
  render(time);
});
