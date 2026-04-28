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
const { getAll, todayConversations, weekConversations, byPhone } = require("./conversations");
const { getAll: getFaqAll, addFaqEntry, removeFaqEntry } = require("./faqMatcher");

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
  if (pw !== password) {
    res.set("WWW-Authenticate", 'Basic realm="Painel Baronelli"');
    return res.status(401).send("Senha incorreta");
  }
  next();
});

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
    faq: "📋 FAQ",
    booking: "📅 Agendamento",
    prices: "💰 Preços",
    greeting: "👋 Saudação",
    services: "✂️ Serviços",
    hours: "🕐 Horário",
    location: "📍 Localização",
  };
  return map[s] || s;
}

// ── CSS compartilhado ─────────────────────────────────────────
const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #111;
    color: #eee;
    min-height: 100vh;
  }
  a { color: #d4a843; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Header */
  .header {
    background: #1a1a1a;
    border-bottom: 2px solid #d4a843;
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .header-logo { font-size: 2rem; }
  .header-title h1 { font-size: 1.3rem; color: #d4a843; font-weight: 700; letter-spacing: 0.5px; }
  .header-title p { font-size: 0.78rem; color: #888; margin-top: 2px; }
  .header-nav { margin-left: auto; display: flex; gap: 0.5rem; }
  .nav-btn {
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    background: #2a2a2a;
    color: #ccc;
    border: 1px solid #333;
    cursor: pointer;
    transition: all 0.15s;
  }
  .nav-btn:hover, .nav-btn.active { background: #d4a843; color: #111; border-color: #d4a843; }

  /* Main */
  .main { max-width: 980px; margin: 0 auto; padding: 1.5rem; }

  /* Stats cards */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .stat-card {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .stat-card .icon { font-size: 1.4rem; }
  .stat-card .value { font-size: 2rem; font-weight: 700; color: #d4a843; line-height: 1; }
  .stat-card .label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }

  /* Toolbar */
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.2rem;
    align-items: center;
  }
  .filter-btn {
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    background: #1e1e1e;
    color: #aaa;
    border: 1px solid #2e2e2e;
    cursor: pointer;
    transition: all 0.15s;
    text-decoration: none;
    display: inline-block;
  }
  .filter-btn:hover { background: #2a2a2a; color: #eee; text-decoration: none; }
  .filter-btn.active { background: #d4a843; color: #111; border-color: #d4a843; }
  .search-input {
    margin-left: auto;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    border: 1px solid #2e2e2e;
    background: #1e1e1e;
    color: #eee;
    font-size: 0.82rem;
    width: 220px;
    outline: none;
  }
  .search-input:focus { border-color: #d4a843; }
  .source-filter { font-size: 0.82rem; padding: 0.4rem 0.7rem; border-radius: 6px; border: 1px solid #2e2e2e; background: #1e1e1e; color: #eee; outline: none; cursor: pointer; }
  .source-filter:focus { border-color: #d4a843; }

  /* Conversation cards */
  .conv-card {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    margin-bottom: 0.8rem;
    padding: 1rem 1.2rem;
    border-left: 4px solid #333;
    transition: border-color 0.15s;
  }
  .conv-card:hover { border-color: #d4a843; }
  .conv-card.human { border-left-color: #e53935; }
  .conv-card.ai { border-left-color: #1976d2; }
  .conv-card.faq { border-left-color: #388e3c; }
  .conv-card.booking { border-left-color: #7b1fa2; }
  .conv-card.prices { border-left-color: #f57c00; }

  .conv-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.7rem;
    font-size: 0.8rem;
    color: #888;
  }
  .conv-meta .name { color: #d4a843; font-weight: 600; font-size: 0.9rem; }
  .conv-meta .phone-link { color: #888; font-size: 0.8rem; }
  .conv-meta .phone-link:hover { color: #d4a843; }
  .conv-meta .time { margin-left: auto; }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.72rem;
    font-weight: 600;
    background: #2a2a2a;
    color: #bbb;
  }
  .badge.human { background: #4a1212; color: #ef9a9a; }
  .badge.ai { background: #102840; color: #90caf9; }
  .badge.faq { background: #0d2e12; color: #a5d6a7; }
  .badge.booking { background: #2a1040; color: #ce93d8; }
  .badge.prices { background: #3e1e00; color: #ffcc80; }

  .chat-bubbles { display: flex; flex-direction: column; gap: 0.5rem; }
  .bubble { max-width: 88%; padding: 0.6rem 0.9rem; border-radius: 10px; font-size: 0.88rem; line-height: 1.45; }
  .bubble.client {
    background: #2a2a2a;
    color: #eee;
    align-self: flex-start;
    border-bottom-left-radius: 3px;
  }
  .bubble.bot {
    background: #1e3a1e;
    color: #c8e6c9;
    align-self: flex-end;
    border-bottom-right-radius: 3px;
  }
  .bubble-label { font-size: 0.7rem; color: #666; margin-bottom: 2px; }

  /* Empty state */
  .empty {
    text-align: center;
    color: #555;
    padding: 3rem;
    background: #1a1a1a;
    border-radius: 10px;
    font-size: 0.95rem;
  }
  .empty .icon { font-size: 2.5rem; display: block; margin-bottom: 0.5rem; }

  /* FAQ page */
  .section-title { font-size: 1rem; color: #d4a843; font-weight: 700; margin-bottom: 1rem; }
  .faq-card {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 1rem 1.2rem;
    margin-bottom: 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .faq-card .q { font-weight: 600; color: #d4a843; font-size: 0.9rem; }
  .faq-card .a { color: #bbb; font-size: 0.88rem; line-height: 1.4; }
  .faq-card .actions { margin-top: 0.4rem; }
  .btn-danger {
    background: #4a1212;
    color: #ef9a9a;
    border: 1px solid #6a2020;
    padding: 0.3rem 0.8rem;
    border-radius: 6px;
    font-size: 0.78rem;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-danger:hover { background: #6a1515; }

  .add-form {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 1.2rem;
    margin-bottom: 1.5rem;
  }
  .add-form h3 { color: #d4a843; font-size: 0.9rem; margin-bottom: 1rem; }
  .form-group { margin-bottom: 0.8rem; }
  .form-group label { display: block; font-size: 0.78rem; color: #888; margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.5px; }
  .form-input, .form-textarea {
    width: 100%;
    background: #111;
    border: 1px solid #2e2e2e;
    border-radius: 6px;
    color: #eee;
    padding: 0.5rem 0.7rem;
    font-size: 0.88rem;
    font-family: inherit;
    outline: none;
  }
  .form-input:focus, .form-textarea:focus { border-color: #d4a843; }
  .form-textarea { min-height: 80px; resize: vertical; }
  .btn-primary {
    background: #d4a843;
    color: #111;
    border: none;
    padding: 0.5rem 1.2rem;
    border-radius: 6px;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-primary:hover { background: #c49535; }

  /* CRM cliente */
  .back-link { display: inline-flex; align-items: center; gap: 0.4rem; color: #888; font-size: 0.85rem; margin-bottom: 1.2rem; }
  .back-link:hover { color: #d4a843; }
  .client-header {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 1.2rem;
    margin-bottom: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .client-header .cname { font-size: 1.3rem; color: #d4a843; font-weight: 700; }
  .client-header .cphone { color: #888; font-size: 0.88rem; }
  .client-stats { display: flex; gap: 1.5rem; margin-top: 0.5rem; flex-wrap: wrap; }
  .client-stats .cs { font-size: 0.82rem; color: #aaa; }
  .client-stats .cs span { color: #d4a843; font-weight: 700; }
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
  const aiCount = sorted.filter((c) => c.source === "ai").length;
  const period = filter === "today" ? "hoje" : filter === "week" ? "esta semana" : "no total";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="60">
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
        <span class="label">Escalações humanas</span>
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
    function applyFilter() {
      const src = document.getElementById('sourceFilter').value;
      const q = document.getElementById('searchInput').value.toLowerCase();
      document.querySelectorAll('.conv-card').forEach(el => {
        const matchSrc = !src || el.dataset.source === src;
        const matchQ = !q || el.dataset.search.includes(q);
        el.style.display = matchSrc && matchQ ? '' : 'none';
      });
    }
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
    ${msg ? `<div style="background:#0d2e12;border:1px solid #2e6e2e;border-radius:8px;padding:0.8rem 1rem;margin-bottom:1rem;color:#a5d6a7;font-size:0.88rem;">✅ ${escapeHtml(msg)}</div>` : ""}

    <!-- Formulário para adicionar -->
    <div class="add-form">
      <h3>➕ Adicionar nova pergunta ao FAQ</h3>
      <form method="POST" action="/admin/faq">
        <div class="form-group">
          <label>Pergunta (como o cliente costuma perguntar)</label>
          <input class="form-input" name="pergunta" placeholder="Ex: vocês aceitam cartão" required>
        </div>
        <div class="form-group">
          <label>Resposta do bot</label>
          <textarea class="form-textarea" name="resposta" placeholder="Ex: Sim! Aceitamos cartão de débito, crédito e Pix. 💳" required></textarea>
        </div>
        <button class="btn-primary" type="submit">Salvar no FAQ</button>
      </form>
    </div>

    <!-- Lista do FAQ atual -->
    <p class="section-title">📋 ${entries.length} entrada${entries.length !== 1 ? "s" : ""} no FAQ</p>
    ${entries.length === 0
      ? `<div class="empty"><span class="icon">📭</span>Nenhuma entrada no FAQ ainda.</div>`
      : entries.map((e, i) => `
      <div class="faq-card">
        <div class="q">❓ ${escapeHtml(e.pergunta)}</div>
        <div class="a">💬 ${escapeHtml(e.resposta)}</div>
        <div class="actions">
          <form method="POST" action="/admin/faq/delete" style="display:inline" onsubmit="return confirm('Remover esta entrada?')">
            <input type="hidden" name="index" value="${i}">
            <button class="btn-danger" type="submit">🗑️ Remover</button>
          </form>
        </div>
      </div>
    `).join("")}
  </main>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ── FAQ: adicionar ────────────────────────────────────────────
router.post("/faq", express.urlencoded({ extended: false }), (req, res) => {
  const { pergunta, resposta } = req.body;
  if (pergunta && resposta) {
    addFaqEntry(pergunta, resposta);
  }
  res.redirect("/admin/faq?msg=Entrada adicionada com sucesso!");
});

// ── FAQ: remover ──────────────────────────────────────────────
router.post("/faq/delete", express.urlencoded({ extended: false }), (req, res) => {
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
      <div class="cphone">+${escapeHtml(phone)}</div>
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
