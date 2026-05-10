#!/usr/bin/env node
/**
 * WSB Signals MCP Server — for Claude Desktop
 * Exposes WSB signals + technical analysis as Claude tools.
 *
 * Set WSB_API_URL env var to your Vercel deployment URL.
 * Defaults to localhost:8000 for local dev.
 */
import { Server }               from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = (process.env.WSB_API_URL || "http://localhost:8000").replace(/\/$/, "");

const TOOLS = [
  {
    name: "get_signals",
    description:
      "Get today's trending stock tickers from Reddit WallStreetBets, " +
      "ranked by how many posts mention them. Includes bullish/bearish sentiment. " +
      "Use this when the user asks what WSB is buying, what's trending, or wants trade ideas.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_technicals",
    description:
      "Get technical analysis for a specific stock: current price, RSI, MACD, " +
      "20/50/200-day moving averages, support & resistance levels, and volume. " +
      "Use this when the user asks about a specific ticker's chart, indicators, or entry price.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol, e.g. NVDA, RKLB, AAPL",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_ticker_posts",
    description:
      "Get the actual Reddit WSB posts mentioning a specific stock ticker. " +
      "Use this when the user wants to know what people are actually saying about a stock, " +
      "or wants the Reddit context behind a signal.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol, e.g. GME, TSLA",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_hot_posts",
    description:
      "Get the latest hot posts from WallStreetBets with tickers extracted. " +
      "Use this for a broad overview of what WSB is posting about right now.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

async function callApi(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "wsb-signals", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;

    if (name === "get_signals") {
      data = await callApi("/api/wsb/signals");

    } else if (name === "get_technicals") {
      const sym = (args?.symbol || "").toUpperCase().trim();
      if (!sym) throw new Error("symbol is required");
      data = await callApi(`/api/wsb/technicals?symbol=${encodeURIComponent(sym)}`);

    } else if (name === "get_ticker_posts") {
      const sym = (args?.symbol || "").toUpperCase().trim();
      if (!sym) throw new Error("symbol is required");
      data = await callApi(`/api/wsb/ticker?symbol=${encodeURIComponent(sym)}`);

    } else if (name === "get_hot_posts") {
      data = await callApi("/api/wsb/hot");

    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
