// ─────────────────────────────────────────────────────────────
//  Disk space monitor
//
//  Checks every hour:
//   - Free disk space on DATA_DIR volume (alerts if < 10%)
//   - conversations.json size (alerts if > 4MB)
//
//  Uses fs.statfsSync (Node >= 18.15). Falls back gracefully
//  on older builds — just skips the check with a log line.
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { sendAlert } = require("./alerts");

const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, "..");
const CONV_FILE  = path.join(DATA_DIR, "conversations.json");

const FREE_WARN_PCT  = 0.10; // alert when < 10% free
const FILE_WARN_MB   = 4;    // alert when conversations.json > 4 MB

/**
 * Returns { totalMB, freeMB, usedPct, freePct } or null if unavailable.
 */
function getDiskStats() {
  if (typeof fs.statfsSync !== "function") return null;
  try {
    const s = fs.statfsSync(DATA_DIR);
    const total = s.blocks * s.bsize;
    const free  = s.bfree  * s.bsize;
    return {
      totalMB: (total / 1048576).toFixed(0),
      freeMB:  (free  / 1048576).toFixed(0),
      usedPct: (((total - free) / total) * 100).toFixed(1),
      freePct: ((free / total) * 100).toFixed(1),
      freeRatio: free / total,
    };
  } catch {
    return null;
  }
}

/**
 * Returns conversations.json size in MB, or 0 if file doesn't exist.
 */
function getConvFileSizeMB() {
  try {
    return fs.statSync(CONV_FILE).size / 1048576;
  } catch {
    return 0;
  }
}

function runChecks() {
  const disk = getDiskStats();
  if (disk) {
    console.log(`[diskMonitor] disco: ${disk.freeMB}MB livres (${disk.freePct}% free)`);
    if (disk.freeRatio < FREE_WARN_PCT) {
      sendAlert(
        "disk_space_low",
        `⚠️ *Disco quase cheio!*\n\n` +
        `Livre: ${disk.freeMB}MB (${disk.freePct}%)\n` +
        `Usado: ${disk.usedPct}%\n\n` +
        `*Ação:* limpe o conversations.json antigo ou aumente o volume no Railway.`
      );
    }
  } else {
    console.log("[diskMonitor] fs.statfsSync indisponível — checagem de disco pulada");
  }

  const sizeMB = getConvFileSizeMB();
  if (sizeMB > FILE_WARN_MB) {
    sendAlert(
      "conv_file_large",
      `⚠️ *conversations.json grande!*\n\n` +
      `Tamanho: ${sizeMB.toFixed(1)}MB\n\n` +
      `*Ação:* aumente MAX_ENTRIES ou faça purge de conversas antigas.`
    );
  }
}

function startDiskMonitor() {
  // Hourly check
  cron.schedule("0 * * * *", runChecks);

  // First check 10s after startup (gives server time to fully boot)
  setTimeout(runChecks, 10000);

  console.log("[diskMonitor] ativo — verifica disco a cada hora");
}

module.exports = { startDiskMonitor, getDiskStats, getConvFileSizeMB };
