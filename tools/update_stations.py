"""Refresh the station snapshot served by the site at data/stations.json.

The app reads stations from your own domain only, so visitors' browsers never
contact the upstream directory. Each stream is also checked once here, so the
app can show which stations are on air ("On air" filter).

    python tools/update_stations.py            # download + check streams
    python tools/update_stations.py --no-check # download only (faster)
    python tools/update_stations.py --extras-only  # only re-apply data/extra-stations.json

Stations added by hand (from add-station.html requests) live in data/extra-stations.json and are
merged in on every run, ahead of the directory's stations.

Run it as often as you like (daily keeps on-air status fresh), then upload
data/stations.json.
"""
import concurrent.futures as cf
import json
import os
import re
import sys
import time
import ssl
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
EXTRA = os.path.join(os.path.dirname(__file__), "..", "data", "extra-stations.json")
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


# Some stream servers only offer older TLS 1.2 ciphers that browsers still accept but Python's OpenSSL refuses.
# Checking only (no data is sent), so allow them, otherwise those stations would be marked off air.
LEGACY_TLS = ssl.create_default_context()
LEGACY_TLS.set_ciphers("ALL:@SECLEVEL=0")


def probe(url, timeout=8):
    """True if the stream answers with audio within the timeout (reads only a few bytes)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Icy-MetaData": "0", "Range": "bytes=0-2047"})
        with urllib.request.urlopen(req, timeout=timeout, context=LEGACY_TLS) as res:
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


def extras():
    """Hand-added stations from data/extra-stations.json, in the same slim shape (ids start with "x-")."""
    if not os.path.exists(EXTRA):
        return []
    with open(EXTRA, encoding="utf-8") as f:
        items = json.load(f).get("stations", [])
    out, seen = [], set()
    for i, s in enumerate(items):
        sid, url, name = str(s.get("id") or "").strip(), str(s.get("stream") or "").strip(), str(s.get("name") or "").strip()
        problem = ((not re.fullmatch(r"[a-z0-9-]{2,60}", sid) and "id must be lowercase letters, numbers, dashes")
                   or (sid in seen and "duplicate id") or (not name and "missing name")
                   or (not url.startswith("https://") and "stream must start with https://"))
        if problem:
            print(f"  extra-stations.json item {i + 1} ({sid or name or '?'}) skipped: {problem}")
            continue
        seen.add(sid)
        place = ", ".join(x for x in (str(s.get("city") or "").strip(), str(s.get("province") or "").strip()) if x)
        out.append({
            "u": "x-" + sid, "n": name, "url": url, "hp": s.get("website") or "", "f": s.get("logo") or "",
            "t": s.get("tags") or "", "st": place, "la": s.get("lat"), "lo": s.get("lng"),
            "b": s.get("bitrate") or 0, "h": 1 if re.search(r"\.m3u8(\?|$)", url, re.I) else 0,
            "v": s.get("votes", 50), "ok": 1, "a": str(s.get("added") or ""),
            # Directory listings this one replaces (old names of the same station), dropped on save.
            "_replaces": [str(x) for x in (s.get("replaces") or [])],
        })
    return out


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", str(s or "").lower())


def drop_replaced(mine, rest):
    """A hand-added station with the same name as a directory one merges with it in the app.
    Drop the directory copy's streams that did not answer, so the player starts with the working one."""
    names = {norm(r["n"]) for r in mine}
    gone = {norm(x) for r in mine for x in r.get("_replaces", [])} - names
    keep = [r for r in rest if norm(r["n"]) not in gone and not (norm(r["n"]) in names and r.get("on") == 0)]
    if len(keep) != len(rest):
        print(f"  replaced {len(rest) - len(keep)} dead directory streams with hand-added ones")
    return keep


def save(slim, checked):
    for r in slim:
        r.pop("_replaces", None)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"t": int(time.time() * 1000), "checked": checked, "d": slim}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(slim)} stations to {os.path.normpath(OUT)} ({os.path.getsize(OUT) // 1024} KB)")


def main():
    mine = extras()
    print(f"Hand-added stations: {len(mine)}")
    if "--extras-only" in sys.argv:
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
        rest = [r for r in old["d"] if not str(r.get("u", "")).startswith("x-")]
        if "--no-check" not in sys.argv and mine:
            check_all(mine)
            for r in mine:
                print(f"  {r['n']}: {'on air' if r.get('on') else 'NOT answering'}")
        save(mine + drop_replaced(mine, rest), old.get("checked"))
        return
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
    slim = mine + slim
    checked = None
    if "--no-check" not in sys.argv:
        print(f"Checking {len(slim)} streams (about 1-3 minutes)…")
        check_all(slim)
        checked = int(time.time() * 1000)
        on = sum(r.get("on", 0) for r in slim)
        print(f"On air: {on} of {len(slim)} streams answered")
        slim = mine + drop_replaced(mine, slim[len(mine):])
    save(slim, checked)


if __name__ == "__main__":
    sys.exit(main())
