// ─────────────────────────────────────────────────────────────
//  Conversation memory — in-memory, per user
//
//  Stores the last MAX_MESSAGES exchanges so Claude has context.
//  Data resets when the server restarts (intentional for simplicity).
//  Upgrade to Redis if you need persistence across restarts.
// ─────────────────────────────────────────────────────────────

const MAX_MESSAGES = 10; // keep the last 10 messages per user

// Map<phoneNumber, Array<{ role: "user"|"assistant", content: string }>>
const store = new Map();

/**
 * Returns the conversation history for a phone number.
 * Creates an empty array if this is the first message.
 *
 * @param {string} phone
 * @returns {Array<{role: string, content: string}>}
 */
function getHistory(phone) {
  if (!store.has(phone)) {
    store.set(phone, []);
  }
  return store.get(phone);
}

/**
 * Appends a message to the user's history and trims to MAX_MESSAGES.
 *
 * @param {string} phone
 * @param {"user"|"assistant"} role
 * @param {string} content
 */
function addMessage(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });

  // Keep only the most recent messages to avoid unbounded growth
  if (history.length > MAX_MESSAGES) {
    history.splice(0, history.length - MAX_MESSAGES);
  }
}

/**
 * Clears history for a user (useful for testing or "restart" flows).
 *
 * @param {string} phone
 */
function clearHistory(phone) {
  store.delete(phone);
}

module.exports = { getHistory, addMessage, clearHistory };
