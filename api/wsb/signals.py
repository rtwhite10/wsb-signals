from http.server import BaseHTTPRequestHandler
import json
import re
import requests as _requests

# ── shared helpers (same as hot.py) ─────────────────────────────────────────

_EXCLUDE = frozenset({
    "A", "AN", "THE", "AND", "OR", "BUT", "NOT", "NO", "YES",
    "IN", "ON", "AT", "TO", "FOR", "OF", "BY", "AS", "IS", "AM",
    "ARE", "WAS", "BE", "BEEN", "HAVE", "HAS", "HAD", "DO", "DID",
    "WILL", "CAN", "MAY", "WOULD", "COULD", "SHOULD", "UP", "IF",
    "SO", "HOW", "WHY", "WHO", "MY", "ME", "WE", "US", "YOU",
    "HE", "SHE", "IT", "THEY", "THEM", "WHAT", "WITH", "THIS", "THAT",
    "THEN", "THAN", "FROM", "INTO", "OVER", "BACK", "EVEN", "JUST",
    "ALSO", "ONLY", "WELL", "GOOD", "VERY", "LIKE", "MAKE", "TAKE",
    "KNOW", "MORE", "MOST", "SOME", "MANY", "EACH", "LAST", "NEXT",
    "TIME", "YEAR", "WEEK", "DAYS", "NEED", "WANT", "SAME", "AWAY",
    "ALL", "ANY", "NEW", "OLD", "NOW", "BIG", "BAD", "GET", "GOT",
    "PUT", "LET", "SET", "RUN", "HOT", "TOP", "TWO", "OWN", "SEE",
    "SAY", "ASK", "CUT", "HIT", "WIN", "OWE",
    "DD", "WSB", "YOLO", "FOMO", "OP", "OG", "LOL", "IMO", "TLDR",
    "EDIT", "ETA", "PSA", "TIL", "IIRC", "AFAIK", "TBH", "OTC",
    "CEO", "CFO", "CTO", "COO", "FED", "SEC", "GDP", "CPI",
    "QE", "DXY", "IPO", "ETF",
    "USA", "US", "UK", "EU", "NYC",
    "NEWS", "HUGE", "BREAKING", "UPDATE", "READ", "BUY", "SELL",
    "BULL", "BEAR", "LONG", "SHORT", "CALL", "PUTS", "MOON",
})

_BULLISH = frozenset({
    "moon", "calls", "buy", "long", "bull", "rocket",
    "squeeze", "yolo", "puts", "breakout",
})
_BEARISH = frozenset({
    "puts", "short", "bear", "crash", "sell", "dump", "overvalued", "bubble",
})

_TICKER_RE = re.compile(r'\$([A-Z]{1,5})|\b([A-Z]{3,5})\b')


def _tickers(text: str) -> list:
    seen, out = set(), []
    for m in _TICKER_RE.finditer(text):
        t = m.group(1) or m.group(2)
        if t and t not in _EXCLUDE and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _sentiment(text: str):
    low = text.lower()
    b = sum(1 for w in _BULLISH if w in low)
    s = sum(1 for w in _BEARISH if w in low)
    total = b + s
    if total == 0:
        return "neutral", 0.0, b, s
    raw = max(-1.0, min(1.0, (b - s) / total))
    label = "bullish" if raw > 0.1 else "bearish" if raw < -0.1 else "neutral"
    return label, round(raw, 3), b, s


_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


def _fetch(limit: int = 50) -> list:
    import os
    client_id     = os.environ.get("REDDIT_CLIENT_ID", "")
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET", "")

    if client_id and client_secret:
        tok = _requests.post(
            "https://www.reddit.com/api/v1/access_token",
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
            headers={"User-Agent": "WSBSignals/1.0"},
            timeout=10,
        )
        tok.raise_for_status()
        token = tok.json()["access_token"]
        url     = f"https://oauth.reddit.com/r/wallstreetbets/hot?limit={limit}"
        headers = {"Authorization": f"bearer {token}", "User-Agent": "WSBSignals/1.0"}
    else:
        url     = f"https://www.reddit.com/r/wallstreetbets/hot.json?limit={limit}"
        headers = _HEADERS

    resp = _requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    raw = resp.json()
    posts = []
    for child in raw["data"]["children"]:
        p = child["data"]
        text = f"{p.get('title', '')} {p.get('selftext', '')}"
        label, score, bull, bear = _sentiment(text)
        posts.append({
            "title": p.get("title", ""),
            "url": "https://reddit.com" + p.get("permalink", ""),
            "score": p.get("score", 0),
            "num_comments": p.get("num_comments", 0),
            "tickers": _tickers(text),
            "sentiment": label,
            "sentiment_score": score,
            "bullish_count": bull,
            "bearish_count": bear,
        })
    return posts


def _send_cors(h):
    h.send_header("Access-Control-Allow-Origin", "*")
    h.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
    h.send_header("Access-Control-Allow-Headers", "Content-Type")


# ── Vercel handler ───────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        _send_cors(self)
        self.end_headers()

    def do_GET(self):
        try:
            posts = _fetch(50)

            agg: dict = {}
            for post in posts:
                for ticker in post["tickers"]:
                    if ticker not in agg:
                        agg[ticker] = {
                            "ticker": ticker,
                            "mentions": 0,
                            "bullish_count": 0,
                            "bearish_count": 0,
                        }
                    agg[ticker]["mentions"] += 1
                    agg[ticker]["bullish_count"] += post["bullish_count"]
                    agg[ticker]["bearish_count"] += post["bearish_count"]

            signals = []
            for td in agg.values():
                total = td["bullish_count"] + td["bearish_count"]
                if total > 0:
                    raw = (td["bullish_count"] - td["bearish_count"]) / total
                    td["sentiment_score"] = round(max(-1.0, min(1.0, raw)), 3)
                else:
                    td["sentiment_score"] = 0.0
                signals.append(td)

            signals.sort(key=lambda x: x["mentions"], reverse=True)

            body = json.dumps(signals).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            _send_cors(self)
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}).encode())

    def log_message(self, *_):
        pass
