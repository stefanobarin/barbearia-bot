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
const INPUT_COST          = 0.80 / 1_000_000;
const OUTPUT_COST         = 4.00 / 1_000_000;
const CACHE_CREATION_COST = 1.00 / 1_000_000; // 1.25x input, charged when cache is written
const CACHE_READ_COST     = 0.08 / 1_000_000; // 0.1x input, charged on cache hit

function todayKey() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf-8")); } catch { return {}; }
}

function save(data) {
  fs.promises.writeFile(FILE, JSON.stringify(data, null, 2))
    .catch(err => console.error("[tokenTracker] write failed:", err.message));
}

function logUsage(inputTokens, outputTokens, cacheCreation = 0, cacheRead = 0) {
  const data  = load();
  const today = todayKey();

  if (data.today !== today) {
    data.today              = today;
    data.todayInput         = 0;
    data.todayOutput        = 0;
    data.todayCacheCreation = 0;
    data.todayCacheRead     = 0;
  }

  data.todayInput           = (data.todayInput           || 0) + inputTokens;
  data.todayOutput          = (data.todayOutput          || 0) + outputTokens;
  data.todayCacheCreation   = (data.todayCacheCreation   || 0) + cacheCreation;
  data.todayCacheRead       = (data.todayCacheRead       || 0) + cacheRead;
  data.allTimeInput         = (data.allTimeInput         || 0) + inputTokens;
  data.allTimeOutput        = (data.allTimeOutput        || 0) + outputTokens;
  data.allTimeCacheCreation = (data.allTimeCacheCreation || 0) + cacheCreation;
  data.allTimeCacheRead     = (data.allTimeCacheRead     || 0) + cacheRead;

  save(data);
}

function getStats() {
  const data      = load();
  const today     = todayKey();
  const isSameDay = data.today === today;

  const todayIn      = isSameDay ? (data.todayInput           || 0) : 0;
  const todayOut     = isSameDay ? (data.todayOutput          || 0) : 0;
  const todayCC      = isSameDay ? (data.todayCacheCreation   || 0) : 0;
  const todayCR      = isSameDay ? (data.todayCacheRead       || 0) : 0;
  const allIn        = data.allTimeInput           || 0;
  const allOut       = data.allTimeOutput          || 0;
  const allCC        = data.allTimeCacheCreation   || 0;
  const allCR        = data.allTimeCacheRead       || 0;

  const todayCost   = todayIn * INPUT_COST + todayOut * OUTPUT_COST
                    + todayCC * CACHE_CREATION_COST + todayCR * CACHE_READ_COST;
  const allTimeCost = allIn * INPUT_COST + allOut * OUTPUT_COST
                    + allCC * CACHE_CREATION_COST + allCR * CACHE_READ_COST;

  return {
    today: {
      input:         todayIn,
      output:        todayOut,
      cacheCreation: todayCC,
      cacheRead:     todayCR,
      total:         todayIn + todayOut + todayCC + todayCR,
      costUSD:       todayCost,
    },
    allTime: {
      input:         allIn,
      output:        allOut,
      cacheCreation: allCC,
      cacheRead:     allCR,
      total:         allIn + allOut + allCC + allCR,
      costUSD:       allTimeCost,
    },
  };
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

module.exports = { logUsage, getStats, formatTokens };
