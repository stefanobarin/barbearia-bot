// ─────────────────────────────────────────────────────────────
//  Persistência de conversas
//
//  Salva cada interação cliente↔bot num arquivo JSON.
//  Usado pelo painel /admin e pelo relatório diário.
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "conversations.json");
const MAX_ENTRIES = 5000;

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {
    return [];
  }
}

function save(entries) {
  const trimmed = entries.slice(-MAX_ENTRIES);
  fs.writeFileSync(FILE, JSON.stringify(trimmed, null, 2));
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

function getAll() {
  return load();
}

module.exports = { addConversation, todayConversations, getAll };
