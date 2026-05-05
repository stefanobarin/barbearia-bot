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
const { sendAlert } = require("./alerts");

const BASE_URL = "https://graph.facebook.com/v19.0";
const MAX_RETRIES = 3;
const TIMEOUT_MS  = 10000;

async function sendMessage(to, text) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token   = process.env.WHATSAPP_TOKEN;

  if (!phoneId || !token) {
    throw new Error(
      "Missing WHATSAPP_PHONE_ID or WHATSAPP_TOKEN in environment variables."
    );
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(
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
          timeout: TIMEOUT_MS,
        }
      );

      // Meta sometimes returns HTTP 200 with an error object in the body
      if (res.data?.error) {
        const apiErr = res.data.error;
        console.error(`[whatsapp] API error in 200 response: ${apiErr.code} — ${apiErr.message}`);
        throw Object.assign(new Error(apiErr.message), { response: { status: 200, data: res.data } });
      }

      const wamid = res.data?.messages?.[0]?.id || "unknown";
      console.log(`[whatsapp] sent to ${to} — wamid: ${wamid}`);
      return;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const apiMsg = err.response?.data?.error?.message || err.message;

      // Auth errors and bad requests: don't retry
      if (status === 401 || status === 400) {
        if (status === 401) {
          try {
            await sendAlert(
              "whatsapp_token_expired",
              `❌ Token WhatsApp INVÁLIDO ou EXPIRADO!\n\nResposta da Meta: ${apiMsg}\n\n*Ação:* Atualize WHATSAPP_TOKEN no Railway.`
            );
          } catch {}
        }
        throw err;
      }

      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 500; // 1s, 2s
        console.warn(`[whatsapp] tentativa ${attempt} falhou (${status || err.code}), retry em ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted
  const status = lastErr.response?.status;
  const apiMsg = lastErr.response?.data?.error?.message || lastErr.message;
  if (status >= 500) {
    try {
      await sendAlert(
        "whatsapp_api_down",
        `⚠️ Meta WhatsApp API instável após ${MAX_RETRIES} tentativas (HTTP ${status})\n${apiMsg}`
      );
    } catch {}
  }
  throw lastErr;
}

module.exports = { sendMessage };
