#!/usr/bin/env node
// Gera os insights do perfil a partir da API GraphQL do GitHub, INCLUINDO repositórios privados:
//   assets/stats.svg    números gerais
//   assets/evolution.svg  como a stack mudou ano a ano
//   assets/rhythm.svg   dia da semana × hora dos meus commits
// Só números agregados saem nos SVGs — nenhum nome de repositório privado é publicado.
//
// Local:   GH_TOKEN=$(gh auth token) node scripts/build-insights.mjs
// Actions: secret METRICS_TOKEN (token com leitura de conteúdo de todos os seus repositórios)

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('Defina GH_TOKEN (ex.: GH_TOKEN=$(gh auth token) node scripts/build-insights.mjs)');
  process.exit(1);
}

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const TZ = 'America/Sao_Paulo';

// Repositórios cujos commits são automáticos (o bot de ticket commita cada transcript em nome
// do dono do token): ficam fora de toda métrica de commit.
const EXCLUDED_COMMIT_REPOS = new Set(['ticket_trnascript']);
// Arquivos .c/.cpp dos mods de DayZ são Enforce Script, não C de verdade.
const DAYZ = /^(YSH_|Yoshi_|DM_|adminLoadout|TLZ)/;
const BOT = /bot/i;
// Marcação, templates e build: não contam como "linguagem de programação".
const IGNORE = new Set(['HTML', 'CSS', 'SCSS', 'Less', 'TeX', 'Blade', 'Hack', 'Batchfile',
  'Makefile', 'Dockerfile', 'Gherkin', 'Procfile', 'Shell', 'Lua']);
// Paleta categórica validada para o fundo escuro (dataviz: CVD e contraste ≥ 3:1), em ordem fixa.
// A cor segue a linguagem pelo ranking global, nunca pela posição dentro de um ano.
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
const OTHER = '#484f58';

const MONO = "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace";
const SANS = "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => n.toLocaleString('pt-BR');
const pct = (x) => `${Math.round(x * 100)}%`;
const today = new Date().toISOString().slice(0, 10);

async function gql(query, variables = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && !json.errors) return json.data;
    if (attempt >= 3) throw new Error(`GraphQL ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function fetchRepos() {
  const repos = [];
  let after = null;
  do {
    const { viewer } = await gql(`query($after: String) {
      viewer { repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false) {
        pageInfo { hasNextPage endCursor }
        nodes { name isPrivate createdAt defaultBranchRef { name }
                languages(first: 20) { edges { size node { name } } } }
      } } }`, { after });
    repos.push(...viewer.repositories.nodes);
    after = viewer.repositories.pageInfo.hasNextPage ? viewer.repositories.pageInfo.endCursor : null;
  } while (after);
  return repos;
}

// Commits de minha autoria na branch padrão de cada repositório.
async function fetchCommits(repos, authorId) {
  const commits = [];
  const queue = repos.filter((r) => r.defaultBranchRef && !EXCLUDED_COMMIT_REPOS.has(r.name));
  const worker = async () => {
    for (let repo; (repo = queue.shift()); ) {
      let after = null;
      do {
        const { viewer } = await gql(`query($name: String!, $after: String, $author: ID!) {
          viewer { repository(name: $name) { defaultBranchRef { target { ... on Commit {
            history(first: 100, after: $after, author: { id: $author }) {
              pageInfo { hasNextPage endCursor } nodes { authoredDate messageHeadline } } } } } } } }`,
          { name: repo.name, after, author: authorId });
        const history = viewer.repository.defaultBranchRef.target.history;
        for (const n of history.nodes) commits.push({ repo: repo.name, date: new Date(n.authoredDate), msg: n.messageHeadline });
        after = history.pageInfo.hasNextPage ? history.pageInfo.endCursor : null;
      } while (after);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return commits;
}

// ── análise ──────────────────────────────────────────────────────────────

function languageOf(repo, name) {
  if (DAYZ.test(repo.name) && (name === 'C' || name === 'C++')) return 'Enforce Script';
  return IGNORE.has(name) ? null : name;
}

function stackByYear(repos) {
  const years = new Map();
  const global = new Map();
  for (const repo of repos) {
    const year = Number(repo.createdAt.slice(0, 4));
    if (!years.has(year)) years.set(year, { repos: 0, bytes: new Map() });
    const y = years.get(year);
    y.repos++;
    for (const { size, node } of repo.languages.edges) {
      const lang = languageOf(repo, node.name);
      if (!lang) continue;
      y.bytes.set(lang, (y.bytes.get(lang) ?? 0) + size);
      global.set(lang, (global.get(lang) ?? 0) + size);
    }
  }
  const ranked = [...global.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  const named = ranked.slice(0, SERIES.length);
  const color = (lang) => SERIES[named.indexOf(lang)] ?? OTHER;

  const toShares = (bytes) => {
    const total = [...bytes.values()].reduce((a, b) => a + b, 0) || 1;
    const shares = named.map((l) => ({ lang: l, share: (bytes.get(l) ?? 0) / total }));
    const rest = [...bytes.entries()].filter(([l]) => !named.includes(l)).reduce((a, [, b]) => a + b, 0) / total;
    return [...shares, { lang: 'outros', share: rest }].filter((s) => s.share > 0.004);
  };

  const rows = [...years.entries()].sort((a, b) => a[0] - b[0])
    .map(([year, y]) => ({ label: String(year), repos: y.repos, shares: toShares(y.bytes) }));
  rows.push({ label: 'total', repos: repos.length, shares: toShares(global) });
  return { rows, legend: [...named, 'outros'], color };
}

function rhythm(commits) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });
  const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const days = new Map();
  for (const { date } of commits) {
    const p = Object.fromEntries(parts.formatToParts(date).map((x) => [x.type, x.value]));
    grid[WD[p.weekday]][Number(p.hour)]++;
    const day = `${p.year}-${p.month}-${p.day}`;
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  const byHour = grid[0].map((_, h) => grid.reduce((a, row) => a + row[h], 0));
  const byDay = grid.map((row) => row.reduce((a, b) => a + b, 0));
  const total = byDay.reduce((a, b) => a + b, 0);
  const [busiestDay, busiestCount] = [...days.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return {
    grid, total, activeDays: days.size,
    repos: new Set(commits.map((c) => c.repo)).size,
    firstYear: [...days.keys()].sort()[0]?.slice(0, 4) ?? '',
    peakHour: byHour.indexOf(Math.max(...byHour)),
    peakDay: byDay.indexOf(Math.max(...byDay)),
    weekend: total ? (byDay[5] + byDay[6]) / total : 0,
    busiestDay, busiestCount,
  };
}

// ── render ───────────────────────────────────────────────────────────────

const frame = (W, H, label, body, extraStyle = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
  <style>
    .title { font: 600 17px ${SANS}; fill: #e6edf3; letter-spacing: .3px; }
    .sub { font: 400 12.5px ${MONO}; fill: #6e7681; }
    .label { font: 600 11.5px ${MONO}; letter-spacing: 1.6px; fill: #00d9ff; }
    .value { font: 700 44px ${SANS}; letter-spacing: -1px; fill: #f0f6fc; }
    .note { font: 400 12.5px ${MONO}; fill: #8b949e; }
    .axis { font: 400 12px ${MONO}; fill: #8b949e; }
    .ink { font: 700 12.5px ${MONO}; fill: #0a0e14; }
    .legend { font: 400 13px ${MONO}; fill: #c9d1d9; }
    .foot { font: 400 11.5px ${MONO}; fill: #484f58; }
    .lead { font: 600 13.5px ${MONO}; fill: #c9d1d9; }${extraStyle}
  </style>
  <rect width="${W}" height="${H}" rx="14" fill="#0a0e14"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="#1f2630"/>
${body}
</svg>
`;

const header = (W, title, right, rightClass = 'foot') => `  <circle cx="48" cy="44" r="4" fill="#3fb950"><animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/></circle>
  <text x="62" y="49" class="title">${esc(title)}</text>
  <text x="${W - 40}" y="49" text-anchor="end" class="${rightClass}">${esc(right)}</text>`;

function renderStats({ repos, human }) {
  const W = 1200, H = 240;
  const priv = repos.filter((r) => r.isPrivate).length;
  const tiles = [
    { value: fmt(repos.length), label: 'REPOSITÓRIOS', note: `${fmt(priv)} privados · ${fmt(repos.length - priv)} públicos` },
    { value: fmt(human.total), label: 'COMMITS MEUS', note: `em ${fmt(human.repos)} repositórios` },
    { value: fmt(human.activeDays), label: 'DIAS COM COMMIT', note: `desde ${human.firstYear}` },
    { value: `${repos.filter((r) => BOT.test(r.name)).length}·${repos.filter((r) => DAYZ.test(r.name)).length}`,
      label: 'BOTS · MODS DAYZ', note: 'discord.js · Enforce Script' },
  ];
  const body = tiles.map((t, i) => {
    const x = 40 + i * 290;
    return `  <g>
    <rect x="${x}" y="78" width="270" height="124" rx="10" fill="#0f141b" stroke="#1f2630"/>
    <text x="${x + 22}" y="110" class="label">${esc(t.label)}</text>
    <text x="${x + 20}" y="160" class="value">${esc(t.value)}</text>
    <text x="${x + 22}" y="186" class="note">${esc(t.note)}</text>
  </g>`;
  }).join('\n');
  return frame(W, H, `${repos.length} repositórios, ${human.total} commits meus em ${human.activeDays} dias`,
    `${header(W, 'Números reais, incluindo o que é privado', `gh api graphql · ${today}`)}
${body}
  <text x="40" y="${H - 16}" class="foot">commits de autoria própria na branch padrão de cada repositório · sem commits automáticos de bot</text>`);
}

function renderStack({ rows, legend, color }) {
  const W = 1200, rowH = 44, top = 128, barX = 120, barW = 900, H = top + rows.length * rowH + 52;
  const first = rows[0], last = rows[rows.length - 2] ?? rows[0];
  const lead = (r) => [...r.shares].sort((a, b) => b.share - a.share)[0];
  const headline = `${first.label}: ${pct(lead(first).share)} ${lead(first).lang}  →  ${last.label}: ${pct(lead(last).share)} ${lead(last).lang}`;

  let lx = 40;
  const legendSvg = legend.map((l) => {
    const item = `<rect x="${lx}" y="86" width="12" height="12" rx="3" fill="${color(l)}"/><text x="${lx + 18}" y="97" class="legend">${esc(l)}</text>`;
    lx += 34 + l.length * 7.9;
    return item;
  }).join('\n  ');

  const bars = rows.map((r, i) => {
    const y = top + i * rowH;
    const isTotal = r.label === 'total';
    let x = barX;
    const segs = r.shares.map((s, j) => {
      const w = s.share * barW;
      const gap = j < r.shares.length - 1 ? 2 : 0; // 2px de superfície entre segmentos
      const seg = `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(w - gap, 0.5).toFixed(1)}" height="24" fill="${color(s.lang)}"/>`;
      const label = w > 118 ? `<text x="${(x + 10).toFixed(1)}" y="${y + 16.5}" class="ink">${esc(s.lang)} ${pct(s.share)}</text>`
        : w > 46 ? `<text x="${(x + 8).toFixed(1)}" y="${y + 16.5}" class="ink">${pct(s.share)}</text>` : '';
      x += w;
      return seg + label;
    }).join('');
    return `  <g>
    ${isTotal ? `<line x1="40" y1="${y - 10}" x2="${W - 40}" y2="${y - 10}" stroke="#1f2630"/>` : ''}
    <text x="40" y="${y + 17}" class="${isTotal ? 'label' : 'axis'}">${esc(r.label)}</text>
    <clipPath id="row${i}"><rect x="${barX}" y="${y}" width="${barW}" height="24" rx="4"/></clipPath>
    <g clip-path="url(#row${i})">${segs}</g>
    <text x="${W - 40}" y="${y + 17}" text-anchor="end" class="axis">${fmt(r.repos)} repos</text>
  </g>`;
  }).join('\n');

  return frame(W, H, `Como minha stack mudou: ${headline}`,
    `${header(W, 'Como minha stack mudou', headline, 'lead')}
  ${legendSvg}
${bars}
  <text x="40" y="${H - 18}" class="foot">linguagens por bytes nos repositórios criados em cada ano (inclui privados, sem HTML/CSS/templates) · .c dos mods DayZ = Enforce Script</text>`);
}

function renderRhythm(h) {
  const W = 1200, cell = 30, gx = 112, gy = 112, H = gy + 7 * cell + 92;
  const DAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const DAYS_LONG = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  const max = Math.max(1, ...h.grid.flat());
  const dots = h.grid.map((row, d) => row.map((n, hr) => {
    const cx = gx + hr * cell + cell / 2, cy = gy + d * cell + cell / 2;
    if (!n) return `<circle cx="${cx}" cy="${cy}" r="2" fill="#1f2630"/>`;
    const r = 3 + Math.sqrt(n / max) * 10; // área ∝ commits
    return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="#00d9ff" fill-opacity="${(0.35 + 0.65 * n / max).toFixed(2)}"><title>${DAYS_LONG[d]} ${hr}h: ${n} commits</title></circle>`;
  }).join('')).join('\n  ');
  const dayLabels = DAYS.map((d, i) => `<text x="${gx - 16}" y="${gy + i * cell + 19}" text-anchor="end" class="axis">${d}</text>`).join('');
  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21].map((hr) => `<text x="${gx + hr * cell + cell / 2}" y="${gy + 7 * cell + 24}" text-anchor="middle" class="axis">${hr}h</text>`).join('');

  const [y, m, d] = h.busiestDay.split('-');
  const facts = [
    ['HORÁRIO DE PICO', `${h.peakHour}h`],
    ['DIA MAIS ATIVO', DAYS_LONG[h.peakDay]],
    ['FIM DE SEMANA', pct(h.weekend)],
    ['DIA MAIS INTENSO', `${h.busiestCount} commits`, `${d}/${m}/${y}`],
  ];
  const fx = gx + 24 * cell + 56;
  const factsSvg = facts.map(([label, value, note], i) => `<g>
    <text x="${fx}" y="${gy + 8 + i * 54}" class="label">${esc(label)}</text>
    <text x="${fx}" y="${gy + 34 + i * 54}" class="legend" style="font-size:20px;font-weight:600;fill:#f0f6fc">${esc(value)}${note ? `<tspan class="note" dx="10">${esc(note)}</tspan>` : ''}</text>
  </g>`).join('\n  ');

  return frame(W, H, `Quando eu programo: pico às ${h.peakHour}h, dia mais ativo ${DAYS_LONG[h.peakDay]}`,
    `${header(W, 'Quando eu programo', `${fmt(h.total)} commits · horário de São Paulo`)}
  ${dayLabels}
  ${hourLabels}
  ${dots}
  ${factsSvg}
  <text x="40" y="${H - 18}" class="foot">cada ponto é uma hora da semana; o tamanho é a quantidade de commits meus nela · sem commits automáticos de bot</text>`);
}

// ── main ─────────────────────────────────────────────────────────────────

const { viewer } = await gql('{ viewer { id } }');
const repos = await fetchRepos();
const commits = await fetchCommits(repos, viewer.id);

const humanCommits = commits.filter((c) => !EXCLUDED_COMMIT_REPOS.has(c.repo));
const human = rhythm(humanCommits);
mkdirSync(ASSETS, { recursive: true });
writeFileSync(join(ASSETS, 'stats.svg'), renderStats({ repos, human }));
writeFileSync(join(ASSETS, 'evolution.svg'), renderStack(stackByYear(repos)));
writeFileSync(join(ASSETS, 'rhythm.svg'), renderRhythm(human));
console.log(`insights: ${repos.length} repos · ${human.total} commits meus em ${human.activeDays} dias, ${human.repos} repositórios`);
