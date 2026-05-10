"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Signal = {
  ticker: string;
  mentions: number;
  sentiment_score: number;
  bullish_count: number;
  bearish_count: number;
};

function SentimentBar({ bullish, bearish }: { bullish: number; bearish: number }) {
  const total = bullish + bearish;
  if (total === 0) {
    return (
      <div className="h-4 rounded-full bg-gray-200 w-full" />
    );
  }
  const greenPct = Math.round((bullish / total) * 100);
  const redPct = 100 - greenPct;
  return (
    <div className="flex h-4 rounded-full overflow-hidden w-full bg-gray-200">
      <div style={{ width: `${greenPct}%` }} className="bg-green-500 transition-all" />
      <div style={{ width: `${redPct}%` }} className="bg-red-400 transition-all" />
    </div>
  );
}

function SentimentLabel({ score }: { score: number }) {
  if (score > 0.1)  return <span className="text-green-700 font-semibold">Bullish</span>;
  if (score < -0.1) return <span className="text-red-600 font-semibold">Bearish</span>;
  return <span className="text-gray-500 font-semibold">Neutral</span>;
}

function timeSince(date: Date) {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
}

export default function Dashboard() {
  const [signals, setSignals]       = useState<Signal[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick]             = useState(0);

  const fetchSignals = useCallback(async () => {
    try {
      setError("");
      const res = await fetch("/api/wsb/signals");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Signal[] = await res.json();
      setSignals(data);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load signals — please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
    const refresh = setInterval(fetchSignals, 5 * 60 * 1000);
    const clock   = setInterval(() => setTick(t => t + 1), 30_000);
    return () => { clearInterval(refresh); clearInterval(clock); };
  }, [fetchSignals]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">WSB Trading Signals</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Live signals from r/wallstreetbets — refreshes every 5 minutes
        </p>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm text-gray-400">
          {lastUpdated
            ? `Updated ${timeSince(lastUpdated)}`
            : loading
            ? "Loading..."
            : "Not yet loaded"}
          {/* tick is here only to trigger re-render for the clock */}
          <span className="hidden">{tick}</span>
        </span>
        <button
          onClick={() => { setLoading(true); fetchSignals(); }}
          disabled={loading}
          className="text-sm px-4 py-1.5 rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 transition"
        >
          {loading ? "Loading..." : "Refresh Now"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !signals.length && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white rounded-2xl p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-full mb-2" />
              <div className="h-3 bg-gray-100 rounded w-32" />
            </div>
          ))}
        </div>
      )}

      {/* Signal list */}
      {!loading && signals.length === 0 && !error && (
        <p className="text-center text-gray-400 py-16 text-lg">No signals found right now.</p>
      )}

      <div className="space-y-3">
        {signals.map((sig, idx) => {
          const total = sig.bullish_count + sig.bearish_count;
          const bullishPct = total > 0 ? Math.round((sig.bullish_count / total) * 100) : 0;

          return (
            <Link
              key={sig.ticker}
              href={`/ticker/${sig.ticker}`}
              className="block bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow border border-gray-100 hover:border-blue-200"
            >
              {/* Row 1: rank, ticker, mentions */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-6 text-right">
                    #{idx + 1}
                  </span>
                  <span className="text-xl font-bold text-gray-900">{sig.ticker}</span>
                  <SentimentLabel score={sig.sentiment_score} />
                </div>
                <span className="text-sm text-gray-500">
                  {sig.mentions} {sig.mentions === 1 ? "post" : "posts"}
                </span>
              </div>

              {/* Sentiment bar */}
              <SentimentBar bullish={sig.bullish_count} bearish={sig.bearish_count} />

              {/* Row 3: bullish / bearish counts */}
              <div className="flex justify-between mt-2 text-xs text-gray-400">
                <span className="text-green-600 font-medium">
                  {bullishPct}% bullish ({sig.bullish_count} signals)
                </span>
                <span className="text-red-500 font-medium">
                  {100 - bullishPct}% bearish ({sig.bearish_count} signals)
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {signals.length > 0 && (
        <p className="text-center text-xs text-gray-300 mt-8">
          For informational purposes only — not financial advice.
        </p>
      )}
    </main>
  );
}
