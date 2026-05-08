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

const MONTHLY_LIMIT_USD   = parseFloat(process.env.ANTHROPIC_MONTHLY_LIMIT_USD || "5");
const ALERT_THRESHOLD     = 0.80; // alert at 80% of monthly limit

function todayKey() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function monthKey() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7); // YYYY-MM
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
let _monthAlertSent = false; // prevent repeated alerts within same process

function logUsage(inputTokens, outputTokens, cacheCreation = 0, cacheRead = 0) {
  const today = todayKey();
  const month = monthKey();

  if (_state.today !== today) {
    _state.today              = today;
    _state.todayInput         = 0;
    _state.todayOutput        = 0;
    _state.todayCacheCreation = 0;
    _state.todayCacheRead     = 0;
  }

  if (_state.month !== month) {
    _state.month              = month;
    _state.monthInput         = 0;
    _state.monthOutput        = 0;
    _state.monthCacheCreation = 0;
    _state.monthCacheRead     = 0;
    _monthAlertSent           = false;
  }

  _state.todayInput           = (_state.todayInput           || 0) + inputTokens;
  _state.todayOutput          = (_state.todayOutput          || 0) + outputTokens;
  _state.todayCacheCreation   = (_state.todayCacheCreation   || 0) + cacheCreation;
  _state.todayCacheRead       = (_state.todayCacheRead       || 0) + cacheRead;

  _state.monthInput           = (_state.monthInput           || 0) + inputTokens;
  _state.monthOutput          = (_state.monthOutput          || 0) + outputTokens;
  _state.monthCacheCreation   = (_state.monthCacheCreation   || 0) + cacheCreation;
  _state.monthCacheRead       = (_state.monthCacheRead       || 0) + cacheRead;

  _state.allTimeInput         = (_state.allTimeInput         || 0) + inputTokens;
  _state.allTimeOutput        = (_state.allTimeOutput        || 0) + outputTokens;
  _state.allTimeCacheCreation = (_state.allTimeCacheCreation || 0) + cacheCreation;
  _state.allTimeCacheRead     = (_state.allTimeCacheRead     || 0) + cacheRead;

  saveToDisk(_state);

  // Monthly spend alert at 80% of limit
  if (!_monthAlertSent) {
    const monthCost = _state.monthInput         * INPUT_COST
                    + _state.monthOutput        * OUTPUT_COST
                    + _state.monthCacheCreation * CACHE_CREATION_COST
                    + _state.monthCacheRead     * CACHE_READ_COST;

    if (monthCost >= MONTHLY_LIMIT_USD * ALERT_THRESHOLD) {
      _monthAlertSent = true;
      // Lazy require to avoid circular dependency at load time
      const { sendAlert } = require("./alerts");
      const pct = Math.round((monthCost / MONTHLY_LIMIT_USD) * 100);
      sendAlert(
        "token_limit",
        `⚠️ Gasto Anthropic: $${monthCost.toFixed(3)} de $${MONTHLY_LIMIT_USD.toFixed(2)} este mês (${pct}%).\n\nAcesse console.anthropic.com para verificar o saldo.`
      );
    }
  }
}

function getStats() {
  const today    = todayKey();
  const month    = monthKey();
  const sameDay  = _state.today  === today;
  const sameMon  = _state.month  === month;

  const todayIn  = sameDay ? (_state.todayInput           || 0) : 0;
  const todayOut = sameDay ? (_state.todayOutput          || 0) : 0;
  const todayCC  = sameDay ? (_state.todayCacheCreation   || 0) : 0;
  const todayCR  = sameDay ? (_state.todayCacheRead       || 0) : 0;

  const monIn    = sameMon ? (_state.monthInput           || 0) : 0;
  const monOut   = sameMon ? (_state.monthOutput          || 0) : 0;
  const monCC    = sameMon ? (_state.monthCacheCreation   || 0) : 0;
  const monCR    = sameMon ? (_state.monthCacheRead       || 0) : 0;

  const allIn    = _state.allTimeInput           || 0;
  const allOut   = _state.allTimeOutput          || 0;
  const allCC    = _state.allTimeCacheCreation   || 0;
  const allCR    = _state.allTimeCacheRead       || 0;

  const todayCost  = todayIn * INPUT_COST + todayOut * OUTPUT_COST
                   + todayCC * CACHE_CREATION_COST + todayCR * CACHE_READ_COST;
  const monthCost  = monIn   * INPUT_COST + monOut   * OUTPUT_COST
                   + monCC   * CACHE_CREATION_COST + monCR   * CACHE_READ_COST;
  const allTimeCost= allIn   * INPUT_COST + allOut   * OUTPUT_COST
                   + allCC   * CACHE_CREATION_COST + allCR   * CACHE_READ_COST;

  return {
    today: {
      input: todayIn, output: todayOut,
      cacheCreation: todayCC, cacheRead: todayCR,
      total: todayIn + todayOut + todayCC + todayCR,
      costUSD: todayCost,
    },
    month: {
      input: monIn, output: monOut,
      cacheCreation: monCC, cacheRead: monCR,
      total: monIn + monOut + monCC + monCR,
      costUSD: monthCost,
      limitUSD: MONTHLY_LIMIT_USD,
      pct: MONTHLY_LIMIT_USD > 0 ? Math.round((monthCost / MONTHLY_LIMIT_USD) * 100) : 0,
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
