// ─────────────────────────────────────────────────────────────
//  Media downloader — baixa imagens/áudio da Meta WhatsApp API
//
//  Fluxo:
//    1. Cliente manda imagem no WhatsApp
//    2. Meta envia webhook com message.image.id (media ID)
//    3. Esta função pega o media ID, busca a URL temporária
//       e baixa o conteúdo binário, retornando como base64.
//
//  Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
// ─────────────────────────────────────────────────────────────
const axios = require("axios");

const BASE_URL = "https://graph.facebook.com/v19.0";

/**
 * Baixa uma mídia do WhatsApp pelo ID e retorna em base64.
 *
 * @param {string} mediaId — o ID retornado pelo webhook em message.image.id
 * @returns {Promise<{data: string, mimeType: string}>}
 */
async function downloadWhatsAppMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("WHATSAPP_TOKEN não configurado");

  // Passo 1: pegar URL temporária da mídia
  const metaResp = await axios.get(`${BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

  const mediaUrl = metaResp.data?.url;
  const mimeType = metaResp.data?.mime_type || "image/jpeg";

  if (!mediaUrl) {
    throw new Error("Meta API não retornou URL da mídia");
  }

  // Passo 2: baixar o binário (URL temporária, precisa de auth também)
  const fileResp = await axios.get(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "arraybuffer",
    timeout: 15000,
    maxContentLength: 5 * 1024 * 1024, // 5MB max (proteção)
  });

  const base64 = Buffer.from(fileResp.data).toString("base64");

  return { data: base64, mimeType };
}

module.exports = { downloadWhatsAppMedia };
