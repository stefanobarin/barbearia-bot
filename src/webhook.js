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

    // Ignore delivery receipts, read receipts, and other status updates
    if (!message) return;

    // We only handle plain text messages for now
    if (message.type !== "text") return;

    const phone = message.from;           // e.g. "5511999998888"
    const text  = message.text.body.trim();

    console.log(`[webhook] Message from ${phone}: "${text}"`);

    const reply = await handleMessage(phone, text);
    await sendMessage(phone, reply);

    console.log(`[webhook] Replied to ${phone}: "${reply}"`);
  } catch (err) {
    // Log the error but never crash — 200 was already sent to Meta
    console.error("[webhook] Error processing message:", err.message);
  }
});

// ── Core message-handling logic ───────────────────────────────
async function handleMessage(phone, text) {
  // 1. Keyword intents (greetings, prices, hours, booking, etc.)
  const intent = classifyIntent(text);
  if (intent) return buildReply(intent);

  // 2. FAQ — perguntas e respostas que o dono cadastrou em faq.json
  const faqAnswer = matchFaq(text);
  if (faqAnswer) return faqAnswer;

  // 3. Fallback — Claude responde com contexto do FAQ injetado
  return aiReply(phone, text);
}

module.exports = router;
