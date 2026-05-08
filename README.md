# Barbearia — WhatsApp AI Receptionist

Production-ready WhatsApp AI receptionist for a barbershop, powered by **Claude Haiku** and the **WhatsApp Cloud API**.

## How it works

```
Customer (WhatsApp)
       ↓
Meta Webhook → POST /webhook
       ↓
  "atendente"?
  ├── YES → instant human-handoff reply + alert to owner
  └── NO  → Claude AI (full barbershop context)
       ↓
WhatsApp Cloud API → reply sent
```

## Project structure

```
src/
├── server.js           # Express entry point, rate limiters, graceful shutdown
├── webhook.js          # GET verify + POST message handler, dedup, throttle
├── intentClassifier.js # Human-escalation intent only
├── aiReply.js          # Claude Haiku with full barbershop system prompt
├── memory.js           # Per-user conversation history (persisted to /data)
├── conversations.js    # Persistent conversation log (persisted to /data)
├── faqMatcher.js       # FAQ context injection into Claude
├── whatsapp.js         # Send message via WhatsApp Cloud API (retry + backoff)
├── followUp.js         # Auto follow-up after inactivity (booking link guard)
├── dailyReport.js      # Daily summary via WhatsApp at 22h (São Paulo)
├── diskMonitor.js      # Disk usage alerts
├── tokenTracker.js     # Claude token usage + cost tracking
├── alerts.js           # Critical error notifications to owner
├── media.js            # WhatsApp media download
└── utils.js            # Shared helpers (maskPhone)
faq.json                # FAQ entries injected as Claude context
.env.example            # Environment variables template
railway.toml            # Railway deployment config (healthcheck included)
```

## Prerequisites

- Node.js 18+
- Meta Developer account with WhatsApp Business app
- Anthropic account (Claude API key)
- Railway account (for deploy + persistent volume)

## Local setup

```bash
cd Barbearia
npm install
cp .env.example .env
# Fill in every value in .env
npm run dev
```

Server listens on `http://localhost:3000`.

## Expose for Meta webhook (local dev)

Meta requires a public HTTPS URL. Use ngrok:

```bash
brew install ngrok
ngrok http 3000
```

Use the `https://xxxx.ngrok.io` URL as webhook callback.

## Configure Meta webhook

1. Go to developers.facebook.com → Your App → WhatsApp → Configuration
2. Set **Callback URL**: `https://your-domain/webhook`
3. Set **Verify token**: same as `VERIFY_TOKEN` in `.env`
4. Subscribe to the **messages** field

## Deploy to Railway

1. Push to GitHub
2. Railway → New Project → Deploy from GitHub
3. Add all env vars from `.env` under **Variables**
4. Create a Volume mounted at `/data` (Settings → Volumes)
5. Set `DATA_DIR=/data` in env vars

After deploy, update Meta webhook URL to `https://your-app.railway.app/webhook`.

## Environment variables

| Variable | Description |
|---|---|
| `WHATSAPP_TOKEN` | Meta permanent access token |
| `WHATSAPP_PHONE_ID` | Meta phone number ID |
| `APP_SECRET` | Meta app secret (HMAC webhook verification) |
| `VERIFY_TOKEN` | Secret string for webhook handshake |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ADMIN_PASSWORD` | Password for `/admin` panel |
| `BARBERSHOP_PHONE` | Phone that receives human-escalation alerts |
| `OWNER_PHONE` | Phone that receives daily reports + crash alerts |
| `BOOKING_LINK` | Scheduling app URL sent to customers |
| `DATA_DIR` | Persistent storage path (Railway: `/data`) |
| `PORT` | Server port (Railway sets automatically) |

## Admin panel

Available at `/admin`. Metrics: conversations, unique clients, escalations, AI replies, Claude token usage + cost, disk usage. Export conversations via `GET /admin/export/conversations`.

## Customising

| What | Where |
|---|---|
| AI behaviour / tone / prices | `src/aiReply.js` → `SYSTEM_PROMPT` |
| FAQ entries | `faq.json` or `/admin` panel |
| Follow-up delay | `FOLLOWUP_DELAY_MIN` env var (default: 30) |
| Claude model | `AI_MODEL` env var |
| API version | `GRAPH_API_VERSION` env var |
