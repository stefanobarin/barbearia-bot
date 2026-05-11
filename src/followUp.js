// Follow-up automático — dispara após inatividade quando bot enviou link de agendamento.
// Regras:
//  - Só dispara se último reply do bot continha o link de agendamento
//  - 1 follow-up por sessão (não persegue)
//  - Delay padrão: 30min (FOLLOWUP_DELAY_MIN)
//  - Sessão expira em 24h
//  - Sem emojis nas mensagens

const fs   = require("fs");
const path = require("path");
const cron = require("node-cron");
const { getAll, addConversation } = require("./conversations");
const { sendMessage } = require("./whatsapp");
const { maskPhone } = require("./utils");

const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, "..");
const STATE_FILE = path.join(DATA_DIR, "followups.json");

const FOLLOWUP_DELAY_MIN  = parseInt(process.env.FOLLOWUP_DELAY_MIN, 10) || 30;
const SESSION_EXPIRY_HOURS = 24;

const BOOKING_LINK = process.env.BOOKING_LINK || "cashbarber.com";

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); } catch { return {}; }
}

function saveState(state) {
  fs.promises.writeFile(STATE_FILE, JSON.stringify(state, null, 2))
    .catch(e => console.error("[followup] save state failed:", e.message));
}

function firstName(fullName) {
  if (!fullName || fullName === "Desconhecido") return "";
  return fullName.trim().split(/\s+/)[0];
}

function buildMessage(name) {
  const fn = firstName(name);
  const greeting = fn ? `Oi, ${fn}!` : "Oi!";
  return `${greeting} Conseguiu agendar pelo link? Se ficou alguma dúvida, é só chamar.`;
}

async function checkInactiveClients() {
  const state = loadState();
  const all   = getAll();
  if (all.length === 0) return;

  // Last conversation per phone
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

    // Only follow up if bot's last reply had the booking link
    if (!last.reply || !last.reply.includes(BOOKING_LINK)) continue;

    const sentInfo = state[phone];
    if (sentInfo) {
      const hoursSinceSent = (now - new Date(sentInfo.sentAt).getTime()) / 3600000;
      if (hoursSinceSent < SESSION_EXPIRY_HOURS) continue;
      delete state[phone];
      saveState(state);
    }

    try {
      const msg = buildMessage(last.name);
      // Persist before send to prevent duplicate on crash
      state[phone] = { sentAt: new Date().toISOString() };
      saveState(state);
      const wamid = await sendMessage(phone, msg);
      addConversation(phone, last.name, "[follow-up automático]", msg, "followup", wamid);
      console.log(`[followup] enviado para ${maskPhone(phone)}`);
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

  cron.schedule("*/5 * * * *", () => {
    checkInactiveClients().catch((err) =>
      console.error("[followup] erro:", err.message)
    );
  });

  console.log(`[followup] ativo — checa a cada 5min, dispara após ${FOLLOWUP_DELAY_MIN}min se link enviado`);
}

module.exports = { startFollowUp, checkInactiveClients };
