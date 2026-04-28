// ─────────────────────────────────────────────────────────────
//  Intent classifier
//
//  Checks the user's message against keyword lists.
//  Returns an intent string if matched, or null if the AI
//  should handle it.
// ─────────────────────────────────────────────────────────────

// ── Keyword maps (lowercase) ──────────────────────────────────
const INTENTS = {
  greeting: [
    "oi", "olá", "ola", "bom dia", "boa tarde", "boa noite",
    "hey", "hello", "eai", "e aí", "tudo bem", "tudo bom",
  ],
  prices: [
    "preço", "preco", "valor", "quanto", "custa", "tabela",
    "preços", "precos", "lista de preço", "lista de preco",
  ],
  services: [
    "serviço", "servico", "serviços", "servicos",
    "o que faz", "que serviço", "que tipo", "o que vocês fazem",
    "o que voces fazem", "fazem o que",
  ],
  hours: [
    "horário", "horario", "hora", "abre", "fecha", "funciona",
    "atende", "expediente", "aberto", "fechado", "quando abre",
  ],
  location: [
    "endereço", "endereco", "onde", "localização", "localizacao",
    "fica", "bairro", "rua", "como chegar", "chegar",
  ],
  booking: [
    "agendar", "agendamento", "marcar", "reservar", "horário livre",
    "horario livre", "vaga", "disponível", "disponivel", "agenda",
    "quero cortar", "quero marcar",
  ],
  human: [
    "atendente", "humano", "pessoa", "falar com alguém",
    "falar com alguem", "gerente", "responsável", "responsavel",
    "quero falar", "me ajuda", "ninguém me ajuda",
  ],
};

// ── Predefined replies ────────────────────────────────────────
const REPLIES = {
  greeting: "Olá! 👋 Bem-vindo à Barbearia! Como posso te ajudar hoje?",

  prices:
    "Nossos preços:\n\n" +
    "✂️  Corte: R$45\n" +
    "🪒  Barba: R$35\n" +
    "💈  Combo (corte + barba): R$70\n\n" +
    "Quer agendar? É só pedir!",

  services:
    "Nossos serviços:\n\n" +
    "✂️  Corte masculino\n" +
    "🪒  Barba (navalha ou aparar)\n" +
    "✨  Acabamento\n" +
    "💈  Combo completo\n\n" +
    "Qual te interessa?",

  hours:
    "Nosso horário de atendimento:\n\n" +
    "📅  Seg – Sex: 9h às 20h\n" +
    "📅  Sábado: 9h às 18h\n" +
    "❌  Domingo: fechado\n\n" +
    "Quer marcar um horário?",

  location:
    "📍 Estamos no centro da cidade.\n" +
    "Manda mensagem para confirmar o endereço exato com um de nossos atendentes!",

  booking:
    `Para agendar seu horário, acesse o link abaixo:\n\n` +
    `📲 ${process.env.BOOKING_LINK || "https://link-do-app"}\n\n` +
    "É rápido e fácil! Qualquer dúvida, é só perguntar 😊",

  human:
    "Entendido! Para falar diretamente com a Barbearia Baronelli, chame pelo WhatsApp:\n\n" +
    "📱 *(19) 99855-0168*\n\n" +
    "Nosso horário de atendimento:\n" +
    "📅 Seg–Sex: 9h às 20h · Sáb: 9h às 18h 🙏",
};

// ── Classifier ────────────────────────────────────────────────

/**
 * Returns an intent key if any keyword matches the message,
 * or null if the AI fallback should handle it.
 *
 * @param {string} text
 * @returns {string|null}
 */
function classifyIntent(text) {
  const normalized = text.toLowerCase().trim();

  for (const [intent, keywords] of Object.entries(INTENTS)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        return intent;
      }
    }
  }

  return null;
}

/**
 * Returns the predefined reply string for a known intent.
 *
 * @param {string} intent
 * @returns {string}
 */
function buildReply(intent) {
  return REPLIES[intent] ?? "Como posso te ajudar?";
}

module.exports = { classifyIntent, buildReply };
