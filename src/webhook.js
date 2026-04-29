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
const { matchFaq } = require("./faqMatcher");
const { aiReply } = require("./aiReply");
const { sendMessage } = require("./whatsapp");
const { addConversation } = require("./conversations");
const { sendAlert } = require("./alerts");
const { downloadWhatsAppMedia } = require("./media");

function maskPhone(p) {
  if (!p || p.length < 6) return "***";
  return p.slice(0, 4) + "****" + p.slice(-2);
}

function truncate(s, n = 80) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function verifySignature(req) {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) return true; // sem secret configurado, libera (transição)
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

  try {
    const entry   = req.body?.entry?.[0];
    const change  = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    const contact = change?.contacts?.[0];

    if (!message) return;

    const phone = message.from;
    const name  = contact?.profile?.name || "Desconhecido";

    // ── Tipos suportados: text, image ──────────────────────────
    let text = "";
    let image = null;

    if (message.type === "text") {
      text = message.text.body.trim();
    } else if (message.type === "image") {
      // Cliente mandou imagem — baixa e processa via Claude Vision
      const mediaId = message.image?.id;
      const caption = message.image?.caption?.trim() || "";

      if (!mediaId) {
        console.warn(`[webhook] Imagem sem ID — ignorando`);
        return;
      }

      try {
        console.log(`[webhook] Baixando imagem de ${maskPhone(phone)}...`);
        image = await downloadWhatsAppMedia(mediaId);
        text = caption; // legenda da imagem (pode ser vazia)
        console.log(`[webhook] Imagem baixada (${image.mimeType}, ${(image.data.length * 0.75 / 1024).toFixed(0)}KB)`);
      } catch (err) {
        console.error(`[webhook] Falha ao baixar imagem:`, err.message);
        await sendMessage(phone, "Ops, não consegui baixar sua imagem 😬 Manda de novo ou descreve em texto?");
        return;
      }
    } else {
      // Tipos não suportados (audio, video, document, sticker, location)
      console.log(`[webhook] Tipo não suportado: ${message.type}`);
      await sendMessage(phone,
        "Oi! Aqui só processo *texto* e *imagens* 📸\n\n" +
        "Se preferir falar com atendente humano, é só mandar 'atendente'."
      );
      return;
    }

    const logPreview = image ? `[imagem] ${truncate(text) || "(sem legenda)"}` : truncate(text);
    console.log(`[webhook] Message from ${maskPhone(phone)}: "${logPreview}"`);

    const { reply, source } = await handleMessage(phone, text, image);
    await sendMessage(phone, reply);
    addConversation(phone, name, image ? `[imagem] ${text || "(sem legenda)"}` : text, reply, source);

    console.log(`[webhook] Replied to ${maskPhone(phone)} (${source})`);

    // Escalação: cliente pediu atendente humano → avisa a barbearia
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
  } catch (err) {
    console.error("[webhook] Error processing message:", err.message);
    sendAlert("webhook_error", `⚠️ Erro ao processar mensagem do cliente:\n${err.message}`);
  }
});

// ── Core message-handling logic ───────────────────────────────
async function handleMessage(phone, text, image = null) {
  // Se tem imagem, vai DIRETO pra IA (vision) — pula intent/FAQ
  if (image) {
    const aiAnswer = await aiReply(phone, text, image);
    return { reply: aiAnswer, source: "ai_vision" };
  }

  // Sem imagem: pipeline normal (intent → FAQ → IA)
  const intent = classifyIntent(text);
  if (intent) return { reply: buildReply(intent), source: intent };

  const faqAnswer = matchFaq(text);
  if (faqAnswer) return { reply: faqAnswer, source: "faq" };

  const aiAnswer = await aiReply(phone, text);
  return { reply: aiAnswer, source: "ai" };
}

module.exports = router;
