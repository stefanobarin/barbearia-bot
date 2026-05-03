// ─────────────────────────────────────────────────────────────
//  Relatório diário
//
//  Roda às 22h (horário de São Paulo) e manda um resumo do dia
//  pro número do dono via WhatsApp.
// ─────────────────────────────────────────────────────────────
const cron = require("node-cron");
const { todayConversations } = require("./conversations");
const { sendMessage } = require("./whatsapp");
const { sendAlert } = require("./alerts");
const { getStats: getTokenStats, formatTokens } = require("./tokenTracker");

function buildReport() {
  const today = todayConversations().filter((c) => c.source !== "followup");
  const total = today.length;
  const uniqueClients = new Set(today.map((c) => c.phone)).size;
  const escalations = today.filter((c) => c.source === "human").length;
  const aiAnswers = today.filter((c) => c.source === "ai" || c.source === "ai_vision").length;
  const bookings = today.filter((c) => c.source === "booking").length;
  const prices = today.filter((c) => c.source === "prices").length;

  const date = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const tokens = getTokenStats();
  const tokenLine = tokens.today.total > 0
    ? `\n🧠 ${formatTokens(tokens.today.total)} tokens · $${tokens.today.costUSD.toFixed(3)}`
    : "";

  if (total === 0) {
    return `📊 *Resumo do bot — ${date}*\n\nNenhuma conversa hoje.${tokenLine}`;
  }

  return (
    `📊 *Resumo do bot — ${date}*\n\n` +
    `💬 ${total} mensagens recebidas\n` +
    `👥 ${uniqueClients} clientes diferentes\n` +
    `💰 ${prices} perguntaram preço\n` +
    `📅 ${bookings} pediram agendamento\n` +
    `🤖 ${aiAnswers} respondidas pela IA\n` +
    `🆘 ${escalations} pediram atendente humano` +
    tokenLine
  );
}

function startDailyReport() {
  const owner = process.env.OWNER_PHONE;
  if (!owner) {
    console.log("[report] OWNER_PHONE não configurado, relatório desativado");
    return;
  }

  cron.schedule(
    "0 22 * * *",
    async () => {
      try {
        const report = buildReport();
        await sendMessage(owner, report);
        console.log("[report] Relatório diário enviado para", owner);
      } catch (err) {
        console.error("[report] Erro ao enviar:", err.message);
        sendAlert("daily_report_failed", `⚠️ Relatório diário falhou ao enviar:\n${err.message}`);
      }
    },
    { timezone: "America/Sao_Paulo" }
  );

  console.log("[report] Relatório diário agendado para 22h (São Paulo)");
}

module.exports = { startDailyReport, buildReport };
