// ─────────────────────────────────────────────────────────────
//  Entry point — starts the Express server
// ─────────────────────────────────────────────────────────────
require("dotenv").config();

const express = require("express");
const webhookRouter = require("./webhook");

const app = express();

// Parse incoming JSON bodies (required for WhatsApp webhook payloads)
app.use(express.json());

// All webhook traffic lives under /webhook
app.use("/webhook", webhookRouter);

// Simple health-check so Railway / uptime monitors can ping us
app.get("/", (_req, res) => res.send("Barbearia AI — online ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] Running on port ${PORT}`);
});
