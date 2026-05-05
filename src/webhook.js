// ─────────────────────────────────────────────────────────────
//  Webhook router
//
//  GET  /webhook  — Meta verification handshake
//  POST /webhook  — Incoming WhatsApp messages
// ─────────────────────────────────────────────────────────────
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const { classifyIntent, buildReply } = require("./intentClassifier");
// faqMatcher não é mais usado no pipeline — FAQ injetado no system prompt do Claude
const { aiReply } = require("./aiReply");
const { sendMessage } = require("./whatsapp");
const { addConversation } = require("./conversations");
const { sendAlert } = require("./alerts");
const { downloadWhatsAppMedia } = require("./media");
const { maskPhone } = require("./utils");
const { addMessage, clearHistory } = require("./memory");
const { addFaqEntry } = require("./faqMatcher");

const TRAINER_PHONES = new Set(
  (process.env.TRAINER_PHONES || process.env.TRAINER_PHONE || "")
    .split(",").map(p => p.trim()).filter(Boolean)
);

function truncate(s, n = 80) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function verifySignature(req) {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) return false;
  const sig = req.headers["x-hub-signature-256"];
  if (!sig || !req.rawBody) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── GET: Meta verifies the webhook URL when you register it ──
router.get("/", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("[webhook] Verification successful");
    return res.status(200).send(challenge);
  }

  console.warn("[webhook] Verification failed — token mismatch");
  return res.sendStatus(403);
});

// ── POST: Real messages arrive here ──────────────────────────
router.post("/", async (req, res) => {
  if (!verifySignature(req)) {
    console.warn("[webhook] Invalid HMAC signature — request rejected");
    return res.sendStatus(403);
  }

  // Always acknowledge immediately — Meta will retry if we don't reply fast
  res.sendStatus(200);

  const entries = req.body?.entry || [];
  for (const entry of entries) {
    for (const change of (entry?.changes || [])) {
      const value    = change?.value;
      const messages = value?.messages || [];
      const contacts = value?.contacts || [];

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const contact = contacts[i] || contacts[0];
        processIncoming(message, contact).catch((err) => {
          console.error("[webhook] Error processing message:", err.message);
          sendAlert("webhook_error", `⚠️ Erro ao processar mensagem:\n${err.message}`);
        });
      }
    }
  }
});

// ── Trainer commands (owner only) ─────────────────────────────
async function handleTrainerCommand(phone, text) {
  const cmd = text.trim();

  if (cmd === "!help") {
    await sendMessage(phone,
      "*Comandos do modo treino:*\n\n" +
      "`!add pergunta | resposta` — adiciona entrada no FAQ\n" +
      "`!reset` — limpa histórico desta conversa\n" +
      "`!help` — mostra este menu\n\n" +
      "Mensagens normais são tratadas como cliente (para testes)."
    );
    return true;
  }

  if (cmd === "!reset") {
    clearHistory(phone);
    await sendMessage(phone, "✅ Histórico limpo.");
    return true;
  }

  if (cmd.startsWith("!add ")) {
    const parts = cmd.slice(5).split("|");
    if (parts.length < 2) {
      await sendMessage(phone, "❌ Formato: `!add pergunta | resposta`");
      return true;
    }
    const pergunta = parts[0].trim();
    const resposta = parts.slice(1).join("|").trim();
    addFaqEntry(pergunta, resposta);
    await sendMessage(phone, `✅ FAQ adicionado:\n\n*P:* ${pergunta}\n*R:* ${resposta}`);
    return true;
  }

  if (cmd.startsWith("!")) {
    await sendMessage(phone, "❓ Comando não reconhecido. Use `!help` para ver os disponíveis.");
    return true;
  }

  return false; // not a command — process as normal message
}

// ── Per-message processing ────────────────────────────────────
async function processIncoming(message, contact) {
  if (!message) return;

  const phone = message.from;
  const name  = contact?.profile?.name || "Desconhecido";

  let text = "";
  let image = null;

  if (message.type === "text") {
    text = message.text.body.trim();
  } else if (message.type === "image") {
    const mediaId = message.image?.id;
    const caption = message.image?.caption?.trim() || "";

    if (!mediaId) {
      console.warn(`[webhook] Imagem sem ID — ignorando`);
      return;
    }

    try {
      console.log(`[webhook] Baixando imagem de ${maskPhone(phone)}...`);
      image = await downloadWhatsAppMedia(mediaId);
      text = caption;
      console.log(`[webhook] Imagem baixada (${image.mimeType}, ${(image.data.length * 0.75 / 1024).toFixed(0)}KB)`);
    } catch (err) {
      console.error(`[webhook] Falha ao baixar imagem:`, err.message);
      await sendMessage(phone, "Ops, não consegui baixar sua imagem 😬 Manda de novo ou descreve em texto?");
      return;
    }
  } else {
    console.log(`[webhook] Tipo não suportado: ${message.type}`);
    await sendMessage(phone,
      "Oi! Aqui só processo *texto* e *imagens* 📸\n\n" +
      "Se preferir falar com atendente humano, é só mandar 'atendente'."
    );
    return;
  }

  const logPreview = image ? `[imagem] ${truncate(text) || "(sem legenda)"}` : truncate(text);
  console.log(`[webhook] Message from ${maskPhone(phone)}: "${logPreview}"`);

  // Trainer mode: owner can send !commands to teach the bot
  if (TRAINER_PHONES.size > 0 && TRAINER_PHONES.has(phone) && !image) {
    const handled = await handleTrainerCommand(phone, text);
    if (handled) return;
    // Not a command — fall through to normal bot response (for testing)
  }

  const { reply, source } = await handleMessage(phone, text, image);
  await sendMessage(phone, reply);
  addConversation(phone, name, image ? `[imagem] ${text || "(sem legenda)"}` : text, reply, source);

  console.log(`[webhook] Replied to ${maskPhone(phone)} (${source})`);

  if (source === "human" && process.env.BARBERSHOP_PHONE) {
    const alert =
      `🆘 *Cliente quer atendimento humano*\n\n` +
      `👤 ${name}\n` +
      `📱 +${phone}\n` +
      `💬 "${text}"\n\n` +
      `Responda direto pelo WhatsApp.`;
    try {
      await sendMessage(process.env.BARBERSHOP_PHONE, alert);
      console.log(`[webhook] Escalation sent to barbershop`);
    } catch (e) {
      console.error("[webhook] Failed to notify barbershop:", e.message);
    }
  }
}

// ── Core message-handling logic ───────────────────────────────
async function handleMessage(phone, text, image = null) {
  if (image) {
    const aiAnswer = await aiReply(phone, text, image);
    return { reply: aiAnswer, source: "ai_vision" };
  }

  // Escalação humana: único intent mantido para disparar alerta
  const intent = classifyIntent(text);
  if (intent === "human") {
    const reply = buildReply("human");
    addMessage(phone, "user", text);
    addMessage(phone, "assistant", reply);
    return { reply, source: "human" };
  }

  // Tudo o mais vai direto pro Claude
  const aiAnswer = await aiReply(phone, text);
  return { reply: aiAnswer, source: "ai" };
}

module.exports = router;
