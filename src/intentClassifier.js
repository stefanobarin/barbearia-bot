// Intent classifier — only "human" escalation is handled here.
// All other intents (prices, hours, etc.) go straight to Claude.

const HUMAN_KEYWORDS = [
  "atendente", "atendentes",
  "humano", "humana",
  "pessoa", "pessoal", "pessoas",
  "falar com",
  "falar com alguém", "falar com alguem", "falar com pessoa",
  "falar com humano", "falar com atendente", "falar com gerente",
  "falar com responsavel", "falar com responsável",
  "quero falar", "quero atendimento", "quero humano",
  "quero ser atendido", "quero ser atendida", "quero uma pessoa",
  "preciso de atendente", "preciso de humano", "preciso de pessoa",
  "preciso falar",
  "ninguém me ajuda", "ninguem me ajuda",
  "gerente", "supervisor", "responsável", "responsavel",
  "suporte", "support",
  "escalação", "escalacao", "escalar",
  "falar com o dono", "falar com dono", "falar com chefe",
];

const HUMAN_REPLY =
  "Claro! Contato direto da barbearia:\n\n" +
  "*(19) 99855-0168*\n\n" +
  "Seg a Qui 10h–20h20, Sexta 9h–20h20, Sábado 9h–17h30, Domingo 9h–13h30";

function classifyIntent(text) {
  const normalized = text.toLowerCase().trim();
  for (const keyword of HUMAN_KEYWORDS) {
    if (normalized.includes(keyword)) return "human";
  }
  return null;
}

function buildReply(intent) {
  if (intent === "human") return HUMAN_REPLY;
  return "Como posso te ajudar?";
}

module.exports = { classifyIntent, buildReply };
