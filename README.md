# Barbearia — WhatsApp AI Receptionist

A production-ready WhatsApp AI receptionist for a barbershop, powered by **Claude Haiku** and the **WhatsApp Cloud API**.

## How it works

```
Customer (WhatsApp)
       ↓
Meta Webhook → POST /webhook
       ↓
Intent classifier (keyword match)
       ↓
  Known intent?
  ├── YES → instant predefined reply
  └── NO  → Claude AI (barbershop-scoped)
       ↓
WhatsApp Cloud API → reply sent
```

---

## Project structure

```
src/
├── server.js           # Express entry point
├── webhook.js          # GET verify + POST message handler
├── intentClassifier.js # Keyword detection + predefined replies
├── memory.js           # Per-user conversation history (in-memory)
├── aiReply.js          # Claude AI fallback
└── whatsapp.js         # Send message via WhatsApp Cloud API
.env.example            # Environment variables template
railway.toml            # Railway deployment config
```

---

## 1. Prerequisites

- Node.js 18+
- A [Meta Developer](https://developers.facebook.com/) account with a WhatsApp Business app
- An [Anthropic](https://console.anthropic.com/) account

---

## 2. Local setup

```bash
# Clone / download the project
cd Barbearia

# Install dependencies
npm install

# Create your .env file
cp .env.example .env
```

Open `.env` and fill in every value (see comments inside the file).

```bash
# Start in development mode (auto-restarts on file changes)
npm run dev
```

The server listens on `http://localhost:3000`.

---

## 3. Expose the server to the internet (for Meta webhook)

Meta needs a public HTTPS URL to send messages to. Use **ngrok** during development:

```bash
# Install ngrok (one-time)
brew install ngrok   # macOS
# or download from https://ngrok.com/download

# Expose your local server
ngrok http 3000
```

Copy the `https://xxxx.ngrok.io` URL — you will need it in the next step.

---

## 4. Configure the Meta webhook

1. Go to [developers.facebook.com](https://developers.facebook.com/) → Your App → WhatsApp → Configuration
2. Under **Webhook**, click **Edit**
3. Set:
   - **Callback URL**: `https://xxxx.ngrok.io/webhook`
   - **Verify token**: the same string you put in `VERIFY_TOKEN` in your `.env`
4. Click **Verify and save**
5. Subscribe to the **messages** field

---

## 5. Test it

Send a WhatsApp message to your test number and try:

| Message | Expected reply |
|---|---|
| `oi` | Greeting |
| `preço` | Price table |
| `agendar` | Booking link |
| `onde fica` | Location |
| `qual a capital da França?` | Out-of-scope block |
| `quero falar com um atendente` | Human handoff |

---

## 6. Deploy to Railway

### Option A — GitHub (recommended)

1. Push the project to a GitHub repository
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo
4. Add all environment variables from `.env` under **Variables**
5. Railway auto-deploys on every push

### Option B — Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Then add your environment variables in the Railway dashboard under **Variables**.

After deploy, update the Meta webhook URL to your Railway domain:
`https://your-app.railway.app/webhook`

---

## Customising the bot

| What | Where |
|---|---|
| Add/change keywords | `src/intentClassifier.js` → `INTENTS` object |
| Change predefined replies | `src/intentClassifier.js` → `REPLIES` object |
| Change AI behaviour / tone | `src/aiReply.js` → `SYSTEM_PROMPT` |
| Change prices / services | Update `SYSTEM_PROMPT` and `REPLIES.prices` / `REPLIES.services` |
| Change booking link | `.env` → `BOOKING_LINK` |

---

## Environment variables reference

| Variable | Description |
|---|---|
| `WHATSAPP_TOKEN` | Meta permanent access token |
| `WHATSAPP_PHONE_ID` | Meta phone number ID |
| `VERIFY_TOKEN` | Secret string for webhook verification |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `BOOKING_LINK` | Your scheduling app link |
| `PORT` | Server port (Railway sets this automatically) |
