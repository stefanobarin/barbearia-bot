// ─────────────────────────────────────────────────────────────
//  Sistema de alertas
//
//  Manda mensagem WhatsApp pro OWNER_PHONE quando algo dá errado.
//  Protege contra spam: 1 alerta por tipo a cada 5min.
//  Protege contra recursão: alerta que falha não dispara outro alerta.
// ─────────────────────────────────────────────────────────────
const { sendMessage } = require("./whatsapp");

const COOLDOWN_MS = 5 * 60 * 1000;
const cooldowns = new Map();
let sending = false;

async function sendAlert(key, message) {
  if (sending) return;
  if (!process.env.OWNER_PHONE) return;

  const last = cooldowns.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return;

  sending = true;
  cooldowns.set(key, Date.now());
  try {
    const timestamp = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    await sendMessage(
      process.env.OWNER_PHONE,
      `🚨 *Alerta Baronelli Bot*\n\n${message}\n\n🕐 ${timestamp}`
    );
    console.log(`[alert] enviado: ${key}`);
  } catch (err) {
    console.error(`[alert] falha ao enviar (${key}):`, err.message);
  } finally {
    sending = false;
  }
}

module.exports = { sendAlert };
