// Deploy Rush — runner 3D em Three.js.
// O carro fica parado em z = 0; o mundo vem na direção da câmera (+z) a `state.speed` unidades/s.

import * as THREE from 'three';

const LANES = [-2.2, 0, 2.2];
const SPAWN_Z = -140;
const DESPAWN_Z = 10;
const GRAVITY = -30;
const JUMP_SPEED = 10.5;
const START_SPEED = 22;
const MAX_SPEED = 62;
const ACCEL = 0.55; // unidades/s²
const CAR = { halfX: 0.55, halfZ: 1.05, height: 0.9 };
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLORS = { cyan: 0x00d9ff, violet: 0xbd93f9, red: 0xff3b5c, orange: 0xff9d3c, ink: 0x0a0e14 };

// ── DOM ───────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const ui = {
  score: $('score'), commits: $('commits'), best: $('best'),
  start: $('start'), over: $('over'), play: $('play'), again: $('again'),
  finalScore: $('final-score'), finalCommits: $('final-commits'), finalBest: $('final-best'), verdict: $('verdict'),
};

const storage = {
  get() { try { return Number(localStorage.getItem('deploy-rush:best')) || 0; } catch { return 0; } },
  set(v) { try { localStorage.setItem('deploy-rush:best', String(v)); } catch { /* sem storage: só não guarda */ } },
};

// ── renderer, cena, câmera ────────────────────────────────────────────────
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  document.body.innerHTML = '<p style="padding:24px;font-family:monospace">Seu navegador não tem WebGL disponível.</p>';
  throw new Error('WebGL indisponível');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
scene.fog = new THREE.Fog(0x05070b, 40, 150);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 2.7, 6.4);

scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x10061f, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(4, 10, 6);
scene.add(key);

// ── ambiente ──────────────────────────────────────────────────────────────
function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#070a12';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#00d9ff';
  g.lineWidth = 3;
  g.globalAlpha = 0.55;
  g.strokeRect(0, 0, 256, 256);
  g.globalAlpha = 0.18;
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(12, 120);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const floorTex = gridTexture();
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(36, 360),
  new THREE.MeshStandardMaterial({ map: floorTex, emissive: 0xffffff, emissiveMap: floorTex, emissiveIntensity: 0.55, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.z = -150;
scene.add(floor);

// faixas da pista
const laneMat = new THREE.MeshBasicMaterial({ color: COLORS.violet, transparent: true, opacity: 0.55 });
for (const x of [-3.3, -1.1, 1.1, 3.3]) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 360), laneMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, 0.01, -150);
  scene.add(line);
}

// sol synthwave
function sunTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#ffd166');
  grad.addColorStop(0.5, '#ff5fa2');
  grad.addColorStop(1, '#8f5cff');
  g.fillStyle = grad;
  g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) g.fillRect(0, 300 + i * 24, 512, 4 + i * 1.6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const sun = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshBasicMaterial({ map: sunTexture(), transparent: true, fog: false }));
sun.position.set(0, 20, -230);
scene.add(sun);

const stars = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
    Array.from({ length: 900 }, (_, i) => (i % 3 === 0 ? (Math.random() - 0.5) * 500 : i % 3 === 1 ? 15 + Math.random() * 120 : -150 - Math.random() * 120)), 3)),
  new THREE.PointsMaterial({ color: 0xc9d1d9, size: 0.7, fog: false, transparent: true, opacity: 0.8 }),
);
scene.add(stars);

// prédios dos dois lados, reciclados quando passam da câmera
const towerGeo = new THREE.BoxGeometry(1, 1, 1);
const towerEdges = new THREE.EdgesGeometry(towerGeo);
const towers = [];
for (let i = 0; i < 48; i++) {
  const side = i % 2 ? 1 : -1;
  const h = 4 + Math.random() * 22;
  const group = new THREE.Group();
  const body = new THREE.Mesh(towerGeo, new THREE.MeshStandardMaterial({ color: 0x0b0f1a, roughness: 0.6, metalness: 0.4 }));
  const edges = new THREE.LineSegments(towerEdges, new THREE.LineBasicMaterial({ color: Math.random() > 0.5 ? COLORS.violet : COLORS.cyan, transparent: true, opacity: 0.8 }));
  group.add(body, edges);
  group.scale.set(3 + Math.random() * 4, h, 3 + Math.random() * 4);
  group.position.set(side * (11 + Math.random() * 10), h / 2, -i * 6.5);
  scene.add(group);
  towers.push(group);
}

// ── carro ─────────────────────────────────────────────────────────────────
function buildCar() {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.85, roughness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1a2a, metalness: 0.9, roughness: 0.05, emissive: 0x003344 });
  const neon = new THREE.MeshBasicMaterial({ color: COLORS.cyan });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 2.3), paint);
  body.position.y = 0.42;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.36, 1.1), glass);
  cabin.position.set(0, 0.8, 0.15);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 0.3), paint);
  spoiler.position.set(0, 0.86, 1.05);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.05, 2.32), neon);
  stripe.position.y = 0.3;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: COLORS.red }));
  tail.position.set(0, 0.52, 1.16);
  car.add(body, cabin, spoiler, stripe, tail);

  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.7 });
  car.userData.wheels = [];
  for (const [x, z] of [[-0.62, -0.75], [0.62, -0.75], [-0.62, 0.75], [0.62, 0.75]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.24, z);
    car.add(w);
    car.userData.wheels.push(w);
  }

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3), new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  car.add(glow);
  return car;
}
const car = buildCar();
scene.add(car);

// ── entidades da pista ────────────────────────────────────────────────────
const geo = {
  commit: new THREE.BoxGeometry(0.42, 0.42, 0.42),
  bug: new THREE.OctahedronGeometry(0.55, 0),
  firewall: new THREE.BoxGeometry(1.9, 0.5, 0.35),
  conflict: new THREE.BoxGeometry(4.1, 2.4, 0.5),
};
const mat = {
  commit: new THREE.MeshStandardMaterial({ color: COLORS.cyan, emissive: COLORS.cyan, emissiveIntensity: 1.4 }),
  bug: new THREE.MeshStandardMaterial({ color: COLORS.red, emissive: COLORS.red, emissiveIntensity: 1.1, flatShading: true }),
  firewall: new THREE.MeshStandardMaterial({ color: COLORS.orange, emissive: COLORS.orange, emissiveIntensity: 0.9 }),
  conflict: new THREE.MeshStandardMaterial({ color: 0x2a1036, emissive: COLORS.violet, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }),
};

// dimensões de colisão (meia-largura, altura, meia-profundidade)
const HIT = {
  commit: { halfX: 0.35, height: [0.2, 1.1], halfZ: 0.35 },
  bug: { halfX: 0.45, height: [0.1, 1.0], halfZ: 0.45 },
  firewall: { halfX: 0.95, height: [0, 0.5], halfZ: 0.18 },
  conflict: { halfX: 2.05, height: [0, 2.4], halfZ: 0.25 },
};

const entities = [];

function spawn(kind, x, z, y) {
  const mesh = new THREE.Mesh(geo[kind], mat[kind]);
  const baseY = y ?? { commit: 0.65, bug: 0.6, firewall: 0.25, conflict: 1.2 }[kind];
  mesh.position.set(x, baseY, z);
  if (kind === 'conflict') {
    const label = new THREE.LineSegments(new THREE.EdgesGeometry(geo.conflict), new THREE.LineBasicMaterial({ color: COLORS.violet }));
    mesh.add(label);
  }
  scene.add(mesh);
  entities.push({ kind, mesh, baseY, alive: true });
}

// Cada padrão garante ao menos uma faixa livre ou pulável.
const PATTERNS = [
  (z) => { const l = pick([0, 1, 2]); spawn('bug', LANES[l], z); trail(pick(others(l)), z, 4); },
  (z) => { const l = pick([0, 1, 2]); spawn('firewall', LANES[l], z); trail(l, z - 1, 3, true); },
  (z) => { const free = pick([0, 2]); spawn('conflict', free === 0 ? 1.1 : -1.1, z); trail(free, z + 4, 5); },
  (z) => { const free = pick([0, 1, 2]); others(free).forEach((l) => spawn('bug', LANES[l], z)); trail(free, z, 3); },
  (z) => { [0, 1, 2].forEach((l) => spawn('firewall', LANES[l], z)); trail(pick([0, 1, 2]), z - 0.5, 3, true); },
  (z) => { trail(pick([0, 1, 2]), z, 6); },
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const others = (l) => [0, 1, 2].filter((x) => x !== l);
function trail(lane, z, n, arc = false) {
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    spawn('commit', LANES[lane], z + 3 - i * 2.2, arc ? 0.7 + Math.sin(t * Math.PI) * 1.4 : undefined);
  }
}

// partículas da batida
const debris = [];
function burst(origin) {
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(geo.commit, i % 2 ? mat.bug : mat.commit);
    m.scale.setScalar(0.25 + Math.random() * 0.35);
    m.position.copy(origin);
    scene.add(m);
    debris.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 10, 3 + Math.random() * 8, (Math.random() - 0.5) * 10), life: 1.4 });
  }
}

// ── estado ────────────────────────────────────────────────────────────────
const state = {
  mode: 'idle', // idle | playing | over
  speed: START_SPEED, distance: 0, commits: 0, nextSpawn: 30,
  lane: 1, x: LANES[1], y: 0, vy: 0, shake: 0,
  best: storage.get(),
};
ui.best.textContent = state.best.toLocaleString('pt-BR');

const score = () => Math.floor(state.distance) + state.commits * 25;

function reset() {
  for (const e of entities) scene.remove(e.mesh);
  entities.length = 0;
  Object.assign(state, { speed: START_SPEED, distance: 0, commits: 0, nextSpawn: 30, lane: 1, x: LANES[1], y: 0, vy: 0, shake: 0 });
  car.visible = true;
  car.position.set(state.x, 0, 0);
  for (let z = -30; z > SPAWN_Z; z -= 22) PATTERNS[PATTERNS.length - 1](z);
}

function start() {
  reset();
  state.mode = 'playing';
  ui.start.hidden = ui.over.hidden = true;
}

function gameOver() {
  state.mode = 'over';
  state.shake = REDUCED_MOTION ? 0 : 0.6;
  car.visible = false;
  burst(car.position.clone().setY(0.6));
  const s = score();
  if (s > state.best) { state.best = s; storage.set(s); }
  ui.best.textContent = state.best.toLocaleString('pt-BR');
  ui.finalScore.textContent = s.toLocaleString('pt-BR');
  ui.finalCommits.textContent = state.commits.toLocaleString('pt-BR');
  ui.finalBest.textContent = state.best.toLocaleString('pt-BR');
  ui.verdict.textContent = s >= state.best && s > 0 ? 'Novo recorde. Esse deploy foi longe.'
    : s > 2500 ? 'Quase em produção. Mais uma?'
    : 'Bug em produção. Acontece com todo mundo.';
  setTimeout(() => { ui.over.hidden = false; ui.again.focus(); }, 650);
}

// ── controles ─────────────────────────────────────────────────────────────
const move = (dir) => { if (state.mode === 'playing') state.lane = Math.max(0, Math.min(2, state.lane + dir)); };
const jump = () => { if (state.mode === 'playing' && state.y <= 0.001) state.vy = JUMP_SPEED; };

addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'KeyA'].includes(e.code)) move(-1);
  else if (['ArrowRight', 'KeyD'].includes(e.code)) move(1);
  else if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
    e.preventDefault();
    if (state.mode === 'playing') jump();
    else if (!ui.start.hidden || !ui.over.hidden) start();
  }
});

let touch = null;
renderer.domElement.addEventListener('pointerdown', (e) => { touch = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx));
  else if (dy < -30 || performance.now() - touch.t < 250) jump();
  touch = null;
});

ui.play.addEventListener('click', start);
ui.again.addEventListener('click', start);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 75 : 62; // retrato: abre o campo de visão para caber as 3 faixas
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
dispatchEvent(new Event('resize'));

// ── loop ──────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let paused = false;
document.addEventListener('visibilitychange', () => { paused = document.hidden; clock.getDelta(); });

function collide(e) {
  const h = HIT[e.kind];
  const p = e.mesh.position;
  const top = e.kind === 'commit' ? p.y + 0.45 : h.height[1];
  const bottom = e.kind === 'commit' ? p.y - 0.45 : h.height[0];
  return Math.abs(p.x - state.x) < h.halfX + CAR.halfX
    && Math.abs(p.z) < h.halfZ + CAR.halfZ
    && state.y < top && state.y + CAR.height > bottom;
}

function update(dt) {
  const playing = state.mode === 'playing';
  const speed = playing ? state.speed : state.mode === 'idle' ? 14 : 0;
  const step = speed * dt;

  if (playing) {
    state.speed = Math.min(MAX_SPEED, state.speed + ACCEL * dt);
    state.distance += step;
    state.nextSpawn -= step;
    if (state.nextSpawn <= 0) {
      pick(PATTERNS)(SPAWN_Z);
      // espaçamento em TEMPO, não em distância: sempre maior que o tempo de um pulo (~0,7 s),
      // senão dois obstáculos seguidos ficam impossíveis em velocidade alta
      state.nextSpawn = state.speed * Math.max(0.85, 1.35 - (state.speed - START_SPEED) / 80);
    }
  }

  // mundo
  floorTex.offset.y += step / 3;
  for (const t of towers) {
    t.position.z += step * 0.98;
    if (t.position.z > DESPAWN_Z + 8) t.position.z -= 48 * 6.5;
  }
  for (const e of entities) {
    e.mesh.position.z += step;
    if (e.kind === 'commit') { e.mesh.rotation.y += dt * 3; e.mesh.position.y = e.baseY + Math.sin(performance.now() / 260 + e.mesh.position.z) * 0.08; }
    if (e.kind === 'bug') { e.mesh.rotation.y += dt * 2.4; e.mesh.rotation.x += dt * 1.2; }
    if (playing && e.alive && collide(e)) {
      if (e.kind === 'commit') { e.alive = false; e.mesh.visible = false; state.commits++; }
      else { gameOver(); break; }
    }
  }
  for (let i = entities.length - 1; i >= 0; i--) {
    if (entities[i].mesh.position.z > DESPAWN_Z || !entities[i].alive) {
      scene.remove(entities[i].mesh);
      entities.splice(i, 1);
    }
  }

  // carro
  if (state.mode !== 'over') {
    const targetX = state.mode === 'idle' ? Math.sin(performance.now() / 900) * 2 : LANES[state.lane];
    const prevX = state.x;
    state.x += (targetX - state.x) * Math.min(1, dt * 12);
    state.vy += GRAVITY * dt;
    state.y = Math.max(0, state.y + state.vy * dt);
    if (state.y === 0) state.vy = 0;
    car.position.set(state.x, state.y, 0);
    car.rotation.z = (prevX - state.x) * 0.9;
    car.rotation.x = state.y > 0 ? -0.08 : 0;
    for (const w of car.userData.wheels) w.rotation.x -= step * 2.4;
  }

  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.v.y += GRAVITY * 0.5 * dt;
    d.m.position.addScaledVector(d.v, dt);
    d.m.rotation.x += dt * 6;
    d.life -= dt;
    if (d.life <= 0) { scene.remove(d.m); debris.splice(i, 1); }
  }

  // câmera
  state.shake = Math.max(0, state.shake - dt);
  const s = state.shake * 0.5;
  camera.position.x += (state.x * 0.55 - camera.position.x) * Math.min(1, dt * 6) + (Math.random() - 0.5) * s;
  camera.position.y = 2.7 + state.y * 0.35 + (Math.random() - 0.5) * s;
  camera.lookAt(state.x * 0.3, 0.7, -8);

  ui.score.textContent = score().toLocaleString('pt-BR');
  ui.commits.textContent = state.commits.toLocaleString('pt-BR');
}

// ?debug expõe o estado para testar a simulação sem depender do frame rate
if (new URLSearchParams(location.search).has('debug')) window.__rush = { state, entities, update, start, move, jump };

reset();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (paused) return;
  update(dt);
  renderer.render(scene, camera);
});
