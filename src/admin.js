// ─────────────────────────────────────────────────────────────
//  Painel administrativo
//
//  Rota /admin protegida por Basic Auth (usuário qualquer,
//  senha do env ADMIN_PASSWORD). Mostra conversas do dia.
// ─────────────────────────────────────────────────────────────
const express = require("express");
const { getAll, todayConversations } = require("./conversations");

const router = express.Router();

router.use((req, res, next) => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return res
      .status(500)
      .send("ADMIN_PASSWORD não configurado nas variáveis de ambiente.");
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

router.get("/", (req, res) => {
  const filter = req.query.filter || "today";
  const all = filter === "all" ? getAll() : todayConversations();
  const sorted = [...all].reverse();

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Painel Bot Baronelli</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 900px; margin: 0 auto; padding: 1rem; background: #f5f5f5; color: #222; }
    h1 { color: #222; margin-bottom: 0.5rem; }
    .stats { background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .filters { margin: 1rem 0; }
    .filters a { margin-right: 0.5rem; padding: 0.5rem 1rem; background: white; text-decoration: none; color: #333; border-radius: 6px; border: 1px solid #ddd; display: inline-block; }
    .filters a.active { background: #2c2c2c; color: white; border-color: #2c2c2c; }
    .conv { background: white; padding: 1rem; margin-bottom: 0.75rem; border-radius: 8px; border-left: 4px solid #4CAF50; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .conv.human { border-left-color: #f44336; }
    .conv.ai { border-left-color: #2196F3; }
    .conv .meta { font-size: 0.85rem; color: #777; margin-bottom: 0.5rem; }
    .conv .msg { margin: 0.4rem 0; line-height: 1.4; }
    .conv .msg .label { font-weight: 600; color: #555; display: inline-block; min-width: 70px; }
    .empty { text-align: center; color: #999; padding: 2rem; background: white; border-radius: 8px; }
    .source-tag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; background: #eee; }
    .source-tag.human { background: #ffebee; color: #c62828; }
    .source-tag.ai { background: #e3f2fd; color: #1565c0; }
  </style>
</head>
<body>
  <h1>💈 Bot Baronelli</h1>
  <div class="stats">
    <strong>${sorted.length}</strong> conversa${sorted.length !== 1 ? "s" : ""} ${filter === "today" ? "hoje" : "no total"}
  </div>
  <div class="filters">
    <a href="?filter=today" class="${filter === "today" ? "active" : ""}">Hoje</a>
    <a href="?filter=all" class="${filter === "all" ? "active" : ""}">Tudo</a>
  </div>
  ${sorted.length === 0 ? '<div class="empty">Nenhuma conversa ainda.</div>' : ""}
  ${sorted.map((c) => `
    <div class="conv ${c.source === "human" ? "human" : c.source === "ai" ? "ai" : ""}">
      <div class="meta">
        ${new Date(c.timestamp).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
         · ${escapeHtml(c.name)} · +${escapeHtml(c.phone)}
         · <span class="source-tag ${c.source}">${escapeHtml(c.source)}</span>
      </div>
      <div class="msg"><span class="label">Cliente:</span> ${escapeHtml(c.message)}</div>
      <div class="msg"><span class="label">Bot:</span> ${escapeHtml(c.reply)}</div>
    </div>
  `).join("")}
</body>
</html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

module.exports = router;
