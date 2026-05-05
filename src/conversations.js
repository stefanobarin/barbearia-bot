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

let _writeQueue = Promise.resolve();

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {
    return [];
  }
}

// Single in-memory cache — loaded once at startup, kept in sync on writes
let _cache = load();

function save(entries) {
  const data = JSON.stringify(entries, null, 2);
  _writeQueue = _writeQueue
    .then(() => fs.promises.writeFile(FILE, data))
    .catch((err) => console.error("[conversations] write error:", err.message));
}

function addConversation(phone, name, message, reply, source) {
  _cache.push({
    timestamp: new Date().toISOString(),
    phone,
    name: name || "Desconhecido",
    message,
    reply,
    source,
  });
  if (_cache.length > MAX_ENTRIES) {
    const pruned = _cache.length - MAX_ENTRIES;
    _cache = _cache.slice(-MAX_ENTRIES);
    console.warn(`[conversations] ${pruned} entradas antigas removidas (limite: ${MAX_ENTRIES}). Considere aumentar MAX_ENTRIES.`);
  }
  save(_cache);
}

function todayConversations() {
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });
  return _cache.filter((e) => {
    const local = new Date(e.timestamp).toLocaleDateString("sv-SE", {
      timeZone: "America/Sao_Paulo",
    });
    return local === today;
  });
}

function weekConversations() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const startOfWeek = new Date(now);
  // ISO week: Monday = 0 offset. getDay() returns 0=Sun,1=Mon...6=Sat
  const dayOfWeek = now.getDay();
  startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  startOfWeek.setHours(0, 0, 0, 0);
  return _cache.filter((e) => new Date(e.timestamp) >= startOfWeek);
}

function byPhone(phone) {
  return _cache.filter((e) => e.phone === phone);
}

function getAll() {
  return _cache;
}

module.exports = { addConversation, todayConversations, weekConversations, byPhone, getAll };
