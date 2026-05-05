// ─────────────────────────────────────────────────────────────
//  Conversation memory — persisted to disk per user
//
//  Stores the last MAX_MESSAGES exchanges so Claude has context.
//  Survives server restarts via /data/memory.json.
// ─────────────────────────────────────────────────────────────
const fs   = require("fs");
const path = require("path");

const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, "..");
const FILE      = path.join(DATA_DIR, "memory.json");
const MAX_MESSAGES = 10; // last 10 turns per user (5 exchanges)

// Map<phone, Array<{role, content}>>
let store = new Map();

let _writeQueue = Promise.resolve();

function loadFromDisk() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    for (const [phone, history] of Object.entries(raw)) {
      store.set(phone, history);
    }
    console.log(`[memory] ${store.size} históricos carregados`);
  } catch {
    // file doesn't exist yet — start fresh
  }
}

function saveToDisk() {
  const obj = {};
  for (const [phone, history] of store.entries()) {
    obj[phone] = history;
  }
  const data = JSON.stringify(obj);
  _writeQueue = _writeQueue
    .then(() => fs.promises.writeFile(FILE, data))
    .catch(err => console.error("[memory] write error:", err.message));
}

loadFromDisk();

function getHistory(phone) {
  if (!store.has(phone)) store.set(phone, []);
  return store.get(phone);
}

function addMessage(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });
  if (history.length > MAX_MESSAGES) {
    history.splice(0, history.length - MAX_MESSAGES);
  }
  saveToDisk();
}

function clearHistory(phone) {
  store.delete(phone);
  saveToDisk();
}

module.exports = { getHistory, addMessage, clearHistory };
