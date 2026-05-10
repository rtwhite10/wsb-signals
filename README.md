# WSB Trading Signals

Live trading signals scraped from Reddit r/wallstreetbets, with technical analysis powered by Yahoo Finance. Designed to be queried through Claude Desktop via MCP.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_GITHUB_USERNAME%2Fwsb-signals)

---

## What it does

- Scrapes top WSB posts using Reddit's public JSON API (no key needed)
- Extracts stock tickers and scores sentiment (bullish/bearish keywords)
- Provides full technical analysis via Yahoo Finance: RSI, MACD, moving averages, support/resistance, volume
- Exposes everything as an MCP server so Claude Desktop can call it as tools mid-conversation

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/wsb/signals` | Ranked ticker leaderboard from top 50 WSB posts |
| `GET /api/wsb/hot` | Top 25 WSB posts with tickers + sentiment |
| `GET /api/wsb/ticker?symbol=RKLB` | Posts filtered to one ticker |
| `GET /api/wsb/technicals?symbol=RKLB` | RSI, MACD, MAs, support/resistance, volume |

---

## Project structure

```
wsb-signals/
├── api/wsb/
│   ├── hot.py            →  /api/wsb/hot
│   ├── ticker.py         →  /api/wsb/ticker
│   ├── signals.py        →  /api/wsb/signals
│   └── technicals.py     →  /api/wsb/technicals
├── mcp/
│   └── server.mjs        ←  Claude Desktop MCP server
├── app/
│   ├── page.tsx           (Dashboard)
│   └── ticker/[symbol]/
│       └── page.tsx       (Ticker detail)
├── public/openapi.json
├── dev-api.py             (local Python dev server)
├── vercel.json
└── requirements.txt
```

---

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Start the Python API server

```bash
python3 dev-api.py
# Running at http://localhost:8000
```

### 3. Start the Next.js frontend (new terminal)

```bash
npm run dev
# Running at http://localhost:3000
```

The Next.js app proxies all `/api/*` requests to the Python server automatically.

---

## Deploy to Vercel

### One-click

1. Push this repo to GitHub
2. Click the **Deploy with Vercel** button at the top of this README
3. No environment variables needed

### Via CLI

```bash
npm i -g vercel
vercel
```

After deploy, your live URLs will be:
```
https://your-app.vercel.app/
https://your-app.vercel.app/api/wsb/signals
https://your-app.vercel.app/api/wsb/technicals?symbol=NVDA
```

---

## Connect to Claude Desktop (MCP)

This is what lets your dad open Claude Desktop and ask things like
_"What should I watch this week?"_ or _"Give me technicals on RKLB"_
and have Claude call your live API automatically.

### Step 1 — Deploy to Vercel first (see above)

### Step 2 — Edit Claude Desktop's config file

On Mac, open this file (create it if it doesn't exist):
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add this (replace the URL with your actual Vercel URL):

```json
{
  "mcpServers": {
    "wsb-signals": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/wsb-signals/mcp/server.mjs"],
      "env": {
        "WSB_API_URL": "https://your-app.vercel.app"
      }
    }
  }
}
```

### Step 3 — Restart Claude Desktop

Quit and reopen Claude Desktop. You should see a hammer icon (tools) in the chat bar — that means MCP is connected.

### Step 4 — Start asking questions

Claude now has 4 tools it can call automatically:

| Tool | When Claude uses it |
|---|---|
| `get_signals` | "What's WSB buying?" / "Any trade ideas this week?" |
| `get_technicals` | "Give me technicals on RKLB" / "What's a good entry for NVDA?" |
| `get_ticker_posts` | "What are people saying about AMD?" |
| `get_hot_posts` | "What's trending on WSB right now?" |

### Local testing (before deploying)

To test the MCP connection locally (before Vercel), keep `dev-api.py` running and omit the `WSB_API_URL` env var — it defaults to `http://localhost:8000`:

```json
{
  "mcpServers": {
    "wsb-signals": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/wsb-signals/mcp/server.mjs"]
    }
  }
}
```

---

## API reference

### `GET /api/wsb/technicals?symbol=RKLB`

```json
{
  "symbol": "RKLB",
  "price": 105.47,
  "change_pct": 34.22,
  "52w_high": 105.47,
  "52w_low": 20.51,
  "rsi": { "value": 60.6, "signal": "neutral" },
  "macd": { "value": 4.086, "signal": 3.009, "histogram": 1.077, "bias": "bullish" },
  "moving_averages": { "ma20": 82.08, "ma50": 73.96, "ma200": 63.01, "trend": "strong uptrend" },
  "support": 66.74,
  "resistance": 90.04,
  "volume": { "today": 79519300, "avg_20d": 24747135, "ratio": 3.2, "description": "3.2x average (unusually high)" },
  "summary": "RKLB is in a strong uptrend at $105.47 (+34.22% today). RSI 60.6 — neutral. MACD is bullish. Trading above the 50-day MA ($73.96). Near-term support ~$66.74, resistance ~$90.04. Volume 3.2x average (unusually high)."
}
```

### `GET /api/wsb/signals`

```json
[{ "ticker": "RKLB", "mentions": 6, "sentiment_score": 1.0, "bullish_count": 4, "bearish_count": 0 }]
```

### `GET /api/wsb/ticker?symbol=RKLB`

```json
[{ "title": "106 RKLB calls. Mocked yesterday. Up 560% today.", "url": "...", "score": 4418, "num_comments": 312, "sentiment": "bullish" }]
```

---

## Notes

- No API keys required — Reddit public JSON API + Yahoo Finance
- Reddit may rate-limit occasionally; if signals fail, wait a minute
- Technical indicators are computed from daily close prices
- For informational purposes only — not financial advice
