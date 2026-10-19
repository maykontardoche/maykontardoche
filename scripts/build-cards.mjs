#!/usr/bin/env node
// Gera os cards de projeto em assets/cards/*.svg. Conteúdo estático: edite PROJECTS e rode
//   node scripts/build-cards.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'cards');

// tagline: 2 linhas de até ~52 caracteres · signals: 3 linhas de até ~54 caracteres
const PROJECTS = [
  {
    slug: 'analiticfinan', accent: '#00d9ff', kicker: 'FINTECH · BACKEND', status: 'PRIVADO',
    title: 'AnaliticFinan',
    tagline: ['Sistema financeiro corporativo e auditável, onde', 'arredondar errado vira problema contábil.'],
    signals: ['Dinheiro nunca é number: Decimal ponta a ponta', 'Rateio que fecha no centavo; null não é zero', 'Calendário fiscal: dias úteis, competência, fuso SP'],
    chips: ['NestJS 11', 'PostgreSQL 17', 'Redis', 'Prisma', 'Docker'],
  },
  {
    slug: 'divideai', accent: '#3fb950', kicker: 'PRODUTO · FULL-STACK', status: 'EM CONSTRUÇÃO',
    title: 'DivideAí V2',
    tagline: ['Sistema operacional da casa e da vida financeira', 'compartilhada: dinheiro entre pessoas, num só lugar.'],
    signals: ['Monorepo NestJS 12 + Prisma 7 + React 19 (PWA)', 'Contrato OpenAPI gerado e conferido no CI', 'Gates: typecheck, e2e Playwright, audit com prazo'],
    chips: ['TypeScript', 'NestJS', 'Prisma', 'React', 'Supabase'],
  },
  {
    slug: 'beatriz-agatha', accent: '#f778ba', kicker: 'SAAS · CLIENTE REAL', status: 'PRIVADO',
    title: 'Beatriz Agatha Beauty',
    tagline: ['Site editável, agenda com sinal, cursos e painel', 'de gestão para um estúdio de beleza.'],
    signals: ['Reserva só confirma com sinal pago (Pix/cartão)', 'Horário sobreposto é impossível: EXCLUDE no Postgres', 'LGPD: dados cifrados, acesso auditado, exportação'],
    chips: ['Next.js 16', 'Supabase', 'Mercado Pago', 'Google Agenda'],
  },
  {
    slug: 'ysh-modded', accent: '#f0b429', kicker: 'GAME DEV · ENFORCE SCRIPT', status: 'EM PRODUÇÃO',
    title: 'YSH Modded System',
    tagline: ['Ecossistema de 19 mods para servidores DayZ,', 'com loja e licenciamento próprios.'],
    signals: ['Anti-cheat: detectores, tracking e alerta no Discord', 'KOTH, AirDrop, TradeStore, Stash, SpawnSelect, VIP', 'Plataforma Laravel de vendas e licenças'],
    chips: ['Enforce Script', 'DayZ', 'Laravel', 'Webhooks'],
  },
  {
    slug: 'tuningcar', accent: '#bd93f9', kicker: 'CREATIVE DEV · WEBGL', status: 'PORTFÓLIO',
    title: 'TuningCar',
    tagline: ['Showroom 3D de concessionária premium rodando', 'em tempo real no navegador.'],
    signals: ['Shaders GLSL: piso espelhado, fluido, aberração RGB', 'Scroll coreografado com GSAP, SplitText e Lenis', 'WebGL code-split, fallback estático, reduced-motion'],
    chips: ['Three.js', 'GLSL', 'GSAP', 'TypeScript', 'Vite'],
  },
  {
    slug: 'infinity', accent: '#7b83ff', kicker: 'AUTOMAÇÃO · DISCORD', status: 'EM PRODUÇÃO',
    title: 'Infinity Applications',
    tagline: ['Minha marca de bots: 28 repositórios para', 'comunidades de RP e games.'],
    signals: ['Ticket, whitelist, ponto, facção, moderação, loja', 'OAuth2, API de autenticação e assinaturas', 'Transcripts de ticket e painéis web de apoio'],
    chips: ['discord.js', 'Node.js', 'OAuth2', 'REST'],
  },
  {
    slug: 'customterminal', accent: '#7aa2f7', kicker: 'DEV TOOLING · OPEN SOURCE', status: 'PÚBLICO',
    title: 'CustomTerminal',
    tagline: ['O terminal do Windows do jeito que deveria ser,', 'instalado com um clique.'],
    signals: ['Instalador gráfico que resolve dependências sozinho', 'Faz backup de tudo que altera antes de mexer', '4 modos: GUI, irm | iex, CLI com presets, manual'],
    chips: ['PowerShell 7', 'Windows Terminal', 'Neovim', 'Scoop'],
  },
  {
    slug: 'forja', accent: '#ff7a45', kicker: 'DEV TOOLING · PROCESSO', status: 'PRIVADO',
    title: 'Forja',
    tagline: ['Meu processo de engenharia virou ferramenta:', 'PRD → spec → tasks → review → QA → release.'],
    signals: ['Hooks com testes: barram --no-verify e segredos', 'Review por dimensão: segurança, banco, arquitetura', 'Instalador idempotente: nunca sobrescreve arquivo'],
    chips: ['Node.js', 'Hooks', 'CI', 'Claude Code'],
  },
];

const W = 580, H = 310, PAD = 30;
const MONO = "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace";
const SANS = "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function card(p, index) {
  const num = String(index + 1).padStart(2, '0');
  const pillW = Math.round(p.status.length * 7.4 + 26);

  let cx = PAD;
  const chips = p.chips.map((c) => {
    const w = Math.round(c.length * 7.3 + 22);
    const g = `<rect x="${cx}" y="258" width="${w}" height="26" rx="13" fill="#161b22" stroke="#262c36"/>
  <text x="${cx + w / 2}" y="275.5" text-anchor="middle" class="chip">${esc(c)}</text>`;
    cx += w + 8;
    return g;
  }).join('\n  ');

  const signals = p.signals.map((s, i) => `<g>
    <text x="${PAD}" y="${184 + i * 24}" class="bullet">▸</text>
    <text x="${PAD + 18}" y="${184 + i * 24}" class="signal">${esc(s)}</text>
  </g>`).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.title)}: ${esc(p.tagline.join(' '))}">
  <style>
    .kicker { font: 600 11.5px ${MONO}; letter-spacing: 1.8px; fill: ${p.accent}; }
    .pill { font: 600 10.5px ${MONO}; letter-spacing: 1.2px; fill: ${p.accent}; }
    .title { font: 700 30px ${SANS}; letter-spacing: -.6px; fill: #f0f6fc; }
    .tag { font: 400 15px ${SANS}; fill: #8b949e; }
    .bullet { font: 700 13px ${MONO}; fill: ${p.accent}; }
    .signal { font: 400 13.5px ${MONO}; fill: #c9d1d9; }
    .chip { font: 500 12px ${MONO}; fill: #c9d1d9; }
    .num { font: 800 120px ${SANS}; letter-spacing: -6px; fill: ${p.accent}; opacity: .055; }
  </style>
  <defs>
    <linearGradient id="edge" x1="0" x2="1">
      <stop offset="0" stop-color="${p.accent}"/><stop offset=".55" stop-color="${p.accent}" stop-opacity=".15"/><stop offset="1" stop-color="${p.accent}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" x2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glow" cx="1" cy="0" r="1">
      <stop offset="0" stop-color="${p.accent}" stop-opacity=".13"/><stop offset=".6" stop-color="${p.accent}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="clip"><rect width="${W}" height="${H}" rx="14"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="${W}" height="${H}" fill="#0a0e14"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <text x="${W - 18}" y="${H - 16}" text-anchor="end" class="num">${num}</text>
    <rect width="${W}" height="3" fill="url(#edge)"/>
    <rect x="-120" width="120" height="3" fill="url(#shine)" opacity=".5">
      <animate attributeName="x" values="-120;${W}" dur="3.2s" begin="${(index * 0.4).toFixed(1)}s" repeatCount="indefinite"/>
    </rect>
  </g>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="#1f2630"/>

  <circle cx="${PAD + 4}" cy="40" r="4" fill="${p.accent}"><animate attributeName="opacity" values="1;.3;1" dur="2.4s" repeatCount="indefinite"/></circle>
  <text x="${PAD + 16}" y="44" class="kicker">${esc(p.kicker)}</text>
  <rect x="${W - PAD - pillW}" y="27" width="${pillW}" height="24" rx="12" fill="${p.accent}" fill-opacity=".1" stroke="${p.accent}" stroke-opacity=".45"/>
  <text x="${W - PAD - pillW / 2}" y="43" text-anchor="middle" class="pill">${esc(p.status)}</text>

  <text x="${PAD}" y="92" class="title">${esc(p.title)}</text>
  <text x="${PAD}" y="120" class="tag">${esc(p.tagline[0])}</text>
  <text x="${PAD}" y="141" class="tag">${esc(p.tagline[1] ?? '')}</text>

  <line x1="${PAD}" y1="158" x2="${W - PAD}" y2="158" stroke="#1f2630"/>
  ${signals}

  ${chips}
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
PROJECTS.forEach((p, i) => writeFileSync(join(OUT, `${p.slug}.svg`), card(p, i)));
console.log(`${PROJECTS.length} cards em assets/cards/`);
