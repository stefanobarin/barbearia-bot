// ─────────────────────────────────────────────────────────────
//  Follow-up automático
//
//  Detecta clientes inativos e manda uma mensagem contextual:
//   - Após 15min sem resposta → "precisa de algo mais?"
//   - Se última resposta foi link de agendamento → "conseguiu agendar?"
//
//  Regras:
//   - 1 follow-up por sessão (não persegue)
//   - Não envia para clientes escalados pra humano
//   - Ignora conversas com mais de 24h (sessão expirou)
//   - State persistido em followups.json para sobreviver a deploys
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { getAll, addConversation } = require("./conversations");
const { sendMessage } = require("./whatsapp");
const { maskPhone } = require("./utils");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
const STATE_FILE = path.join(DATA_DIR, "followups.json");

const FOLLOWUP_DELAY_MIN = parseInt(process.env.FOLLOWUP_DELAY_MIN, 10) || 15;
const SESSION_EXPIRY_HOURS = 24;

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); } catch { return {}; }
}

function saveState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) {
    console.error("[followup] save state failed:", e.message);
  }
}

function firstName(fullName) {
  if (!fullName || fullName === "Desconhecido") return "";
  return fullName.trim().split(/\s+/)[0];
}

function buildMessage(lastSource, name) {
  const fn = firstName(name);
  const greeting = fn ? `Oi, ${fn}!` : "Oi!";

  if (lastSource === "booking") {
    return `${greeting} 👋 Conseguiu agendar pelo link? Se ficou alguma dúvida, é só chamar — te ajudo a achar um horário.`;
  }

  if (lastSource === "prices") {
    return `${greeting} 👋 Ficou alguma dúvida sobre os preços? Tô por aqui se precisar.`;
  }

  if (lastSource === "ai") {
    return `${greeting} 👋 Conseguiu o que precisava? Se ainda tiver alguma dúvida, é só me chamar.`;
  }

  return `${greeting} 👋 Tá precisando de mais alguma coisa? Tô por aqui se quiser tirar qualquer dúvida.`;
}

async function checkInactiveClients() {
  const state = loadState();
  const all = getAll();
  if (all.length === 0) return;

  const lastByPhone = new Map();
  for (const c of all) {
    const existing = lastByPhone.get(c.phone);
    if (!existing || new Date(c.timestamp) > new Date(existing.timestamp)) {
      lastByPhone.set(c.phone, c);
    }
  }

  const now = Date.now();

  for (const [phone, last] of lastByPhone) {
    const elapsedMin = (now - new Date(last.timestamp).getTime()) / 60000;

    if (elapsedMin < FOLLOWUP_DELAY_MIN) continue;
    if (elapsedMin > SESSION_EXPIRY_HOURS * 60) continue;
    if (last.source === "human") continue;
    if (last.source === "followup") continue;

    const sentInfo = state[phone];
    if (sentInfo && new Date(sentInfo.sentAt) > new Date(last.timestamp)) continue;

    try {
      const msg = buildMessage(last.source, last.name);
      // Persist state BEFORE sending to prevent duplicate follow-ups if process crashes mid-send
      state[phone] = { sentAt: new Date().toISOString(), forSource: last.source };
      saveState(state);
      await sendMessage(phone, msg);
      addConversation(phone, last.name, "[follow-up automático]", msg, "followup");
      console.log(`[followup] enviado para ${maskPhone(phone)} (contexto: ${last.source})`);
    } catch (err) {
      console.error(`[followup] falhou para ${maskPhone(phone)}: ${err.message}`);
    }
  }
}

function startFollowUp() {
  if (process.env.FOLLOWUP_ENABLED === "false") {
    console.log("[followup] desativado via FOLLOWUP_ENABLED=false");
    return;
  }

  // Every 5 minutes — no need to check every minute
  cron.schedule("*/5 * * * *", () => {
    checkInactiveClients().catch((err) =>
      console.error("[followup] erro:", err.message)
    );
  });

  console.log(`[followup] ativo — checa inatividade a cada 5min, dispara após ${FOLLOWUP_DELAY_MIN}min`);
}

module.exports = { startFollowUp, checkInactiveClients };
