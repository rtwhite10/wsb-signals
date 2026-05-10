#!/usr/bin/env node
/**
 * WSB Signals MCP Server — Claude Desktop edition.
 * Auto-starts the Python API server on launch. No manual startup needed.
 */
import { Server }               from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { spawn }       from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { openSync }    from "fs";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, "..");
const API_PORT   = process.env.API_PORT   || "8765";
const BASE       = process.env.WSB_API_URL || `http://localhost:${API_PORT}`;

// ── Auto-start Python API server ─────────────────────────────────────────────
// Only spawn locally when not pointed at a remote URL (e.g. Vercel)
let apiProcess = null;
if (!process.env.WSB_API_URL) {
  const logPath = join(ROOT, "api-server.log");
  const logFd   = openSync(logPath, "a");

  apiProcess = spawn("python3", [join(ROOT, "dev-api.py")], {
    cwd:   ROOT,
    env:   { ...process.env, API_PORT },
    stdio: ["ignore", logFd, logFd],   // keep stdout clean for MCP JSON-RPC
  });

  apiProcess.on("error", (err) =>
    process.stderr.write(`[wsb-mcp] Failed to start API server: ${err.message}\n`)
  );

  // Wait up to 20 s for the API to come up before accepting tool calls
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/wsb/signals`);
      if (r.status < 500) break;
    } catch { /* still starting */ }
    await new Promise(r => setTimeout(r, 600));
  }
}

// Tear down Python server when MCP server exits
function cleanup() { apiProcess?.kill(); }
process.on("exit",   cleanup);
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("SIGINT",  () => { cleanup(); process.exit(0); });

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_signals",
    description:
      "Get today's trending stock tickers from Reddit WallStreetBets, " +
      "ranked by mention count with bullish/bearish sentiment scores. " +
      "Use when the user asks what WSB is buying, what's hot, or wants trade ideas for the week.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_technicals",
    description:
      "Get full technical analysis for a stock: current price, RSI, MACD, " +
      "20/50/200-day moving averages, support & resistance levels, and volume vs average. " +
      "Use when the user asks about a ticker's chart, indicators, trend, or a good entry price.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker, e.g. NVDA, RKLB, AAPL" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_ticker_posts",
    description:
      "Get the actual Reddit WSB posts mentioning a specific stock. " +
      "Use when the user wants to know what people are saying about a stock " +
      "or wants the Reddit sentiment behind a signal.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker, e.g. GME, TSLA" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_hot_posts",
    description:
      "Get the latest hot posts from WallStreetBets with tickers extracted from each post. " +
      "Use for a broad overview of what WSB is posting about right now.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

// ── MCP server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "wsb-signals", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let path;
    if      (name === "get_signals")      path = "/api/wsb/signals";
    else if (name === "get_hot_posts")    path = "/api/wsb/hot";
    else if (name === "get_technicals")   path = `/api/wsb/technicals?symbol=${encodeURIComponent((args?.symbol || "").toUpperCase())}`;
    else if (name === "get_ticker_posts") path = `/api/wsb/ticker?symbol=${encodeURIComponent((args?.symbol || "").toUpperCase())}`;
    else throw new Error(`Unknown tool: ${name}`);

    const res  = await fetch(`${BASE}${path}`);
    const data = await res.json();

    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
