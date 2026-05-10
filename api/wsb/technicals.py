from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import yfinance as yf


def _rsi(series, period=14):
    delta = series.diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain / loss
    return round((100 - 100 / (1 + rs)).iloc[-1], 1)


def _macd(series, fast=12, slow=26, sig=9):
    ema_f  = series.ewm(span=fast, adjust=False).mean()
    ema_s  = series.ewm(span=slow, adjust=False).mean()
    line   = ema_f - ema_s
    signal = line.ewm(span=sig, adjust=False).mean()
    hist   = line - signal
    return line.iloc[-1], signal.iloc[-1], hist.iloc[-1]


def _get_technicals(symbol: str) -> dict:
    import time
    import requests as _req

    session = _req.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
    })

    ticker = yf.Ticker(symbol, session=session)
    hist   = None
    for attempt in range(3):
        try:
            hist = ticker.history(period="1y")
            if not hist.empty:
                break
        except Exception:
            pass
        time.sleep(1.5)

    if hist is None or hist.empty:
        raise ValueError(f"No price data found for '{symbol}' — Yahoo Finance may be rate-limiting. Try again in a moment.")

    close  = hist["Close"]
    volume = hist["Volume"]

    price      = round(float(close.iloc[-1]), 2)
    prev_close = round(float(close.iloc[-2]), 2)
    change_pct = round((price - prev_close) / prev_close * 100, 2)

    rsi        = _rsi(close)
    rsi_signal = "overbought" if rsi > 70 else "oversold" if rsi < 30 else "neutral"

    macd_val, sig_val, hist_val = _macd(close)
    macd_bias = "bullish" if macd_val > sig_val else "bearish"

    def ma(n):
        return round(float(close.rolling(n).mean().iloc[-1]), 2) if len(close) >= n else None

    ma20, ma50, ma200 = ma(20), ma(50), ma(200)

    above = sum([
        price > ma20  if ma20  else False,
        price > ma50  if ma50  else False,
        price > ma200 if ma200 else False,
    ])
    trend = (
        "strong uptrend" if above == 3 else
        "uptrend"        if above == 2 else
        "downtrend"      if above == 0 else
        "mixed/sideways"
    )

    w52_high = round(float(close.max()), 2)
    w52_low  = round(float(close.min()), 2)

    # near-term support/resistance: look at the 20 days before yesterday
    window     = close.iloc[-22:-2]
    support    = round(float(window.min()), 2)
    resistance = round(float(window.max()), 2)

    vol_today   = int(volume.iloc[-1])
    vol_avg_20d = int(volume.rolling(20).mean().iloc[-1])
    vol_ratio   = round(vol_today / vol_avg_20d, 1) if vol_avg_20d > 0 else 0
    vol_note    = (
        f"{vol_ratio}x average (unusually high)" if vol_ratio > 2 else
        f"{vol_ratio}x average (normal)"          if vol_ratio >= 0.7 else
        f"{vol_ratio}x average (below average)"
    )

    summary = (
        f"{symbol} is in a {trend} at ${price} ({'+' if change_pct >= 0 else ''}{change_pct}% today). "
        f"RSI {rsi} — {rsi_signal}. "
        f"MACD is {macd_bias}. "
        f"Trading {'above' if ma50 and price > ma50 else 'below'} the 50-day MA (${ma50}). "
        f"Near-term support ~${support}, resistance ~${resistance}. "
        f"Volume {vol_note}."
    )

    return {
        "symbol":     symbol,
        "price":      price,
        "change_pct": change_pct,
        "52w_high":   w52_high,
        "52w_low":    w52_low,
        "rsi": {
            "value":  rsi,
            "signal": rsi_signal,
        },
        "macd": {
            "value":     round(float(macd_val), 3),
            "signal":    round(float(sig_val), 3),
            "histogram": round(float(hist_val), 3),
            "bias":      macd_bias,
        },
        "moving_averages": {
            "ma20":  ma20,
            "ma50":  ma50,
            "ma200": ma200,
            "trend": trend,
        },
        "support":    support,
        "resistance": resistance,
        "volume": {
            "today":       vol_today,
            "avg_20d":     vol_avg_20d,
            "ratio":       vol_ratio,
            "description": vol_note,
        },
        "summary": summary,
    }


def _send_cors(h):
    h.send_header("Access-Control-Allow-Origin",  "*")
    h.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
    h.send_header("Access-Control-Allow-Headers", "Content-Type")


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        _send_cors(self)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        symbol = (params.get("symbol", [""])[0] or "").upper().strip()

        if not symbol:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "symbol is required"}).encode())
            return

        try:
            data = _get_technicals(symbol)
            body = json.dumps(data).encode()
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
