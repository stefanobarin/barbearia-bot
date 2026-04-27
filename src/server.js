// ─────────────────────────────────────────────────────────────
//  Entry point — starts the Express server
// ─────────────────────────────────────────────────────────────
require("dotenv").config();

const express = require("express");
const webhookRouter = require("./webhook");
const adminRouter = require("./admin");
const { startDailyReport } = require("./dailyReport");

const app = express();

app.use(express.json());

app.use("/webhook", webhookRouter);
app.use("/admin", adminRouter);

app.get("/", (_req, res) => res.send("Barbearia AI — online ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] Running on port ${PORT}`);
  startDailyReport();
});
