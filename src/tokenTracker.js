// Token usage tracker — in-memory state, persisted to disk async.
// Reads disk ONCE at startup; never on hot path.

const fs   = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
const FILE     = path.join(DATA_DIR, "tokenUsage.json");

// Claude Haiku 4.5 pricing (USD per token)
const INPUT_COST          = 0.80  / 1_000_000;
const OUTPUT_COST         = 4.00  / 1_000_000;
const CACHE_CREATION_COST = 1.00  / 1_000_000;
const CACHE_READ_COST     = 0.08  / 1_000_000;

function todayKey() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function loadFromDisk() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf-8")); } catch { return {}; }
}

function saveToDisk(data) {
  fs.promises.writeFile(FILE, JSON.stringify(data, null, 2))
    .catch(err => console.error("[tokenTracker] write failed:", err.message));
}

// Single in-memory state — loaded once at startup
let _state = loadFromDisk();

function logUsage(inputTokens, outputTokens, cacheCreation = 0, cacheRead = 0) {
  const today = todayKey();

  if (_state.today !== today) {
    _state.today              = today;
    _state.todayInput         = 0;
    _state.todayOutput        = 0;
    _state.todayCacheCreation = 0;
    _state.todayCacheRead     = 0;
  }

  _state.todayInput           = (_state.todayInput           || 0) + inputTokens;
  _state.todayOutput          = (_state.todayOutput          || 0) + outputTokens;
  _state.todayCacheCreation   = (_state.todayCacheCreation   || 0) + cacheCreation;
  _state.todayCacheRead       = (_state.todayCacheRead       || 0) + cacheRead;
  _state.allTimeInput         = (_state.allTimeInput         || 0) + inputTokens;
  _state.allTimeOutput        = (_state.allTimeOutput        || 0) + outputTokens;
  _state.allTimeCacheCreation = (_state.allTimeCacheCreation || 0) + cacheCreation;
  _state.allTimeCacheRead     = (_state.allTimeCacheRead     || 0) + cacheRead;

  saveToDisk(_state);
}

function getStats() {
  const today    = todayKey();
  const sameDay  = _state.today === today;

  const todayIn  = sameDay ? (_state.todayInput           || 0) : 0;
  const todayOut = sameDay ? (_state.todayOutput          || 0) : 0;
  const todayCC  = sameDay ? (_state.todayCacheCreation   || 0) : 0;
  const todayCR  = sameDay ? (_state.todayCacheRead       || 0) : 0;
  const allIn    = _state.allTimeInput           || 0;
  const allOut   = _state.allTimeOutput          || 0;
  const allCC    = _state.allTimeCacheCreation   || 0;
  const allCR    = _state.allTimeCacheRead       || 0;

  const todayCost   = todayIn * INPUT_COST + todayOut * OUTPUT_COST
                    + todayCC * CACHE_CREATION_COST + todayCR * CACHE_READ_COST;
  const allTimeCost = allIn * INPUT_COST + allOut * OUTPUT_COST
                    + allCC * CACHE_CREATION_COST + allCR * CACHE_READ_COST;

  return {
    today: {
      input: todayIn, output: todayOut,
      cacheCreation: todayCC, cacheRead: todayCR,
      total: todayIn + todayOut + todayCC + todayCR,
      costUSD: todayCost,
    },
    allTime: {
      input: allIn, output: allOut,
      cacheCreation: allCC, cacheRead: allCR,
      total: allIn + allOut + allCC + allCR,
      costUSD: allTimeCost,
    },
  };
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

module.exports = { logUsage, getStats, formatTokens };
