"""Refresh the station snapshot served by the site at data/stations.json.

The app reads stations from your own domain only, so visitors' browsers never
contact the upstream directory. Run this whenever you want fresh data
(e.g. once a month), then upload data/stations.json.

    python tools/update_stations.py
"""
import json
import os
import sys
import time
import urllib.request

HOSTS = [
    "https://de1.api.radio-browser.info",
    "https://de2.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
    "https://fi1.api.radio-browser.info",
]
PATH = "/json/stations/bycountrycodeexact/PH?hidebroken=true&order=votes&reverse=true&limit=5000"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "stations.json")


def fetch():
    last = None
    for host in HOSTS:
        try:
            req = urllib.request.Request(host + PATH, headers={"User-Agent": "FilRadio-snapshot/1.0"})
            with urllib.request.urlopen(req, timeout=40) as res:
                return json.load(res)
        except Exception as e:  # try the next mirror
            last = e
    raise SystemExit(f"Could not download stations: {last}")


def main():
    data = fetch()
    slim = []
    for s in data:
        url = s.get("url_resolved") or s.get("url")
        if not url:
            continue
        slim.append({
            "u": s["stationuuid"], "n": s["name"], "url": url, "hp": s.get("homepage") or "",
            "f": s.get("favicon") or "", "t": s.get("tags") or "", "st": s.get("state") or "",
            "la": s.get("geo_lat"), "lo": s.get("geo_long"), "b": s.get("bitrate") or 0,
            "h": s.get("hls") or 0, "v": s.get("votes") or 0, "ok": s.get("lastcheckok") or 0,
        })
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"t": int(time.time() * 1000), "d": slim}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(slim)} stations to {os.path.normpath(OUT)} ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
