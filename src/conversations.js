// Conversation persistence — in-memory cache backed by JSON on disk.
// hasPhone() is O(1) via Set — used in hot path for first-contact detection.

const fs   = require("fs");
const path = require("path");

const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, "..");
const FILE        = path.join(DATA_DIR, "conversations.json");
const MAX_ENTRIES = 5000;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

let _writeQueue = Promise.resolve();

function load() {
  try {
    const raw  = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw);
    console.log(`[conversations] ${data.length} entradas carregadas de ${FILE}`);
    return data;
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`[conversations] falha ao carregar ${FILE}: ${err.message}`);
    } else {
      console.log(`[conversations] ${FILE} não encontrado — iniciando vazio`);
    }
    return [];
  }
}

let _cache    = load();
let _phoneSet = new Set(_cache.map(c => c.phone)); // O(1) first-contact lookup

function save(entries) {
  const data = JSON.stringify(entries, null, 2);
  _writeQueue = _writeQueue
    .then(() => fs.promises.writeFile(FILE, data))
    .catch((err) => console.error("[conversations] write error:", err.message));
}

function addConversation(phone, name, message, reply, source, wamid) {
  _phoneSet.add(phone);
  _cache.push({
    timestamp: new Date().toISOString(),
    phone,
    name: name || "Desconhecido",
    message,
    reply,
    source,
    wamid: wamid || null,
    readAt: null,
  });
  if (_cache.length > MAX_ENTRIES) {
    const pruned = _cache.length - MAX_ENTRIES;
    _cache = _cache.slice(-MAX_ENTRIES);
    console.warn(`[conversations] ${pruned} entradas antigas removidas (limite: ${MAX_ENTRIES}).`);
  }
  save(_cache);
}

function markRead(wamid) {
  if (!wamid) return;
  const entry = _cache.find(e => e.wamid === wamid);
  if (!entry || entry.readAt) return;
  entry.readAt = new Date().toISOString();
  save(_cache);
  console.log(`[conversations] readAt set for wamid ${wamid}`);
}

// O(1) — used in webhook hot path
function hasPhone(phone) {
  return _phoneSet.has(phone);
}

function todayConversations() {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return _cache.filter((e) => {
    const local = new Date(e.timestamp).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return local === today;
  });
}

function weekConversations() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const startOfWeek = new Date(now);
  const dayOfWeek   = now.getDay();
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

module.exports = { addConversation, markRead, hasPhone, todayConversations, weekConversations, byPhone, getAll };
