// ─────────────────────────────────────────────────────────────
//  Persistência de conversas
//
//  Salva cada interação cliente↔bot num arquivo JSON.
//  Usado pelo painel /admin e pelo relatório diário.
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
const FILE = path.join(DATA_DIR, "conversations.json");
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const MAX_ENTRIES = 5000;

// Async write queue: serializes writes, never blocks the event loop
let _writeQueue = Promise.resolve();

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {
    return [];
  }
}

function save(entries) {
  const trimmed = entries.slice(-MAX_ENTRIES);
  const data = JSON.stringify(trimmed, null, 2);
  _writeQueue = _writeQueue
    .then(() => fs.promises.writeFile(FILE, data))
    .catch((err) => console.error("[conversations] write error:", err.message));
}

function addConversation(phone, name, message, reply, source) {
  const entries = load();
  entries.push({
    timestamp: new Date().toISOString(),
    phone,
    name: name || "Desconhecido",
    message,
    reply,
    source,
  });
  save(entries);
}

function todayConversations() {
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });
  return load().filter((e) => {
    const local = new Date(e.timestamp).toLocaleDateString("sv-SE", {
      timeZone: "America/Sao_Paulo",
    });
    return local === today;
  });
}

function weekConversations() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return load().filter((e) => new Date(e.timestamp) >= startOfWeek);
}

function byPhone(phone) {
  return load().filter((e) => e.phone === phone);
}

function getAll() {
  return load();
}

module.exports = { addConversation, todayConversations, weekConversations, byPhone, getAll };
