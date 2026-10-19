#!/usr/bin/env node
// Gera assets/stack.svg: minha stack por área, em ordem de importância. Conteúdo estático:
// edite STACK e rode
//   node scripts/build-stack.mjs
// Ícones: skill-icons (MIT, github.com/tandpfun/skill-icons), guardados em scripts/icons/.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'assets', 'stack.svg');
const ICONS = join(HERE, 'icons');

// icon = id do skill-icons; sem ícone, o card desenha a sigla
const STACK = [
  { title: 'LINGUAGENS', items: [
    { name: 'TypeScript', icon: 'ts' },
    { name: 'JavaScript', icon: 'js' },
    { name: 'PHP', icon: 'php' },
    { name: 'Python', icon: 'py' },
    { name: 'Enforce Script', badge: 'ES', color: '#e0704a' },
    { name: 'Java', icon: 'java' },
    { name: 'C', icon: 'c' },
    { name: 'C++', icon: 'cpp' },
    { name: 'Ruby', icon: 'ruby' },
    { name: 'Dart · Kotlin', icon: 'dart' },
  ] },
  { title: 'FRONTEND · 3D', items: [
    { name: 'React', icon: 'react' },
    { name: 'Next.js', icon: 'nextjs' },
    { name: 'Vite', icon: 'vite' },
    { name: 'Tailwind', icon: 'tailwind' },
    { name: 'Three.js', icon: 'threejs' },
    { name: 'HTML', icon: 'html' },
    { name: 'CSS', icon: 'css' },
    { name: 'Sass', icon: 'sass' },
    { name: 'Bootstrap', icon: 'bootstrap' },
    { name: 'Flutter', icon: 'flutter' },
    { name: 'Figma', icon: 'figma' },
  ] },
  { title: 'BACKEND · DADOS', items: [
    { name: 'Node.js', icon: 'nodejs' },
    { name: 'NestJS', icon: 'nestjs' },
    { name: 'Express', icon: 'express' },
    { name: 'Laravel', icon: 'laravel' },
    { name: 'Prisma', icon: 'prisma' },
    { name: 'PostgreSQL', icon: 'postgres' },
    { name: 'MySQL', icon: 'mysql' },
    { name: 'MongoDB', icon: 'mongodb' },
    { name: 'Redis', icon: 'redis' },
    { name: 'Supabase', icon: 'supabase' },
    { name: 'Firebase', icon: 'firebase' },
  ] },
  { title: 'INFRA · FERRAMENTAS', items: [
    { name: 'Git · GitHub', icon: 'git' },
    { name: 'GitHub Actions', icon: 'githubactions' },
    { name: 'Docker', icon: 'docker' },
    { name: 'AWS', icon: 'aws' },
    { name: 'Azure', icon: 'azure' },
    { name: 'Vercel', icon: 'vercel' },
    { name: 'Linux', icon: 'linux' },
    { name: 'Bash', icon: 'bash' },
    { name: 'PowerShell', icon: 'powershell' },
    { name: 'VS Code', icon: 'vscode' },
    { name: 'discord.js', icon: 'discordjs' },
    { name: 'Playwright', badge: 'PW', color: '#2ead33' },
  ] },
];

// ── ícones ───────────────────────────────────────────────────────────────
async function icon(id, uid) {
  mkdirSync(ICONS, { recursive: true });
  const file = join(ICONS, `${id}.svg`);
  if (!existsSync(file)) {
    const res = await fetch(`https://skillicons.dev/icons?i=${id}&theme=dark`);
    if (!res.ok) throw new Error(`ícone ${id}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  const raw = readFileSync(file, 'utf8');
  // o arquivo é <svg 48×48><g><svg 256×256>…</svg></g></svg>: fica só o conteúdo do svg interno
  const inner = raw.match(/<g[^>]*>\s*<svg[^>]*>([\s\S]*)<\/svg>\s*<\/g>/)?.[1];
  if (!inner) throw new Error(`ícone ${id}: formato inesperado`);
  // ids precisam ser únicos no SVG final (gradientes de ícones diferentes colidem)
  return inner.replace(/id="([^"]+)"/g, `id="${uid}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${uid}-$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${uid}-$1"`);
}

// ── render ───────────────────────────────────────────────────────────────
const MONO = "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace";
const SANS = "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function render(groups) {
  const W = 1200, colW = 270, gap = 20, x0 = 40, top = 82, rowH = 38, head = 50;
  const maxRows = Math.max(...groups.map((g) => g.items.length));
  const panelH = head + maxRows * rowH + 10;
  const H = top + panelH + 30;
  let uid = 0;

  const cols = [];
  for (const [gi, g] of groups.entries()) {
    const x = x0 + gi * (colW + gap);
    const rows = [];
    for (const [ii, it] of g.items.entries()) {
      const y = top + head + ii * rowH;
      const art = it.icon
        ? `<svg x="${x + 16}" y="${y}" width="26" height="26" viewBox="0 0 256 256">${await icon(it.icon, `i${uid++}`)}</svg>`
        : `<rect x="${x + 16}" y="${y}" width="26" height="26" rx="6" fill="${it.color}"/><text x="${x + 29}" y="${y + 17.5}" text-anchor="middle" class="badge">${esc(it.badge)}</text>`;
      rows.push(`${art}<text x="${x + 54}" y="${y + 18}" class="name">${esc(it.name)}</text>`);
    }
    cols.push(`  <rect x="${x}" y="${top}" width="${colW}" height="${panelH}" rx="10" fill="#0f141b" stroke="#1f2630"/>
  <text x="${x + 16}" y="${top + 30}" class="label">${esc(g.title)}</text>
  <line x1="${x + 16}" y1="${top + 40}" x2="${x + colW - 16}" y2="${top + 40}" stroke="#1f2630"/>
  ${rows.join('\n  ')}`);
  }

  const total = groups.reduce((a, g) => a + g.items.length, 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stack: ${esc(groups.flatMap((g) => g.items.map((i) => i.name)).join(', '))}">
  <style>
    .title { font: 600 17px ${SANS}; fill: #e6edf3; letter-spacing: .3px; }
    .label { font: 600 11.5px ${MONO}; letter-spacing: 1.6px; fill: #00d9ff; }
    .name { font: 600 14.5px ${SANS}; fill: #e6edf3; }
    .badge { font: 800 11px ${MONO}; fill: #0a0e14; }
    .foot { font: 400 11.5px ${MONO}; fill: #484f58; }
  </style>
  <rect width="${W}" height="${H}" rx="14" fill="#0a0e14"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="#1f2630"/>
  <circle cx="48" cy="44" r="4" fill="#3fb950"><animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/></circle>
  <text x="62" y="49" class="title">Minha stack</text>
  <text x="${W - 40}" y="49" text-anchor="end" class="foot">${total} tecnologias · em ordem de uso em cada área</text>
${cols.join('\n')}
</svg>
`;
}

writeFileSync(OUT, await render(STACK));
console.log(`stack.svg: ${STACK.reduce((a, g) => a + g.items.length, 0)} tecnologias`);
