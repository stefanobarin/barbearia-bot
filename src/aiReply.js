// ─────────────────────────────────────────────────────────────
//  AI fallback — Claude Haiku via Anthropic SDK
//
//  Called when the intent classifier returns null.
//  Claude is given a strict system prompt that:
//    1. Keeps it on barbershop topics only
//    2. Enforces Brazilian Portuguese
//    3. Returns a specific out-of-scope message for off-topic questions
// ─────────────────────────────────────────────────────────────
const Anthropic = require("@anthropic-ai/sdk");
const { getHistory, addMessage } = require("./memory");
const { getFaqContext } = require("./faqMatcher");

const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── System prompt (montado em tempo de execução para incluir o FAQ) ──
function buildSystemPrompt() {
  return `
Você é um recepcionista virtual simpático de uma barbearia brasileira chamada "Barbearia".

REGRAS OBRIGATÓRIAS:
1. Responda APENAS perguntas relacionadas à barbearia (cortes, barba, agendamentos, preços, horários, localização, serviços).
2. Se a pergunta NÃO for sobre a barbearia, responda EXATAMENTE esta frase (sem alterar nada):
   "Essa pergunta não é sobre a barbearia 😄 Vou chamar um atendente humano."
3. Nunca invente preços ou serviços. Use somente as informações abaixo.
4. Seja amigável, curto e natural. Máximo de 3 frases por resposta.
5. Fale sempre em português brasileiro.

INFORMAÇÕES DA BARBEARIA:
- Serviços: corte masculino, barba (navalha ou aparar), acabamento, combo completo
- Preços: Corte R$45 | Barba R$35 | Combo R$70
- Horário: Seg–Sex 9h–20h | Sábado 9h–18h | Domingo fechado
- Localização: centro da cidade (endereço exato via atendente)
- Agendamento: ${process.env.BOOKING_LINK || "https://link-do-app"}
${getFaqContext()}
`.trim();
}

/**
 * Generates an AI reply using Claude Haiku with conversation history.
 *
 * @param {string} phone  — user's phone number (used as history key)
 * @param {string} text   — the user's message
 * @returns {Promise<string>}
 */
async function aiReply(phone, text) {
  // Save the user turn before calling the API
  addMessage(phone, "user", text);

  const history = getHistory(phone);

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,          // keep replies short and cheap
      system: buildSystemPrompt(),
      messages: history,        // full conversation context
    });

    const reply = response.content[0].text.trim();

    // Save the assistant turn so the next message has context
    addMessage(phone, "assistant", reply);

    return reply;
  } catch (err) {
    console.error("[aiReply] Claude API error:", err.message);

    // Safe fallback — never leave the user hanging
    return "Desculpe, tive um problema técnico. Um atendente humano vai te ajudar em breve!";
  }
}

module.exports = { aiReply };
