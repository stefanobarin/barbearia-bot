// ─────────────────────────────────────────────────────────────
//  Webhook router
//
//  GET  /webhook  — Meta verification handshake
//  POST /webhook  — Incoming WhatsApp messages
// ─────────────────────────────────────────────────────────────
const express = require("express");
const router = express.Router();

const { classifyIntent, buildReply } = require("./intentClassifier");
const { matchFaq } = require("./faqMatcher");
const { aiReply } = require("./aiReply");
const { sendMessage } = require("./whatsapp");
const { addConversation } = require("./conversations");

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
  // Always acknowledge immediately — Meta will retry if we don't reply fast
  res.sendStatus(200);

  try {
    const entry   = req.body?.entry?.[0];
    const change  = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    const contact = change?.contacts?.[0];

    if (!message) return;
    if (message.type !== "text") return;

    const phone = message.from;
    const name  = contact?.profile?.name || "Desconhecido";
    const text  = message.text.body.trim();

    console.log(`[webhook] Message from ${phone}: "${text}"`);

    const { reply, source } = await handleMessage(phone, text);
    await sendMessage(phone, reply);
    addConversation(phone, name, text, reply, source);

    console.log(`[webhook] Replied to ${phone}: "${reply}"`);

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
  }
});

// ── Core message-handling logic ───────────────────────────────
async function handleMessage(phone, text) {
  const intent = classifyIntent(text);
  if (intent) return { reply: buildReply(intent), source: intent };

  const faqAnswer = matchFaq(text);
  if (faqAnswer) return { reply: faqAnswer, source: "faq" };

  const aiAnswer = await aiReply(phone, text);
  return { reply: aiAnswer, source: "ai" };
}

module.exports = router;
