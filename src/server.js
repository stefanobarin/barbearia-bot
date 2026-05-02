// ─────────────────────────────────────────────────────────────
//  Entry point — starts the Express server
// ─────────────────────────────────────────────────────────────
require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const webhookRouter = require("./webhook");
const adminRouter = require("./admin");
const { startDailyReport } = require("./dailyReport");
const { startFollowUp } = require("./followUp");
const { startDiskMonitor } = require("./diskMonitor");
const { sendAlert } = require("./alerts");

process.on("uncaughtException", async (err) => {
  console.error("[CRASH] uncaughtException:", err);
  try {
    await sendAlert("crash_uncaught", `❌ Bot CRASHOU (uncaughtException)\n${err.message}\n\nO Railway vai tentar reiniciar automaticamente.`);
  } finally {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("[CRASH] unhandledRejection:", reason);
  const msg = reason instanceof Error ? reason.message : String(reason);
  sendAlert("crash_rejection", `⚠️ Promise não tratada\n${msg}`);
});

const app = express();

app.set("trust proxy", 1);

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  "/webhook",
  webhookLimiter,
  express.json({
    limit: "200kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  webhookRouter
);

app.use("/admin", adminLimiter, express.json({ limit: "100kb" }), adminRouter);

app.get("/", (_req, res) => res.send("Barbearia AI — online ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] Running on port ${PORT}`);
  startDailyReport();
  startFollowUp();
  startDiskMonitor();

  if (process.env.STARTUP_ALERT === "true") {
    sendAlert("startup", "✅ Bot iniciado com sucesso");
  }
});
