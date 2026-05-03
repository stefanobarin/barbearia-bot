// ─────────────────────────────────────────────────────────────
//  FAQ Matcher
//
//  Lê o arquivo faq.json e verifica se a mensagem do cliente
//  combina com alguma pergunta frequente.
//
//  Como usar: edite o arquivo faq.json na raiz do projeto.
//  Não precisa mexer neste arquivo.
// ─────────────────────────────────────────────────────────────
const path = require("path");
const fs   = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
const faqPath = path.join(DATA_DIR, "faq.json");
const seedPath = path.join(__dirname, "..", "faq.json");
let faqEntries = [];
let tokenizedFaq = []; // pre-computed per entry to avoid re-tokenizing on every message

function loadFaq() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(faqPath) && fs.existsSync(seedPath)) {
      fs.copyFileSync(seedPath, faqPath);
    }
    faqEntries = JSON.parse(fs.readFileSync(faqPath, "utf-8"));
    rebuildTokenized();
    console.log(`[faq] ${faqEntries.length} entradas carregadas de ${faqPath}`);
  } catch (err) {
    console.warn("[faq] Não foi possível carregar faq.json:", err.message);
  }
}

loadFaq();

const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "no", "na", "nos", "nas",
  "em", "um", "uma", "uns", "umas", "que", "por", "com", "sem",
  "seu", "sua", "seus", "suas", "pra", "pro", "para", "qual",
  "tem", "ter", "ser", "esta", "isso", "esse", "essa", "como",
  "quais", "quando", "onde", "quanto", "voce", "voces",
]);

const MATCH_THRESHOLD = 0.5;

function norm(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function tokenize(str) {
  return norm(str)
    .split(/\W+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function rebuildTokenized() {
  tokenizedFaq = faqEntries.map((e) => ({
    norm: norm(e.pergunta),
    tokens: tokenize(e.pergunta),
  }));
}

/**
 * Verifica se a mensagem do cliente combina com alguma pergunta do FAQ.
 * Usa score ≥ 50%: metade das palavras-chave devem aparecer.
 * Normaliza acentos: "horário" bate com "horario".
 *
 * @param {string} text - mensagem do cliente
 * @returns {string|null}
 */
function matchFaq(text) {
  const msgNorm = norm(text);
  const msgTokens = tokenize(text);

  let bestScore = 0;
  let bestEntry = null;

  for (let i = 0; i < faqEntries.length; i++) {
    const { norm: faqNorm, tokens: faqTokens } = tokenizedFaq[i];

    // Frase exata → score máximo, para imediatamente
    if (msgNorm.includes(faqNorm)) {
      bestEntry = faqEntries[i];
      bestScore = 1;
      break;
    }

    if (faqTokens.length === 0) continue;

    const matched = faqTokens.filter((kw) =>
      msgNorm.includes(kw) ||
      msgTokens.some((mt) => {
        const minLen = Math.min(kw.length, mt.length);
        return minLen >= 4 && (kw.startsWith(mt.slice(0, minLen)) || mt.startsWith(kw.slice(0, minLen)));
      })
    ).length;
    const score = matched / faqTokens.length;

    if (score > bestScore) {
      bestScore = score;
      bestEntry = faqEntries[i];
    }
  }

  if (bestScore >= MATCH_THRESHOLD && bestEntry) {
    return bestEntry.resposta;
  }

  return null;
}

/**
 * Retorna todas as entradas do FAQ como texto para injetar no prompt do Claude.
 *
 * @returns {string}
 */
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
  rebuildTokenized();
  writeFaq();
}

function removeFaqEntry(index) {
  faqEntries.splice(index, 1);
  rebuildTokenized();
  writeFaq();
}

function updateFaqEntry(index, pergunta, resposta) {
  if (index < 0 || index >= faqEntries.length) return;
  faqEntries[index] = { pergunta: pergunta.trim(), resposta: resposta.trim() };
  rebuildTokenized();
  writeFaq();
}

function resetFaqFromSeed() {
  if (!fs.existsSync(seedPath)) return false;
  fs.copyFileSync(seedPath, faqPath);
  loadFaq();
  return true;
}

module.exports = {
  matchFaq,
  getFaqContext,
  getAll,
  addFaqEntry,
  removeFaqEntry,
  updateFaqEntry,
  resetFaqFromSeed,
};
