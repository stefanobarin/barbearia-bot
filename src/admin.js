// ─────────────────────────────────────────────────────────────
//  Painel administrativo — Barbearia Baronelli
//
//  GET  /admin              → Dashboard de conversas
//  GET  /admin/faq          → Gerenciamento do FAQ
//  POST /admin/faq          → Adicionar entrada FAQ
//  POST /admin/faq/delete   → Remover entrada FAQ
//  GET  /admin/cliente/:p   → CRM: histórico por cliente
// ─────────────────────────────────────────────────────────────
const express = require("express");
const crypto = require("crypto");
const { getAll, todayConversations, weekConversations, byPhone } = require("./conversations");
const { getAll: getFaqAll, addFaqEntry, removeFaqEntry, updateFaqEntry, resetFaqFromSeed } = require("./faqMatcher");
const { sendAlert } = require("./alerts");
const { getDiskStats, getConvFileSizeMB } = require("./diskMonitor");
const { getStats: getTokenStats, formatTokens } = require("./tokenTracker");

const router = express.Router();

// ── Basic Auth ────────────────────────────────────────────────
router.use((req, res, next) => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return res.status(500).send("ADMIN_PASSWORD não configurado.");
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Painel Baronelli"');
    return res.status(401).send("Autenticação requerida");
  }
  const [, encoded] = auth.split(" ");
  const decoded = Buffer.from(encoded, "base64").toString();
  const pw = decoded.split(":").slice(1).join(":");
  // Hash both values so timingSafeEqual always compares equal-length buffers
  const a = crypto.createHmac("sha256", "baronelli").update(pw).digest();
  const b = crypto.createHmac("sha256", "baronelli").update(password).digest();
  const ok = crypto.timingSafeEqual(a, b);
  if (!ok) {
    res.set("WWW-Authenticate", 'Basic realm="Painel Baronelli"');
    return res.status(401).send("Senha incorreta");
  }
  next();
});

const MAX_FAQ_LEN = 500;

// ── Helpers ───────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function sourceLabel(s) {
  const map = {
    human: "👤 Humano",
    ai: "🤖 IA",
    ai_vision: "📸 IA + Imagem",
    faq: "📋 FAQ",
    booking: "📅 Agendamento",
    prices: "💰 Preços",
    greeting: "👋 Saudação",
    services: "✂️ Serviços",
    hours: "🕐 Horário",
    location: "📍 Localização",
    followup: "🔔 Follow-up",
  };
  return map[s] || s;
}

// ── CSS compartilhado ─────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f0f4f8;
    color: #0f172a;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%);
    padding: 0.9rem 2rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: 0 2px 12px rgba(29,78,216,0.25);
  }
  .header-logo {
    font-size: 1.5rem;
    width: 44px; height: 44px;
    border-radius: 12px;
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255,255,255,0.25);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .header-title h1 { font-size: 1.05rem; color: #fff; font-weight: 700; letter-spacing: -0.2px; }
  .header-title p { font-size: 0.72rem; color: rgba(255,255,255,0.6); margin-top: 1px; }
  .header-nav { margin-left: auto; display: flex; gap: 0.35rem; }
  .nav-btn {
    padding: 0.45rem 1rem;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 600;
    background: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.75);
    border: 1px solid rgba(255,255,255,0.15);
    cursor: pointer;
    transition: all 0.15s;
    letter-spacing: 0.1px;
  }
  .nav-btn:hover { background: rgba(255,255,255,0.2); color: #fff; text-decoration: none; border-color: rgba(255,255,255,0.3); }
  .nav-btn.active { background: #fff; color: #1d4ed8; border-color: #fff; }

  /* ── Main ── */
  .main { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; flex: 1; width: 100%; }

  /* ── Stats grid ── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .stat-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 1.3rem 1.4rem;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
    transition: box-shadow 0.2s, transform 0.2s;
    position: relative;
    overflow: hidden;
  }
  .stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 16px 16px 0 0;
  }
  .stat-card:hover { box-shadow: 0 6px 24px rgba(15,23,42,0.1); transform: translateY(-1px); }
  .stat-card.blue::before { background: linear-gradient(90deg, #2563eb, #60a5fa); }
  .stat-card.green::before { background: linear-gradient(90deg, #16a34a, #4ade80); }
  .stat-card.red::before { background: linear-gradient(90deg, #dc2626, #f87171); }
  .stat-card.purple::before { background: linear-gradient(90deg, #7c3aed, #a78bfa); }
  .stat-card.orange::before { background: linear-gradient(90deg, #ea580c, #fb923c); }
  .stat-card.teal::before { background: linear-gradient(90deg, #0d9488, #2dd4bf); }
  .stat-card.yellow::before { background: linear-gradient(90deg, #ca8a04, #facc15); }
  .stat-icon {
    width: 44px; height: 44px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.3rem;
    flex-shrink: 0;
  }
  .stat-icon.blue { background: #eff6ff; }
  .stat-icon.green { background: #f0fdf4; }
  .stat-icon.red { background: #fef2f2; }
  .stat-icon.purple { background: #faf5ff; }
  .stat-icon.orange { background: #fff7ed; }
  .stat-icon.teal { background: #f0fdfa; }
  .stat-icon.yellow { background: #fefce8; }
  .stat-sublabel { font-size: 0.68rem; color: #94a3b8; margin-top: 2px; font-weight: 500; }
  .stat-body { display: flex; flex-direction: column; gap: 0.2rem; }
  .stat-card .value { font-size: 2.1rem; font-weight: 800; color: #0f172a; line-height: 1; letter-spacing: -1.5px; }
  .stat-card .label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.2rem;
    align-items: center;
    background: #fff;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
  }
  .period-group { display: flex; gap: 0.25rem; background: #f1f5f9; border-radius: 8px; padding: 0.2rem; }
  .filter-btn {
    padding: 0.38rem 0.9rem;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    background: transparent;
    color: #64748b;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
    text-decoration: none;
    display: inline-block;
  }
  .filter-btn:hover { background: #e2e8f0; color: #0f172a; text-decoration: none; }
  .filter-btn.active { background: #fff; color: #2563eb; box-shadow: 0 1px 3px rgba(15,23,42,0.12); }
  .search-wrap { margin-left: auto; position: relative; }
  .search-icon { position: absolute; left: 0.65rem; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.85rem; pointer-events: none; }
  .search-input {
    padding: 0.45rem 0.8rem 0.45rem 2rem;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #0f172a;
    font-size: 0.84rem;
    width: 250px;
    outline: none;
    font-family: inherit;
    transition: all 0.15s;
  }
  .search-input:focus { border-color: #2563eb; background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
  .source-filter {
    font-size: 0.82rem; padding: 0.42rem 0.7rem; border-radius: 8px;
    border: 1px solid #e2e8f0; background: #f8fafc; color: #0f172a;
    outline: none; cursor: pointer; font-family: inherit; font-weight: 500;
  }
  .source-filter:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

  /* ── Conversation cards ── */
  .conv-list-header {
    font-size: 0.72rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.7px;
    margin-bottom: 0.6rem;
    padding: 0 0.2rem;
  }
  .conv-card {
    background: #ffffff;
    border: 1px solid #e8eef5;
    border-radius: 14px;
    margin-bottom: 0.7rem;
    padding: 1rem 1.3rem;
    border-left: 4px solid #cbd5e1;
    transition: box-shadow 0.15s, transform 0.15s;
    box-shadow: 0 1px 2px rgba(15,23,42,0.04);
  }
  .conv-card:hover { box-shadow: 0 4px 16px rgba(15,23,42,0.08); transform: translateX(2px); }
  .conv-card.human { border-left-color: #ef4444; }
  .conv-card.ai { border-left-color: #3b82f6; }
  .conv-card.ai_vision { border-left-color: #06b6d4; }
  .conv-card.faq { border-left-color: #22c55e; }
  .conv-card.booking { border-left-color: #8b5cf6; }
  .conv-card.prices { border-left-color: #f97316; }
  .conv-card.greeting { border-left-color: #0891b2; }
  .conv-card.followup { border-left-color: #eab308; }

  .conv-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.75rem;
    font-size: 0.8rem;
    color: #64748b;
  }
  .conv-meta .name { color: #1d4ed8; font-weight: 700; font-size: 0.9rem; }
  .conv-meta .phone-link { color: #94a3b8; font-size: 0.8rem; font-family: monospace; }
  .conv-meta .phone-link:hover { color: #2563eb; }
  .conv-meta .wa-link { font-size: 0.95rem; line-height: 1; opacity: 0.7; transition: opacity 0.15s; }
  .conv-meta .wa-link:hover { opacity: 1; text-decoration: none; }
  .conv-meta .time { margin-left: auto; color: #94a3b8; font-size: 0.75rem; font-variant-numeric: tabular-nums; }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.2px;
    background: #f1f5f9;
    color: #475569;
  }
  .badge.human { background: #fef2f2; color: #dc2626; }
  .badge.ai { background: #eff6ff; color: #2563eb; }
  .badge.ai_vision { background: #ecfeff; color: #0891b2; }
  .badge.faq { background: #f0fdf4; color: #16a34a; }
  .badge.booking { background: #faf5ff; color: #7c3aed; }
  .badge.prices { background: #fff7ed; color: #ea580c; }
  .badge.greeting { background: #ecfeff; color: #0891b2; }
  .badge.followup { background: #fefce8; color: #ca8a04; }

  .chat-bubbles { display: flex; flex-direction: column; gap: 0.5rem; }
  .bubble {
    max-width: 85%;
    padding: 0.6rem 1rem;
    border-radius: 14px;
    font-size: 0.86rem;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .bubble.client {
    background: #f1f5f9;
    color: #1e293b;
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }
  .bubble.bot {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    color: #fff;
    align-self: flex-end;
    border-bottom-right-radius: 4px;
    box-shadow: 0 2px 8px rgba(37,99,235,0.3);
  }
  .bubble-label { font-size: 0.68rem; color: #94a3b8; margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }

  /* ── Empty state ── */
  .empty {
    text-align: center;
    color: #94a3b8;
    padding: 4rem 2rem;
    background: #ffffff;
    border: 2px dashed #e2e8f0;
    border-radius: 16px;
    font-size: 0.9rem;
  }
  .empty .icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; opacity: 0.5; }
  .empty p { color: #94a3b8; }

  /* ── FAQ page ── */
  .section-title { font-size: 0.92rem; color: #0f172a; font-weight: 700; margin-bottom: 1rem; }
  .faq-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 1.1rem 1.3rem;
    margin-bottom: 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
    transition: box-shadow 0.15s;
  }
  .faq-card:hover { box-shadow: 0 4px 12px rgba(15,23,42,0.08); }
  .faq-card .q { font-weight: 700; color: #0f172a; font-size: 0.9rem; }
  .faq-card .a { color: #475569; font-size: 0.86rem; line-height: 1.55; white-space: pre-wrap; }
  .faq-card .actions { margin-top: 0.5rem; display: flex; gap: 0.4rem; }
  .btn-secondary {
    background: #f8fafc;
    color: #2563eb;
    border: 1px solid #dbeafe;
    padding: 0.35rem 0.9rem;
    border-radius: 7px;
    font-size: 0.78rem;
    cursor: pointer;
    font-weight: 600;
    text-decoration: none;
    display: inline-block;
    transition: all 0.15s;
  }
  .btn-secondary:hover { background: #eff6ff; border-color: #93c5fd; text-decoration: none; }
  .btn-danger {
    background: #fff;
    color: #dc2626;
    border: 1px solid #fecaca;
    padding: 0.35rem 0.9rem;
    border-radius: 7px;
    font-size: 0.78rem;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.15s;
  }
  .btn-danger:hover { background: #fef2f2; border-color: #f87171; }

  .add-form {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
  }
  .add-form h3 { color: #0f172a; font-size: 0.95rem; font-weight: 700; margin-bottom: 1.1rem; }
  .form-group { margin-bottom: 1rem; }
  .form-group label { display: block; font-size: 0.72rem; color: #64748b; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; }
  .form-input, .form-textarea {
    width: 100%;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    color: #0f172a;
    padding: 0.6rem 0.85rem;
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
    transition: all 0.15s;
  }
  .form-input:focus, .form-textarea:focus { border-color: #2563eb; background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
  .form-textarea { min-height: 90px; resize: vertical; }
  .btn-primary {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    color: #fff;
    border: none;
    padding: 0.6rem 1.4rem;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
    box-shadow: 0 2px 8px rgba(37,99,235,0.3);
    font-family: inherit;
  }
  .btn-primary:hover { background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%); box-shadow: 0 4px 12px rgba(37,99,235,0.4); transform: translateY(-1px); }

  .alert-success {
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 10px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    color: #15803d;
    font-size: 0.87rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* ── Footer ── */
  .footer {
    text-align: center;
    padding: 1.5rem;
    color: #94a3b8;
    font-size: 0.74rem;
    background: #fff;
    border-top: 1px solid #e2e8f0;
    margin-top: 2rem;
  }
  .footer a { color: #64748b; font-weight: 500; }
  .footer a:hover { color: #2563eb; text-decoration: none; }

  /* ── CRM cliente ── */
  .back-link { display: inline-flex; align-items: center; gap: 0.4rem; color: #64748b; font-size: 0.84rem; margin-bottom: 1.2rem; font-weight: 500; }
  .back-link:hover { color: #2563eb; text-decoration: none; }
  .client-header {
    background: linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%);
    border-radius: 16px;
    padding: 1.5rem 1.6rem;
    margin-bottom: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    box-shadow: 0 4px 16px rgba(29,78,216,0.2);
  }
  .client-header .cname { font-size: 1.5rem; color: #fff; font-weight: 800; letter-spacing: -0.5px; }
  .client-header .cphone { color: rgba(255,255,255,0.7); font-size: 0.88rem; font-family: monospace; }
  .client-header .cphone a { color: rgba(255,255,255,0.9); }
  .client-header .cphone a:hover { color: #fff; }
  .client-stats { display: flex; gap: 2rem; margin-top: 0.9rem; flex-wrap: wrap; padding-top: 0.9rem; border-top: 1px solid rgba(255,255,255,0.15); }
  .client-stats .cs { font-size: 0.8rem; color: rgba(255,255,255,0.6); }
  .client-stats .cs span { color: #fff; font-weight: 700; font-size: 1rem; display: block; margin-bottom: 2px; }
`;

// ── Dashboard principal ───────────────────────────────────────
router.get("/", (req, res) => {
  const filter = req.query.filter || "today";
  let base;
  if (filter === "week") base = weekConversations();
  else if (filter === "all") base = getAll();
  else base = todayConversations();

  const disk      = getDiskStats();
  const convSizeMB = getConvFileSizeMB();
  const tokens    = getTokenStats();

  // Disk card config
  const diskColor = !disk ? "green"
    : parseFloat(disk.freePct) < 10 ? "red"
    : parseFloat(disk.freePct) < 25 ? "yellow"
    : "green";

  function formatDiskSize(mb) {
    if (!mb) return "—";
    const n = parseFloat(mb);
    if (n >= 1024) return (n / 1024).toFixed(1) + " GB";
    return n + " MB";
  }

  const diskValue = disk ? formatDiskSize(disk.freeMB) : "N/A";
  const diskSub   = disk ? `${disk.freePct}% livre · ${convSizeMB.toFixed(1)}MB usado` : "indisponível";

  const sorted = [...base].reverse();

  // Métricas — exclui follow-ups automáticos da contagem de conversas reais
  const realConvs = sorted.filter((c) => c.source !== "followup");
  const uniquePhones = new Set(realConvs.map((c) => c.phone)).size;
  const humanCount = realConvs.filter((c) => c.source === "human").length;
  const aiCount = realConvs.filter((c) => c.source === "ai" || c.source === "ai_vision").length;
  const escRate = realConvs.length > 0 ? Math.round((humanCount / realConvs.length) * 100) : 0;
  const period = filter === "today" ? "hoje" : filter === "week" ? "esta semana" : "no total";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Painel — Barbearia Baronelli</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="header">
    <div class="header-logo">💈</div>
    <div class="header-title">
      <h1>Barbearia Baronelli</h1>
      <p>Painel de Atendimento</p>
    </div>
    <nav class="header-nav">
      <a href="/admin" class="nav-btn active">Conversas</a>
      <a href="/admin/faq" class="nav-btn">FAQ</a>
    </nav>
  </header>

  <main class="main">
    <!-- Cards de métricas -->
    <div class="stats-grid">
      <div class="stat-card blue" style="cursor:default">
        <div class="stat-icon blue">💬</div>
        <div class="stat-body">
          <span class="value">${realConvs.length}</span>
          <span class="label">Conversas ${period}</span>
        </div>
      </div>
      <div class="stat-card green" style="cursor:default">
        <div class="stat-icon green">👥</div>
        <div class="stat-body">
          <span class="value">${uniquePhones}</span>
          <span class="label">Clientes únicos</span>
        </div>
      </div>
      <div class="stat-card red" style="cursor:pointer" title="Clique para filtrar escalações" onclick="document.getElementById('sourceFilter').value='human';applyFilter()">
        <div class="stat-icon red">🆘</div>
        <div class="stat-body">
          <span class="value">${humanCount}</span>
          <span class="label">Escalações${realConvs.length > 0 ? ` · ${escRate}%` : ""} ↗</span>
        </div>
      </div>
      <div class="stat-card purple" style="cursor:pointer" title="Clique para filtrar respostas IA" onclick="document.getElementById('sourceFilter').value='ai';applyFilter()">
        <div class="stat-icon purple">🤖</div>
        <div class="stat-body">
          <span class="value">${aiCount}</span>
          <span class="label">Respostas por IA ↗</span>
        </div>
      </div>
      <div class="stat-card teal">
        <div class="stat-icon teal">🧠</div>
        <div class="stat-body">
          <span class="value">${formatTokens(tokens.today.total) || "0"}</span>
          <span class="label">Tokens hoje</span>
          <span class="stat-sublabel">$${tokens.today.costUSD.toFixed(3)} · total: ${formatTokens(tokens.allTime.total)}</span>
        </div>
      </div>
      <div class="stat-card ${diskColor}">
        <div class="stat-icon ${diskColor}">💾</div>
        <div class="stat-body">
          <span class="value">${diskValue}</span>
          <span class="label">Disco livre</span>
          <span class="stat-sublabel">${diskSub}</span>
        </div>
      </div>
    </div>

    <!-- Filtros e busca -->
    <div class="toolbar">
      <div class="period-group">
        <a href="?filter=today" class="filter-btn ${filter === "today" ? "active" : ""}">Hoje</a>
        <a href="?filter=week" class="filter-btn ${filter === "week" ? "active" : ""}">Esta semana</a>
        <a href="?filter=all" class="filter-btn ${filter === "all" ? "active" : ""}">Tudo</a>
      </div>
      <select class="source-filter" id="sourceFilter" onchange="applyFilter()">
        <option value="">Todas as fontes</option>
        <option value="ai">🤖 IA</option>
        <option value="ai_vision">📸 IA + Imagem</option>
        <option value="faq">📋 FAQ</option>
        <option value="human">👤 Humano</option>
        <option value="booking">📅 Agendamento</option>
        <option value="prices">💰 Preços</option>
        <option value="greeting">👋 Saudação</option>
        <option value="followup">🔔 Follow-up</option>
      </select>
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input
          class="search-input"
          id="searchInput"
          type="text"
          placeholder="Nome ou telefone…"
          oninput="applyFilter()"
        >
      </div>
    </div>

    <!-- Lista de conversas -->
    <div id="convList">
      ${sorted.length === 0
        ? `<div class="empty"><span class="icon">🔇</span><p>Nenhuma conversa ${period}.</p></div>`
        : sorted.map((c, i) => `
        <div class="conv-card ${escapeHtml(c.source || "")}" data-source="${escapeHtml(c.source || "")}" data-search="${escapeHtml((c.name + " " + c.phone).toLowerCase())}">
          <div class="conv-meta">
            <a class="name phone-link" href="/admin/cliente/${escapeHtml(c.phone)}">${escapeHtml(c.name)}</a>
            <a class="phone-link" href="/admin/cliente/${escapeHtml(c.phone)}">+${escapeHtml(c.phone)}</a>
            <a class="wa-link" href="https://wa.me/${escapeHtml(c.phone)}" target="_blank" title="Abrir WhatsApp">💬</a>
            <span class="badge ${escapeHtml(c.source || "")}">${sourceLabel(c.source)}</span>
            <span class="time">${formatDate(c.timestamp)}</span>
          </div>
          <div class="chat-bubbles">
            <div>
              <div class="bubble-label">Cliente</div>
              <div class="bubble client">${escapeHtml(c.message)}</div>
            </div>
            <div>
              <div class="bubble-label" style="text-align:right">Bot</div>
              <div class="bubble bot">${escapeHtml(c.reply)}</div>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  </main>

  <script>
    const PAGE_SIZE = 50;
    let currentPage = 0;
    const cards = Array.from(document.querySelectorAll('.conv-card'));

    function applyFilter() {
      const src = document.getElementById('sourceFilter').value;
      const q = document.getElementById('searchInput').value.toLowerCase();
      currentPage = 0;
      const visible = cards.filter(el => {
        const matchSrc = !src || el.dataset.source === src;
        const matchQ = !q || el.dataset.search.includes(q);
        return matchSrc && matchQ;
      });
      cards.forEach(el => el.style.display = 'none');
      visible.forEach((el, i) => { el.style.display = i < PAGE_SIZE ? '' : 'none'; });
      renderPager(visible);
    }

    function renderPager(visible) {
      const old = document.getElementById('pager');
      if (old) old.remove();
      if (visible.length <= PAGE_SIZE) return;
      const pages = Math.ceil(visible.length / PAGE_SIZE);
      const pager = document.createElement('div');
      pager.id = 'pager';
      pager.style.cssText = 'display:flex;gap:0.4rem;justify-content:center;margin-top:1rem;';
      for (let i = 0; i < pages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i + 1;
        btn.className = 'filter-btn' + (i === currentPage ? ' active' : '');
        btn.onclick = () => {
          currentPage = i;
          visible.forEach((el, j) => { el.style.display = (j >= i*PAGE_SIZE && j < (i+1)*PAGE_SIZE) ? '' : 'none'; });
          pager.querySelectorAll('button').forEach((b, bi) => b.className = 'filter-btn' + (bi === i ? ' active' : ''));
          window.scrollTo(0, 0);
        };
        pager.appendChild(btn);
      }
      document.getElementById('convList').after(pager);
    }

    applyFilter();

    // Auto-refresh sem perder scroll
    setInterval(() => {
      const scroll = window.scrollY;
      fetch(location.href)
        .then(r => r.text())
        .then(html => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          // Atualiza só os cards e stats
          document.querySelector('.stats-grid').innerHTML = doc.querySelector('.stats-grid').innerHTML;
          document.getElementById('convList').innerHTML = doc.getElementById('convList').innerHTML;
          applyFilter();
          window.scrollTo(0, scroll);
        })
        .catch(() => {});
    }, 60000);
  </script>

  <footer class="footer">
    © ${new Date().getFullYear()} Barbearia Baronelli · Todos os direitos reservados · Criado por <a href="mailto:stefanobarin@gmail.com">Stefano Barin</a>
  </footer>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ── FAQ: listar + formulário ──────────────────────────────────
router.get("/faq", (req, res) => {
  const entries = getFaqAll();
  const msg = req.query.msg || "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FAQ — Barbearia Baronelli</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="header">
    <div class="header-logo">💈</div>
    <div class="header-title">
      <h1>Barbearia Baronelli</h1>
      <p>Gerenciamento de FAQ</p>
    </div>
    <nav class="header-nav">
      <a href="/admin" class="nav-btn">Conversas</a>
      <a href="/admin/faq" class="nav-btn active">FAQ</a>
    </nav>
  </header>

  <main class="main">
    ${msg ? `<div class="alert-success">✅ ${escapeHtml(msg)}</div>` : ""}

    <!-- Formulário para adicionar -->
    <div class="add-form">
      <h3>➕ Adicionar nova pergunta ao FAQ</h3>
      <form method="POST" action="/admin/faq">
        <div class="form-group">
          <label>Pergunta (como o cliente costuma perguntar)</label>
          <input class="form-input" name="pergunta" maxlength="500" placeholder="Ex: vocês aceitam cartão" required>
        </div>
        <div class="form-group">
          <label>Resposta do bot</label>
          <textarea class="form-textarea" name="resposta" maxlength="500" placeholder="Ex: Sim! Aceitamos cartão de débito, crédito e Pix. 💳" required></textarea>
        </div>
        <button class="btn-primary" type="submit">Salvar no FAQ</button>
      </form>
    </div>

    <!-- Lista do FAQ atual -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
      <p class="section-title" style="margin:0;">📋 ${entries.length} entrada${entries.length !== 1 ? "s" : ""} no FAQ</p>
      <form method="POST" action="/admin/faq/reset" style="display:inline;" onsubmit="return confirm('⚠️ Isso vai SUBSTITUIR todo o FAQ atual pelo padrão do código (faq.json do repo). Deseja continuar?')">
        <button class="btn-secondary" type="submit" style="font-size:0.78rem;">🔄 Restaurar FAQ padrão</button>
      </form>
    </div>
    ${entries.length === 0
      ? `<div class="empty"><span class="icon">📭</span>Nenhuma entrada no FAQ ainda.</div>`
      : entries.map((e, i) => {
          const editing = String(req.query.edit) === String(i);
          if (editing) {
            return `
            <div class="faq-card">
              <form method="POST" action="/admin/faq/update">
                <input type="hidden" name="index" value="${i}">
                <div class="form-group">
                  <label>Pergunta</label>
                  <input class="form-input" name="pergunta" maxlength="500" value="${escapeHtml(e.pergunta)}" required>
                </div>
                <div class="form-group">
                  <label>Resposta</label>
                  <textarea class="form-textarea" name="resposta" maxlength="500" required>${escapeHtml(e.resposta)}</textarea>
                </div>
                <div style="display:flex;gap:0.5rem;">
                  <button class="btn-primary" type="submit">Salvar alterações</button>
                  <a href="/admin/faq" class="btn-secondary">Cancelar</a>
                </div>
              </form>
            </div>`;
          }
          return `
          <div class="faq-card">
            <div class="q">❓ ${escapeHtml(e.pergunta)}</div>
            <div class="a">💬 ${escapeHtml(e.resposta)}</div>
            <div class="actions">
              <a href="/admin/faq?edit=${i}" class="btn-secondary">✏️ Editar</a>
              <form method="POST" action="/admin/faq/delete" style="display:inline" onsubmit="return confirm('Remover esta entrada do FAQ?')">
                <input type="hidden" name="index" value="${i}">
                <button class="btn-danger" type="submit">🗑️ Remover</button>
              </form>
            </div>
          </div>`;
        }).join("")}
  </main>

  <footer class="footer">
    © ${new Date().getFullYear()} Barbearia Baronelli · Todos os direitos reservados · Criado por <a href="mailto:stefanobarin@gmail.com">Stefano Barin</a>
  </footer>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ── FAQ: adicionar ────────────────────────────────────────────
router.post("/faq", express.urlencoded({ extended: false, limit: "10kb" }), (req, res) => {
  const pergunta = String(req.body.pergunta || "").slice(0, MAX_FAQ_LEN);
  const resposta = String(req.body.resposta || "").slice(0, MAX_FAQ_LEN);
  if (pergunta.trim() && resposta.trim()) {
    addFaqEntry(pergunta, resposta);
  }
  res.redirect("/admin/faq?msg=Entrada adicionada com sucesso!");
});

// ── Teste de alerta ───────────────────────────────────────────
router.get("/test-alert", async (_req, res) => {
  try {
    await sendAlert(
      "manual_test_" + Date.now(),
      "🧪 Este é um alerta de teste manual. Se você está vendo essa mensagem, os alertas estão funcionando!"
    );
    res.send("Alerta enviado para OWNER_PHONE. Verifique seu WhatsApp.");
  } catch (e) {
    res.status(500).send("Falha ao enviar: " + e.message);
  }
});

// ── FAQ: resetar do seed ──────────────────────────────────────
router.post("/faq/reset", express.urlencoded({ extended: false, limit: "1kb" }), (_req, res) => {
  const ok = resetFaqFromSeed();
  res.redirect(
    "/admin/faq?msg=" +
      encodeURIComponent(ok ? "FAQ restaurado para o padrão do código." : "Não foi possível restaurar (seed não encontrado).")
  );
});

// ── FAQ: editar ───────────────────────────────────────────────
router.post("/faq/update", express.urlencoded({ extended: false, limit: "10kb" }), (req, res) => {
  const index = parseInt(req.body.index, 10);
  const pergunta = String(req.body.pergunta || "").slice(0, MAX_FAQ_LEN);
  const resposta = String(req.body.resposta || "").slice(0, MAX_FAQ_LEN);
  if (!isNaN(index) && pergunta.trim() && resposta.trim()) {
    updateFaqEntry(index, pergunta, resposta);
  }
  res.redirect("/admin/faq?msg=Entrada atualizada com sucesso!");
});

// ── FAQ: remover ──────────────────────────────────────────────
router.post("/faq/delete", express.urlencoded({ extended: false, limit: "1kb" }), (req, res) => {
  const index = parseInt(req.body.index, 10);
  if (!isNaN(index)) {
    removeFaqEntry(index);
  }
  res.redirect("/admin/faq?msg=Entrada removida.");
});

// ── CRM por cliente ───────────────────────────────────────────
router.get("/cliente/:phone", (req, res) => {
  const phone = req.params.phone;
  const convs = byPhone(phone);
  const sorted = [...convs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const name = sorted.length > 0 ? sorted[sorted.length - 1].name : phone;
  const humanEsc = sorted.filter((c) => c.source === "human").length;
  const firstSeen = sorted.length > 0 ? formatDate(sorted[0].timestamp) : "—";
  const lastSeen = sorted.length > 0 ? formatDate(sorted[sorted.length - 1].timestamp) : "—";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(name)} — Baronelli CRM</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="header">
    <div class="header-logo">💈</div>
    <div class="header-title">
      <h1>Barbearia Baronelli</h1>
      <p>CRM — Histórico do cliente</p>
    </div>
    <nav class="header-nav">
      <a href="/admin" class="nav-btn">← Conversas</a>
      <a href="/admin/faq" class="nav-btn">FAQ</a>
    </nav>
  </header>

  <main class="main">
    <div class="client-header">
      <div class="cname">${escapeHtml(name)}</div>
      <div class="cphone">+${escapeHtml(phone)} &nbsp;<a href="https://wa.me/${escapeHtml(phone)}" target="_blank">💬 Abrir WhatsApp</a></div>
      <div class="client-stats">
        <div class="cs"><span>${sorted.length}</span>Mensagens</div>
        <div class="cs"><span>${humanEsc}</span>Escalações</div>
        <div class="cs"><span>${firstSeen}</span>Primeiro contato</div>
        <div class="cs"><span>${lastSeen}</span>Último contato</div>
      </div>
    </div>

    ${sorted.length === 0
      ? `<div class="empty"><span class="icon">🔇</span>Nenhuma conversa encontrada.</div>`
      : sorted.map((c) => `
      <div class="conv-card ${escapeHtml(c.source || "")}">
        <div class="conv-meta">
          <span class="badge ${escapeHtml(c.source || "")}">${sourceLabel(c.source)}</span>
          <span class="time">${formatDate(c.timestamp)}</span>
        </div>
        <div class="chat-bubbles">
          <div>
            <div class="bubble-label">Cliente</div>
            <div class="bubble client">${escapeHtml(c.message)}</div>
          </div>
          <div>
            <div class="bubble-label" style="text-align:right">Bot</div>
            <div class="bubble bot">${escapeHtml(c.reply)}</div>
          </div>
        </div>
      </div>
    `).join("")}
  </main>

  <footer class="footer">
    © ${new Date().getFullYear()} Barbearia Baronelli · Todos os direitos reservados · Criado por <a href="mailto:stefanobarin@gmail.com">Stefano Barin</a>
  </footer>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

module.exports = router;
