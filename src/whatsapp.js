// ─────────────────────────────────────────────────────────────
//  WhatsApp Cloud API — send a text message
//
//  Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
//
//  Required env vars:
//    WHATSAPP_TOKEN    — your Meta permanent access token
//    WHATSAPP_PHONE_ID — the Phone Number ID from Meta dashboard
// ─────────────────────────────────────────────────────────────
const axios = require("axios");

const BASE_URL = "https://graph.facebook.com/v19.0";

/**
 * Sends a plain-text WhatsApp message to a phone number.
 *
 * @param {string} to   — recipient's phone in E.164 format, e.g. "5511999998888"
 * @param {string} text — message body
 * @returns {Promise<void>}
 */
async function sendMessage(to, text) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token   = process.env.WHATSAPP_TOKEN;

  if (!phoneId || !token) {
    throw new Error(
      "Missing WHATSAPP_PHONE_ID or WHATSAPP_TOKEN in environment variables."
    );
  }

  try {
    await axios.post(
      `${BASE_URL}/${phoneId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const apiMsg = err.response?.data?.error?.message || err.message;

    // Lazy require pra evitar ciclo whatsapp ↔ alerts
    if (status === 401) {
      try {
        const { sendAlert } = require("./alerts");
        await sendAlert(
          "whatsapp_token_expired",
          `❌ Token WhatsApp INVÁLIDO ou EXPIRADO!\n\nResposta da Meta: ${apiMsg}\n\n*Ação:* Atualize WHATSAPP_TOKEN no Railway.`
        );
      } catch {}
    } else if (status >= 500) {
      try {
        const { sendAlert } = require("./alerts");
        await sendAlert(
          "whatsapp_api_down",
          `⚠️ Meta WhatsApp API instável (HTTP ${status})\n${apiMsg}`
        );
      } catch {}
    }
    throw err;
  }
}

module.exports = { sendMessage };
