"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Post = {
  title: string;
  url: string;
  score: number;
  num_comments: number;
  tickers: string[];
  sentiment: string;
  sentiment_score: number;
  bullish_count: number;
  bearish_count: number;
};

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const styles: Record<string, string> = {
    bullish: "bg-green-100 text-green-800 border border-green-200",
    bearish: "bg-red-100 text-red-700 border border-red-200",
    neutral: "bg-gray-100 text-gray-600 border border-gray-200",
  };
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${styles[sentiment] ?? styles.neutral}`}>
      {sentiment}
    </span>
  );
}

export default function TickerPage() {
  const params = useParams();
  const symbol = (params?.symbol as string ?? "").toUpperCase();

  const [posts, setPosts]   = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  const fetchPosts = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/wsb/ticker?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Post[] = await res.json();
      setPosts(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load posts.");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mb-6"
      >
        &larr; Back to Dashboard
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{symbol}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Recent WallStreetBets posts mentioning ${symbol}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-32" />
            </div>
          ))}
        </div>
      )}

      {!loading && posts.length === 0 && !error && (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg">No recent posts mentioning {symbol}.</p>
          <p className="text-gray-300 text-sm mt-2">Try refreshing or check the dashboard for active tickers.</p>
        </div>
      )}

      {/* Post cards */}
      {!loading && (
        <div className="space-y-3">
          {posts.map((post, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
            >
              {/* Title */}
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-gray-900 font-semibold text-base hover:text-blue-600 leading-snug mb-3"
              >
                {post.title}
              </a>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                <SentimentBadge sentiment={post.sentiment} />
                <span>Score: <strong className="text-gray-700">{post.score.toLocaleString()}</strong></span>
                <span>Comments: <strong className="text-gray-700">{post.num_comments.toLocaleString()}</strong></span>
              </div>

              {/* Other tickers in this post */}
              {post.tickers.filter(t => t !== symbol).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="text-xs text-gray-400">Also mentions:</span>
                  {post.tickers.filter(t => t !== symbol).slice(0, 6).map(t => (
                    <Link
                      key={t}
                      href={`/ticker/${t}`}
                      className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition"
                    >
                      {t}
                    </Link>
                  ))}
                </div>
              )}

              {/* Read on Reddit link */}
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-blue-500 hover:text-blue-700"
              >
                Read on Reddit &rarr;
              </a>
            </div>
          ))}
        </div>
      )}

      {!loading && posts.length > 0 && (
        <p className="text-center text-xs text-gray-300 mt-8">
          For informational purposes only — not financial advice.
        </p>
      )}
    </main>
  );
}
