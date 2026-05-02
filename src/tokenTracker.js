// ─────────────────────────────────────────────────────────────
//  Token usage tracker
//
//  Logs Claude API token consumption per call.
//  Persists daily + all-time counters to tokenUsage.json.
//  Resets today's counters automatically at midnight SP.
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
const FILE = path.join(DATA_DIR, "tokenUsage.json");

// Claude Haiku 4.5 pricing (USD per token)
const INPUT_COST  = 0.80  / 1_000_000;
const OUTPUT_COST = 4.00  / 1_000_000;

function todayKey() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf-8")); } catch { return {}; }
}

function save(data) {
  try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); } catch (e) {
    console.error("[tokenTracker] write failed:", e.message);
  }
}

function logUsage(inputTokens, outputTokens) {
  const data  = load();
  const today = todayKey();

  if (data.today !== today) {
    data.today       = today;
    data.todayInput  = 0;
    data.todayOutput = 0;
  }

  data.todayInput    = (data.todayInput    || 0) + inputTokens;
  data.todayOutput   = (data.todayOutput   || 0) + outputTokens;
  data.allTimeInput  = (data.allTimeInput  || 0) + inputTokens;
  data.allTimeOutput = (data.allTimeOutput || 0) + outputTokens;

  save(data);
}

function getStats() {
  const data   = load();
  const today  = todayKey();
  const isSameDay = data.today === today;

  const todayIn  = isSameDay ? (data.todayInput  || 0) : 0;
  const todayOut = isSameDay ? (data.todayOutput || 0) : 0;
  const allIn    = data.allTimeInput  || 0;
  const allOut   = data.allTimeOutput || 0;

  return {
    today: {
      input:   todayIn,
      output:  todayOut,
      total:   todayIn + todayOut,
      costUSD: todayIn * INPUT_COST + todayOut * OUTPUT_COST,
    },
    allTime: {
      input:   allIn,
      output:  allOut,
      total:   allIn + allOut,
      costUSD: allIn * INPUT_COST + allOut * OUTPUT_COST,
    },
  };
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

module.exports = { logUsage, getStats, formatTokens };
