// FAQ store — used for:
//   1. getFaqContext(): inject FAQ into Claude's system prompt
//   2. Trainer commands (!fix, !add): CRUD on faq.json

const path = require("path");
const fs   = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
const faqPath  = path.join(DATA_DIR, "faq.json");
const seedPath = path.join(__dirname, "..", "faq.json");
let faqEntries = [];

function loadFaq() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(faqPath) && fs.existsSync(seedPath)) {
      fs.copyFileSync(seedPath, faqPath);
    }
    faqEntries = JSON.parse(fs.readFileSync(faqPath, "utf-8"));
    console.log(`[faq] ${faqEntries.length} entradas carregadas de ${faqPath}`);
  } catch (err) {
    console.warn("[faq] Não foi possível carregar faq.json:", err.message);
  }
}

loadFaq();

function getFaqContext() {
  if (faqEntries.length === 0) return "";
  const lines = faqEntries
    .map((e) => `- Pergunta: "${e.pergunta}" → Resposta: "${e.resposta}"`)
    .join("\n");
  return `\nPERGUNTAS FREQUENTES DA BARBEARIA:\n${lines}`;
}

function getAll() {
  return faqEntries;
}

function writeFaq() {
  fs.promises.writeFile(faqPath, JSON.stringify(faqEntries, null, 2))
    .catch(err => console.error("[faq] write error:", err.message));
}

function addFaqEntry(pergunta, resposta) {
  faqEntries.push({ pergunta: pergunta.trim(), resposta: resposta.trim() });
  writeFaq();
}

function removeFaqEntry(index) {
  faqEntries.splice(index, 1);
  writeFaq();
}

function updateFaqEntry(index, pergunta, resposta) {
  if (index < 0 || index >= faqEntries.length) return;
  faqEntries[index] = { pergunta: pergunta.trim(), resposta: resposta.trim() };
  writeFaq();
}

function resetFaqFromSeed() {
  if (!fs.existsSync(seedPath)) return false;
  fs.copyFileSync(seedPath, faqPath);
  loadFaq();
  return true;
}

module.exports = { getFaqContext, getAll, addFaqEntry, removeFaqEntry, updateFaqEntry, resetFaqFromSeed };
