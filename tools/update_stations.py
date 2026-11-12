"""Refresh the station snapshot served by the site at data/stations.json.

The app reads stations from your own domain only, so visitors' browsers never
contact the upstream directory. Each stream is also checked once here, so the
app can show which stations are on air ("On air" filter).

    python tools/update_stations.py            # download + check streams
    python tools/update_stations.py --no-check # download only (faster)

Run it as often as you like (daily keeps on-air status fresh), then upload
data/stations.json.
"""
import concurrent.futures as cf
import json
import os
import re
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
UA = "FilRadio-check/1.0"
AUDIO = re.compile(r"audio/|application/(ogg|octet-stream|vnd\.apple\.mpegurl|x-mpegurl)|video/mp2t", re.I)


def fetch():
    last = None
    for host in HOSTS:
        try:
            req = urllib.request.Request(host + PATH, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as res:
                return json.load(res)
        except Exception as e:  # try the next mirror
            last = e
    raise SystemExit(f"Could not download stations: {last}")


def candidates(url):
    """URLs the app would try on an https site, in order."""
    if url.startswith("https://"):
        return [url]
    if re.match(r"^http://(\d+\.\d+\.\d+\.\d+|\[)", url):
        return []  # IP-only http stream: can't be upgraded, plays only in the browser's own player
    return ["https://" + url[len("http://"):]]


def probe(url, timeout=8):
    """True if the stream answers with audio within the timeout (reads only a few bytes)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Icy-MetaData": "0", "Range": "bytes=0-2047"})
        with urllib.request.urlopen(req, timeout=timeout) as res:
            ctype = res.headers.get("Content-Type", "")
            if res.status not in (200, 206):
                return False
            if AUDIO.search(ctype) or res.headers.get("icy-name") or res.headers.get("icy-br"):
                return True
            head = res.read(512)
            return head.startswith(b"#EXTM3U") or head[:3] == b"ID3" or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf1", b"\xff\xf9")
    except Exception:
        return False


def check_all(rows):
    jobs = {}
    with cf.ThreadPoolExecutor(max_workers=32) as ex:
        for r in rows:
            urls = candidates(r["url"])
            jobs[ex.submit(lambda us=urls: any(probe(u) for u in us[:2]))] = r
        done = 0
        for fut in cf.as_completed(jobs):
            jobs[fut]["on"] = 1 if fut.result() else 0
            done += 1
            if done % 100 == 0:
                print(f"  checked {done}/{len(rows)}")


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
    checked = None
    if "--no-check" not in sys.argv:
        print(f"Checking {len(slim)} streams (about 1-3 minutes)…")
        check_all(slim)
        checked = int(time.time() * 1000)
        on = sum(r.get("on", 0) for r in slim)
        print(f"On air: {on} of {len(slim)} streams answered")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"t": int(time.time() * 1000), "checked": checked, "d": slim}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(slim)} stations to {os.path.normpath(OUT)} ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
