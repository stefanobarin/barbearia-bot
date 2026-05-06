// ─────────────────────────────────────────────────────────────
//  Entry point — starts the Express server
// ─────────────────────────────────────────────────────────────
require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const webhookRouter = require("./webhook");
const adminRouter = require("./admin");
const { startDailyReport } = require("./dailyReport");
const { startFollowUp } = require("./followUp");
const { startDiskMonitor } = require("./diskMonitor");
const { sendAlert } = require("./alerts");

process.on("uncaughtException", async (err) => {
  console.error("[CRASH] uncaughtException:", err);
  try {
    await sendAlert("crash_uncaught", `❌ Bot CRASHOU (uncaughtException)\n${err.message}\n\nO Railway vai tentar reiniciar automaticamente.`);
  } finally {
    process.exit(1);
  }
});

process.on("unhandledRejection", async (reason) => {
  console.error("[CRASH] unhandledRejection:", reason);
  const msg = reason instanceof Error ? reason.message : String(reason);
  try {
    await sendAlert("crash_rejection", `⚠️ Promise não tratada\n${msg}\n\nO Railway vai reiniciar.`);
  } finally {
    process.exit(1);
  }
});

const app = express();

app.set("trust proxy", 1);

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Muitas tentativas. Tente novamente em 15 minutos.",
});

app.use(
  "/webhook",
  webhookLimiter,
  express.json({
    limit: "200kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  webhookRouter
);

app.post("/admin/login", loginLimiter);
app.use("/admin", adminLimiter, express.json({ limit: "100kb" }), adminRouter);

app.get("/", (_req, res) => res.send("Barbearia AI — online ✅"));

app.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Política de Privacidade — Barbearia Baronelli</title></head><body style="font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222">
<h1>Política de Privacidade</h1>
<p><strong>Barbearia Baronelli</strong> — Recepção Automatizada via WhatsApp</p>
<p>Este serviço utiliza um assistente virtual via WhatsApp para responder dúvidas e auxiliar no agendamento de clientes.</p>
<h2>Dados coletados</h2>
<ul>
<li>Número de telefone do WhatsApp</li>
<li>Nome de perfil do WhatsApp</li>
<li>Conteúdo das mensagens enviadas para o bot</li>
</ul>
<h2>Uso dos dados</h2>
<p>Os dados são usados exclusivamente para responder às mensagens do cliente, registrar o histórico de atendimento e melhorar o serviço. Não compartilhamos dados com terceiros.</p>
<h2>Retenção</h2>
<p>Os dados são armazenados por até 90 dias e podem ser excluídos mediante solicitação.</p>
<h2>Contato</h2>
<p>Dúvidas: entre em contato pelo WhatsApp da barbearia.</p>
<p style="color:#888;font-size:0.9em">Atualizado em maio de 2026.</p>
</body></html>`);
});

// ── Health check ──────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: Math.floor(process.uptime()) });
});

// ── Graceful shutdown ──────────────────────────────────────────
function shutdown(signal) {
  console.log(`[server] ${signal} recebido — aguardando writes pendentes...`);
  setTimeout(() => process.exit(0), 3000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, "..");
  console.log(`[server] Running on port ${PORT}`);
  console.log(`[server] DATA_DIR: ${dataDir}`);
  try {
    const stat = fs.statSync(dataDir);
    console.log(`[server] /data existe: ${stat.isDirectory() ? "diretório ✓" : "não é diretório ✗"}`);
  } catch {
    console.warn(`[server] DATA_DIR não existe — dados serão efêmeros!`);
  }
  startDailyReport();
  startFollowUp();
  startDiskMonitor();

  if (process.env.STARTUP_ALERT === "true") {
    sendAlert("startup", "✅ Bot iniciado com sucesso");
  }
});
