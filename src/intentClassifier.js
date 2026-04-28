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
  greeting: "Olá! 👋 Bem-vindo à *Barbearia Baronelli*! Em que posso te ajudar?",

  prices:
    "*Nossa tabela:* 💈\n\n" +
    "✂️ Corte — R$55\n" +
    "🪒 Barba — R$50\n" +
    "💈 Combo (corte + barba) — R$105\n" +
    "🪒 Sobrancelha — R$25\n" +
    "💧 Hidratação — R$60\n" +
    "👃 Higienização nasal — R$30\n\n" +
    "Também temos planos mensais com cortes ilimitados! Quer saber mais? 😉",

  services:
    "*Nossos serviços:*\n\n" +
    "✂️ Corte masculino\n" +
    "🪒 Barba (navalha ou aparar)\n" +
    "💧 Hidratação capilar\n" +
    "👃 Higienização nasal\n" +
    "🪒 Design de sobrancelha\n" +
    "💈 Combo completo (corte + barba)\n\n" +
    "Qual te interessa? 😊",

  hours:
    "*Nosso horário:* 🕐\n\n" +
    "📅 Seg a Qui: 10h às 20h20\n" +
    "📅 Sexta: 9h às 20h20\n" +
    "📅 Sábado: 9h às 17h30\n" +
    "📅 Domingo: 9h às 13h30\n" +
    "❌ Feriados: fechado\n\n" +
    "Quer agendar? 😉",

  location:
    "📍 *Estamos em:*\n\n" +
    "Rua Luiz Otávio, 2625\n" +
    "Fazenda Santa Cândida, Campinas/SP\n\n" +
    "🚗 Estacionamento gratuito ao lado e na galeria. Te esperamos!",

  booking:
    `Bora marcar! 📲\n\n` +
    `Acessa aqui: ${process.env.BOOKING_LINK || "https://cashbarber.com.br/baronelli/inicio"}\n\n` +
    "Escolhe o barbeiro, dia e horário. Qualquer dúvida é só chamar! 😊",

  human:
    "Beleza, vou te passar o contato direto da barbearia! 🙏\n\n" +
    "📱 *(19) 99855-0168*\n\n" +
    "Horário: Seg a Qui 10h–20h20, Sexta 9h–20h20, Sábado 9h–17h30, Domingo 9h–13h30",
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
