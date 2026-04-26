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

// Carrega o FAQ do disco uma vez ao iniciar (sem custo de I/O repetido)
let faqEntries = [];

try {
  const faqPath = path.join(__dirname, "..", "faq.json");
  faqEntries = JSON.parse(fs.readFileSync(faqPath, "utf-8"));
  console.log(`[faq] ${faqEntries.length} entradas carregadas.`);
} catch (err) {
  console.warn("[faq] Não foi possível carregar faq.json:", err.message);
}

/**
 * Verifica se a mensagem do cliente contém palavras de alguma pergunta do FAQ.
 * Retorna a resposta se encontrar, ou null se não encontrar.
 *
 * @param {string} text - mensagem do cliente
 * @returns {string|null}
 */
function matchFaq(text) {
  const normalized = text.toLowerCase().trim();

  for (const entry of faqEntries) {
    // Divide a pergunta do FAQ em palavras-chave e verifica se todas aparecem na mensagem
    const keywords = entry.pergunta
      .toLowerCase()
      .split(" ")
      .filter((w) => w.length > 3); // ignora palavras curtas como "tem", "ou"

    const matched = keywords.every((kw) => normalized.includes(kw));

    if (matched) {
      // Se a resposta menciona o link de agendamento, coloca o real
      const resposta = entry.resposta.includes("pelo link: ")
        ? entry.resposta + (process.env.BOOKING_LINK || "https://link-do-app")
        : entry.resposta;

      return resposta;
    }
  }

  return null;
}

/**
 * Retorna todas as entradas do FAQ como texto para injetar no prompt do Claude.
 * Assim o Claude também conhece o FAQ para perguntas parecidas.
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

module.exports = { matchFaq, getFaqContext };
