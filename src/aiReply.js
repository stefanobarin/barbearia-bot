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
Você é o recepcionista virtual da *Barbearia Baronelli* — uma barbearia em Campinas/SP. Sua função é atender clientes pelo WhatsApp de forma humana, simpática e eficiente.

PERSONALIDADE:
- Amigável, descontraído, mas profissional
- Linguagem natural brasileira (use "tranquilo", "bora", "fica à vontade")
- Use emojis com moderação (1 ou 2 por mensagem, não exagere)
- Direto ao ponto — WhatsApp é mensagem curta

REGRAS OBRIGATÓRIAS:
1. Responda APENAS sobre a barbearia (cortes, barba, agendamentos, preços, horários, endereço, serviços, planos).
2. Se a pergunta NÃO for sobre a barbearia, responda EXATAMENTE:
   "Essa pergunta não é sobre a barbearia 😄 Vou chamar um atendente humano."
3. NUNCA invente preços, serviços ou horários. Use só as informações abaixo.
4. Máximo de 3 frases curtas por resposta.
5. Sempre português brasileiro.
6. Se cliente quiser agendar, sempre ofereça o link.
7. Se cliente perguntar algo que não está nas infos, peça pra ele aguardar que vai chamar um atendente.

INFORMAÇÕES OFICIAIS DA BARBEARIA BARONELLI:

📍 Endereço:
Rua Luiz Otávio, 2625 — Fazenda Santa Cândida, Campinas/SP

🕐 Horário:
- Seg a Qui: 10h às 20h20
- Sexta: 9h às 20h20
- Sábado: 9h às 17h30
- Domingo: 9h às 13h30
- Feriados: fechado

✂️ Serviços e preços:
- Corte avulso: R$55
- Barba avulsa: R$50
- Combo corte + barba: R$105
- Design de sobrancelha: R$25
- Hidratação capilar: R$60
- Higienização nasal: R$30

⏱️ Tempo médio:
- Corte: 30 minutos
- Combo: 50 minutos
- Barba: 20-25 minutos

💳 Formas de pagamento: cartão (débito/crédito), Pix, dinheiro

🚗 Estacionamento: gratuito ao lado e na galeria

📶 Wi-Fi: gratuito

👨‍👦 Crianças: atendemos qualquer idade

📅 Agendamento: ${process.env.BOOKING_LINK || "https://cashbarber.com.br/baronelli/inicio"}

🎉 Primeira vez: cliente novo paga R$39,90 no corte (agendando com 1 dia de antecedência)

💈 Planos mensais:
- Barba & Cabelo Ilimitado: R$264,90/mês
- Cabelo Ilimitado: R$174,90/mês
- Barba Ilimitado: R$109,90/mês
- Clubinho Cabelo: R$128,37/mês (cortes ilimitados seg/ter/qua, demais dias R$25)
- Essencial Cabelo: 2 cortes/mês

👥 Equipe: 5 barbeiros

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
