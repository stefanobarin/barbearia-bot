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
    "oie", "oii", "oiee", "opa", "salve", "fala", "blz", "blza",
  ],
  prices: [
    "preço", "preco", "valor", "quanto", "custa", "tabela",
    "preços", "precos", "lista de preço", "lista de preco",
    "qual o preço", "qual é o preço", "quanto sai", "quanto fica",
    "qual valor", "table de preço", "table de preco", "promoção", "promocao",
  ],
  services: [
    "serviço", "servico", "serviços", "servicos",
    "o que faz", "que serviço", "que tipo", "o que vocês fazem",
    "o que voces fazem", "fazem o que", "qual é o serviço",
    "que tipos de corte", "que tipos de barba", "oferece",
  ],
  hours: [
    "horário", "horario", "hora", "abre", "fecha", "funciona",
    "atende", "expediente", "aberto", "fechado", "quando abre",
    "qual o horário", "qual o horario", "até que horas", "a que horas",
    "de segunda", "de seg", "de sexta", "sabado", "sábado", "domingo",
  ],
  location: [
    "endereço", "endereco", "onde", "localização", "localizacao",
    "fica", "bairro", "rua", "como chegar", "chegar",
    "qual o endereço", "qual o endereco", "localizado", "localizado onde",
    "qual a rua", "qual é a rua", "mapa", "gps", "perto",
  ],
  booking: [
    "agendar", "agendamento", "marcar", "reservar", "horário livre",
    "horario livre", "vaga", "disponível", "disponivel", "agenda",
    "quero cortar", "quero marcar", "quanto custa", "como agendar",
    "como marcar", "agendar um corte", "marcar um horario", "marcar um horário",
    "qual o link", "como agendar online", "agora", "urgente",
  ],
  human: [
    // ────────────────────────────────────────────────────────
    // REDUNDÂNCIA ABSOLUTA: capturar TODA variação de "quero falar com humano"
    // Simples: uma palavra isolada ou no meio da frase
    "atendente", "atendentes",
    "humano", "humana", "humanidade",
    "pessoa", "pessoal", "pessoas",

    // Variações com "falar com"
    "falar com alguém", "falar com alguem", "falar com pessoa",
    "falar com humano", "falar com atendente", "falar com gerente",
    "falar com responsavel", "falar com responsável",

    // Variações com "quero"
    "quero falar", "quero atendimento", "quero pessoal",
    "quero humano", "quero atender", "quero ser atendido",
    "quero ser atendida", "quero uma pessoa",

    // Variações com "preciso"
    "preciso de atendente", "preciso de humano", "preciso de pessoa",
    "preciso falar", "preciso atender",

    // Variações com negação/frustração (cliente quer desistir do bot)
    "ninguém me ajuda", "ninguem me ajuda", "não me ajuda", "nao me ajuda",
    "não tá funcionando", "nao ta funcionando", "não funciona",
    "tá errado", "ta errado", "erro", "problma", "problema",
    "não entendi", "nao entendi", "não entendo", "nao entendo",

    // Gerente/suporte
    "gerente", "supervisor", "responsável", "responsavel",
    "suporte", "support", "help", "ajuda",

    // Direto ao ponto
    "me ajuda", "me ajude", "ajuda aí", "ajuda ai",
    "vcs", "vocês", "can you help", "pode me ajudar",

    // Escalação explícita
    "escalação", "escalacao", "escalar", "elevar",
    "falar com o dono", "falar com dono", "falar com chefe",
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
 * Prioriza "human" (atendente) porque cliente quer sair do bot.
 * Detecta isoladamente: "atendente", "humano", "ajuda", "pessoa".
 *
 * @param {string} text
 * @returns {string|null}
 */
function classifyIntent(text) {
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\s+/);

  // ── Prioridade 1: "human" — cliente quer falar com humano ──────
  // Se encontra qualquer keyword de "human", RETORNA IMEDIATAMENTE
  // (não deixa outro intent como "greeting" + "atendente" ganhar)
  for (const keyword of INTENTS.human) {
    if (normalized.includes(keyword)) {
      return "human";
    }
  }

  // ── Prioridade 2: outras intents (em ordem) ──────────────────
  // Mas NÃO "human" pois já foi checado acima
  for (const [intent, keywords] of Object.entries(INTENTS)) {
    if (intent === "human") continue; // já processado

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
