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
  const a = Buffer.from(pw);
  const b = Buffer.from(password);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f1f5f9;
    color: #0f172a;
    min-height: 100vh;
  }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Header */
  .header {
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .header-logo {
    font-size: 1.5rem;
    width: 42px; height: 42px;
    border-radius: 10px;
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
  }
  .header-title h1 { font-size: 1.15rem; color: #0f172a; font-weight: 700; letter-spacing: -0.2px; }
  .header-title p { font-size: 0.78rem; color: #64748b; margin-top: 2px; }
  .header-nav { margin-left: auto; display: flex; gap: 0.4rem; }
  .nav-btn {
    padding: 0.45rem 0.95rem;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 600;
    background: transparent;
    color: #475569;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
  }
  .nav-btn:hover { background: #f1f5f9; color: #0f172a; text-decoration: none; }
  .nav-btn.active { background: #2563eb; color: #fff; }

  /* Main */
  .main { max-width: 1080px; margin: 0 auto; padding: 1.8rem 1.5rem; }

  /* Stats cards */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.8rem;
  }
  .stat-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1.1rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    transition: border-color 0.15s, transform 0.15s;
  }
  .stat-card:hover { border-color: #2563eb; }
  .stat-card .icon { font-size: 1.3rem; opacity: 0.9; }
  .stat-card .value { font-size: 2rem; font-weight: 700; color: #0f172a; line-height: 1; letter-spacing: -1px; }
  .stat-card .label { font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }

  /* Toolbar */
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.2rem;
    align-items: center;
    background: #fff;
    padding: 0.8rem 1rem;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
  }
  .filter-btn {
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    background: #f8fafc;
    color: #475569;
    border: 1px solid #e2e8f0;
    cursor: pointer;
    transition: all 0.15s;
    text-decoration: none;
    display: inline-block;
  }
  .filter-btn:hover { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; text-decoration: none; }
  .filter-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; }
  .search-input {
    margin-left: auto;
    padding: 0.45rem 0.8rem;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #0f172a;
    font-size: 0.85rem;
    width: 240px;
    outline: none;
  }
  .search-input:focus { border-color: #2563eb; background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
  .source-filter { font-size: 0.82rem; padding: 0.45rem 0.7rem; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; color: #0f172a; outline: none; cursor: pointer; }
  .source-filter:focus { border-color: #2563eb; }

  /* Conversation cards */
  .conv-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    margin-bottom: 0.8rem;
    padding: 1rem 1.2rem;
    border-left: 4px solid #cbd5e1;
    transition: box-shadow 0.15s, border-color 0.15s;
  }
  .conv-card:hover { box-shadow: 0 4px 12px rgba(15,23,42,0.06); }
  .conv-card.human { border-left-color: #dc2626; }
  .conv-card.ai { border-left-color: #2563eb; }
  .conv-card.faq { border-left-color: #16a34a; }
  .conv-card.booking { border-left-color: #7c3aed; }
  .conv-card.prices { border-left-color: #ea580c; }
  .conv-card.greeting { border-left-color: #0891b2; }
  .conv-card.followup { border-left-color: #f59e0b; }

  .conv-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.7rem;
    font-size: 0.8rem;
    color: #64748b;
  }
  .conv-meta .name { color: #2563eb; font-weight: 600; font-size: 0.92rem; }
  .conv-meta .phone-link { color: #64748b; font-size: 0.82rem; }
  .conv-meta .phone-link:hover { color: #2563eb; }
  .conv-meta .time { margin-left: auto; color: #94a3b8; }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 9px;
    border-radius: 12px;
    font-size: 0.72rem;
    font-weight: 600;
    background: #f1f5f9;
    color: #475569;
  }
  .badge.human { background: #fee2e2; color: #b91c1c; }
  .badge.ai { background: #dbeafe; color: #1d4ed8; }
  .badge.ai_vision { background: #ecfeff; color: #0e7490; }
  .badge.faq { background: #dcfce7; color: #15803d; }
  .badge.booking { background: #ede9fe; color: #6d28d9; }
  .badge.prices { background: #ffedd5; color: #c2410c; }
  .badge.greeting { background: #cffafe; color: #0e7490; }
  .badge.followup { background: #fef3c7; color: #b45309; }

  .chat-bubbles { display: flex; flex-direction: column; gap: 0.5rem; }
  .bubble { max-width: 88%; padding: 0.6rem 0.95rem; border-radius: 12px; font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; }
  .bubble.client {
    background: #f1f5f9;
    color: #0f172a;
    align-self: flex-start;
    border-bottom-left-radius: 3px;
  }
  .bubble.bot {
    background: #2563eb;
    color: #fff;
    align-self: flex-end;
    border-bottom-right-radius: 3px;
  }
  .bubble-label { font-size: 0.7rem; color: #94a3b8; margin-bottom: 3px; font-weight: 600; }

  /* Empty state */
  .empty {
    text-align: center;
    color: #94a3b8;
    padding: 3rem;
    background: #ffffff;
    border: 1px dashed #cbd5e1;
    border-radius: 12px;
    font-size: 0.95rem;
  }
  .empty .icon { font-size: 2.5rem; display: block; margin-bottom: 0.5rem; }

  /* FAQ page */
  .section-title { font-size: 0.95rem; color: #0f172a; font-weight: 700; margin-bottom: 1rem; }
  .faq-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1rem 1.2rem;
    margin-bottom: 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .faq-card .q { font-weight: 600; color: #0f172a; font-size: 0.92rem; }
  .faq-card .a { color: #475569; font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; }
  .faq-card .actions { margin-top: 0.5rem; display: flex; gap: 0.4rem; }
  .btn-secondary {
    background: #f1f5f9;
    color: #2563eb;
    border: 1px solid #bfdbfe;
    padding: 0.35rem 0.85rem;
    border-radius: 6px;
    font-size: 0.78rem;
    cursor: pointer;
    font-weight: 600;
    text-decoration: none;
    display: inline-block;
  }
  .btn-secondary:hover { background: #dbeafe; text-decoration: none; }
  .btn-danger {
    background: #fff;
    color: #dc2626;
    border: 1px solid #fecaca;
    padding: 0.35rem 0.85rem;
    border-radius: 6px;
    font-size: 0.78rem;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-danger:hover { background: #fee2e2; }

  .add-form {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1.3rem;
    margin-bottom: 1.5rem;
  }
  .add-form h3 { color: #0f172a; font-size: 0.95rem; margin-bottom: 1rem; }
  .form-group { margin-bottom: 0.9rem; }
  .form-group label { display: block; font-size: 0.74rem; color: #64748b; margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .form-input, .form-textarea {
    width: 100%;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    color: #0f172a;
    padding: 0.55rem 0.75rem;
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
    transition: all 0.15s;
  }
  .form-input:focus, .form-textarea:focus { border-color: #2563eb; background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
  .form-textarea { min-height: 90px; resize: vertical; }
  .btn-primary {
    background: #2563eb;
    color: #fff;
    border: none;
    padding: 0.55rem 1.3rem;
    border-radius: 7px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-primary:hover { background: #1d4ed8; }

  .alert-success {
    background: #dcfce7;
    border: 1px solid #86efac;
    border-radius: 8px;
    padding: 0.7rem 1rem;
    margin-bottom: 1rem;
    color: #15803d;
    font-size: 0.88rem;
    font-weight: 500;
  }

  /* CRM cliente */
  .back-link { display: inline-flex; align-items: center; gap: 0.4rem; color: #64748b; font-size: 0.85rem; margin-bottom: 1.2rem; }
  .back-link:hover { color: #2563eb; }
  .client-header {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1.3rem;
    margin-bottom: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .client-header .cname { font-size: 1.4rem; color: #0f172a; font-weight: 700; letter-spacing: -0.3px; }
  .client-header .cphone { color: #64748b; font-size: 0.88rem; }
  .client-stats { display: flex; gap: 1.8rem; margin-top: 0.7rem; flex-wrap: wrap; padding-top: 0.7rem; border-top: 1px solid #f1f5f9; }
  .client-stats .cs { font-size: 0.82rem; color: #64748b; }
  .client-stats .cs span { color: #2563eb; font-weight: 700; font-size: 0.95rem; }
`;

// ── Dashboard principal ───────────────────────────────────────
router.get("/", (req, res) => {
  const filter = req.query.filter || "today";
  let base;
  if (filter === "week") base = weekConversations();
  else if (filter === "all") base = getAll();
  else base = todayConversations();

  const sorted = [...base].reverse();

  // Métricas
  const uniquePhones = new Set(sorted.map((c) => c.phone)).size;
  const humanCount = sorted.filter((c) => c.source === "human").length;
  const aiCount = sorted.filter((c) => c.source === "ai" || c.source === "ai_vision").length;
  const escRate = sorted.length > 0 ? Math.round((humanCount / sorted.length) * 100) : 0;
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
      <div class="stat-card">
        <span class="icon">💬</span>
        <span class="value">${sorted.length}</span>
        <span class="label">Conversas ${period}</span>
      </div>
      <div class="stat-card">
        <span class="icon">👥</span>
        <span class="value">${uniquePhones}</span>
        <span class="label">Clientes únicos</span>
      </div>
      <div class="stat-card">
        <span class="icon">🆘</span>
        <span class="value">${humanCount}</span>
        <span class="label">Escalações humanas${sorted.length > 0 ? ` (${escRate}%)` : ""}</span>
      </div>
      <div class="stat-card">
        <span class="icon">🤖</span>
        <span class="value">${aiCount}</span>
        <span class="label">Respostas por IA</span>
      </div>
    </div>

    <!-- Filtros e busca -->
    <div class="toolbar">
      <a href="?filter=today" class="filter-btn ${filter === "today" ? "active" : ""}">Hoje</a>
      <a href="?filter=week" class="filter-btn ${filter === "week" ? "active" : ""}">Esta semana</a>
      <a href="?filter=all" class="filter-btn ${filter === "all" ? "active" : ""}">Tudo</a>
      <select class="source-filter" id="sourceFilter" onchange="applyFilter()">
        <option value="">Todas as fontes</option>
        <option value="ai">🤖 IA</option>
        <option value="faq">📋 FAQ</option>
        <option value="human">👤 Humano</option>
        <option value="booking">📅 Agendamento</option>
        <option value="prices">💰 Preços</option>
        <option value="greeting">👋 Saudação</option>
        <option value="followup">🔔 Follow-up</option>
      </select>
      <input
        class="search-input"
        id="searchInput"
        type="text"
        placeholder="Buscar por nome ou telefone…"
        oninput="applyFilter()"
      >
    </div>

    <!-- Lista de conversas -->
    <div id="convList">
      ${sorted.length === 0
        ? `<div class="empty"><span class="icon">🔇</span>Nenhuma conversa ${period}.</div>`
        : sorted.map((c, i) => `
        <div class="conv-card ${escapeHtml(c.source || "")}" data-source="${escapeHtml(c.source || "")}" data-search="${escapeHtml((c.name + " " + c.phone).toLowerCase())}">
          <div class="conv-meta">
            <a class="name phone-link" href="/admin/cliente/${escapeHtml(c.phone)}">${escapeHtml(c.name)}</a>
            <a class="phone-link" href="/admin/cliente/${escapeHtml(c.phone)}">+${escapeHtml(c.phone)}</a>
            <a class="phone-link" href="https://wa.me/${escapeHtml(c.phone)}" target="_blank" title="Abrir WhatsApp">💬</a>
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
      <div class="cphone">+${escapeHtml(phone)} &nbsp;<a href="https://wa.me/${escapeHtml(phone)}" target="_blank" style="font-size:0.85rem;">💬 Abrir WhatsApp</a></div>
      <div class="client-stats">
        <div class="cs">Mensagens: <span>${sorted.length}</span></div>
        <div class="cs">Escalações: <span>${humanEsc}</span></div>
        <div class="cs">Primeiro contato: <span>${firstSeen}</span></div>
        <div class="cs">Último contato: <span>${lastSeen}</span></div>
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
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

module.exports = router;
