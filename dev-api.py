#!/usr/bin/env python3
"""Local dev server — routes /api/wsb/* to the three handler modules."""
import sys
import os
import json
import urllib.parse
import importlib.util
from http.server import HTTPServer, BaseHTTPRequestHandler

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "api", "wsb")


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(BASE, f"{name}.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


hot_mod        = _load("hot")
ticker_mod     = _load("ticker")
signals_mod    = _load("signals")
technicals_mod = _load("technicals")


class DevHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path   = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/api/wsb/hot":
                data = hot_mod._fetch(25)

            elif path == "/api/wsb/ticker":
                symbol = (params.get("symbol", [""])[0] or "").upper().strip()
                posts  = ticker_mod._fetch(50)
                data   = [p for p in posts if symbol in p["tickers"]] if symbol else posts

            elif path == "/api/wsb/signals":
                posts = signals_mod._fetch(50)
                agg: dict = {}
                for post in posts:
                    for t in post["tickers"]:
                        if t not in agg:
                            agg[t] = {
                                "ticker": t,
                                "mentions": 0,
                                "bullish_count": 0,
                                "bearish_count": 0,
                            }
                        agg[t]["mentions"]      += 1
                        agg[t]["bullish_count"] += post["bullish_count"]
                        agg[t]["bearish_count"] += post["bearish_count"]
                for td in agg.values():
                    total = td["bullish_count"] + td["bearish_count"]
                    if total > 0:
                        raw = (td["bullish_count"] - td["bearish_count"]) / total
                        td["sentiment_score"] = round(max(-1.0, min(1.0, raw)), 3)
                    else:
                        td["sentiment_score"] = 0.0
                data = sorted(agg.values(), key=lambda x: x["mentions"], reverse=True)

            elif path == "/api/wsb/technicals":
                symbol = (params.get("symbol", [""])[0] or "").upper().strip()
                if not symbol:
                    self._json(400, {"error": "symbol is required"})
                    return
                data = technicals_mod._get_technicals(symbol)

            else:
                self._json(404, {"error": "not found"})
                return

            self._json(200, data)

        except Exception as exc:
            self._json(500, {"error": str(exc)})

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, fmt, *args):
        print(f"[API] {self.command:7s} {self.path.split('?')[0]:30s}  {fmt % args}")


if __name__ == "__main__":
    port   = int(os.environ.get("API_PORT", 8000))
    server = HTTPServer(("0.0.0.0", port), DevHandler)
    print(f"  WSB API  →  http://localhost:{port}/api/wsb/signals")
    server.serve_forever()
