"""Build the upload package: dist/ with minified JS/CSS (no comments), then filradio-xyz-upload.zip.

    python tools/build.py

Source files stay readable in the repo; only dist/ is uploaded to the host.
"""
import os
import re
import shutil
import subprocess
import sys
import zipfile
import datetime
import html
import json

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
ZIP = os.path.join(os.path.dirname(ROOT), "filradio-xyz-upload.zip")
FILES = ["index.html", "stats.html", "manifest.webmanifest", "sw.js", "icon.svg", "og-image.png",
         "robots.txt", "sitemap.xml", "ads.txt", "privacy.html", "add-station.html", "404.html", "promo.json",
         "embed.html", "widget.js", "widget.html", "sponsor.json", ".htaccess"]
DIRS = ["css", "js", "icons", "screenshots", "data"]
TERSER = ["npx", "--yes", "terser@5.31.6"]


def minify_js(path):
    out = subprocess.run(TERSER + [path, "--compress", "passes=2", "--mangle", "--comments", "false"],
                         capture_output=True, text=True, encoding="utf-8", shell=os.name == "nt")
    if out.returncode != 0:
        sys.exit(f"terser failed on {path}:\n{out.stderr}")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(out.stdout)


def minify_css(path):
    with open(path, encoding="utf-8") as f:
        css = f.read()
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)        # comments
    css = re.sub(r"\s+", " ", css)                          # collapse whitespace
    css = re.sub(r"\s*([{};,>])\s*", r"\1", css)            # around punctuation (not ':' — breaks selectors)
    css = css.replace(";}", "}")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(css.strip())


def strip_html_comments(path):
    with open(path, encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r"<!--(?!\[if).*?-->\s*", "", html, flags=re.S)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)


def popular_stations(limit=40):
    """Top stations by listener votes, as crawlable links to their pages (plain text when a station has none)."""
    with open(os.path.join(ROOT, "data", "stations.json"), encoding="utf-8") as f:
        rows = json.load(f)["d"]
    try:
        with open(os.path.join(ROOT, "data", "page-slugs.json"), encoding="utf-8") as f:
            slugs = json.load(f)
    except (OSError, ValueError):
        slugs = {}
    seen, names = set(), []
    for r in sorted(rows, key=lambda r: -(r.get("v") or 0)):
        name = re.sub(r"\s+", " ", (r.get("n") or "")).strip()
        key = re.sub(r"[^a-z0-9]", "", name.lower())
        if not name or len(name) > 40 or key in seen or not r.get("ok"):
            continue
        seen.add(key)
        names.append(f'<a href="/station/{slugs[key]}/">{html.escape(name)}</a>' if key in slugs else html.escape(name))
        if len(names) >= limit:
            break
    return names


def seo_pass():
    """Fill the popular-stations paragraph and stamp the sitemap with today's date (dist/ only)."""
    idx = os.path.join(DIST, "index.html")
    with open(idx, encoding="utf-8") as f:
        page = f.read()
    names = popular_stations()
    text = (("<b>Popular stations on FilRadio:</b> " + ", ".join(names) + ". ") if names else "") \
        + '<a href="/stations/">Browse all stations by city</a> or <a href="/games/">play the free games</a>.'
    page = page.replace('<p class="about popular" id="popularStations"></p>',
                        f'<p class="about popular" id="popularStations">{text}</p>', 1)
    with open(idx, "w", encoding="utf-8", newline="\n") as f:
        f.write(page)

    sm = os.path.join(DIST, "sitemap.xml")
    with open(sm, encoding="utf-8") as f:
        xml = f.read()
    today = datetime.date.today().isoformat()
    xml = re.sub(r"(<loc>https://filradio\.xyz/</loc>\s*<lastmod>)[^<]*", rf"\g<1>{today}", xml, count=1)
    with open(sm, "w", encoding="utf-8", newline="\n") as f:
        f.write(xml)
    return len(names)


def _force_remove(func, path, _exc):
    # Windows: clear read-only flags and retry
    os.chmod(path, 0o666)
    func(path)


def clean_dist():
    if not os.path.exists(DIST):
        os.makedirs(DIST)
        return
    # Empty the folder instead of deleting it (Windows keeps a lock on open folders).
    for name in os.listdir(DIST):
        p = os.path.join(DIST, name)
        if os.path.isdir(p):
            shutil.rmtree(p, onerror=_force_remove)
        else:
            os.chmod(p, 0o666)
            os.remove(p)


def stamp_data_version():
    """Put the stations.json time into dist/js/app.js so browsers drop their saved list when it changes."""
    with open(os.path.join(ROOT, "data", "stations.json"), encoding="utf-8") as f:
        ver = str(json.load(f).get("t") or "")
    app = os.path.join(DIST, "js", "app.js")
    with open(app, encoding="utf-8") as f:
        js = f.read()
    if 'const DATA_VER = "dev";' not in js:
        sys.exit("build: DATA_VER line not found in js/app.js")
    js = js.replace('const DATA_VER = "dev";', f'const DATA_VER = "{ver}";', 1)
    with open(app, "w", encoding="utf-8", newline="\n") as f:
        f.write(js)
    return ver


def main():
    clean_dist()
    for f in FILES:
        shutil.copy2(os.path.join(ROOT, f), os.path.join(DIST, f))
    for d in DIRS:
        shutil.copytree(os.path.join(ROOT, d), os.path.join(DIST, d))
    print(f"Station data version: {stamp_data_version()}")
    # Station, city and hub pages + sitemap entries (before seo_pass, which links to them)
    out = subprocess.run(["node", os.path.join(ROOT, "tools", "build_pages.mjs"), DIST], capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        sys.exit(f"build_pages failed:\n{out.stderr}")
    print(out.stdout.strip())
    n = seo_pass()
    print(f"SEO: {n} popular stations added, sitemap dated today")
    for dirpath, _, files in os.walk(DIST):
        for f in files:
            p = os.path.join(dirpath, f)
            if f.endswith(".js"):
                minify_js(p)
            elif f.endswith(".css"):
                minify_css(p)
            elif f.endswith(".html"):
                strip_html_comments(p)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for dirpath, _, files in os.walk(DIST):
            for f in files:
                p = os.path.join(dirpath, f)
                z.write(p, os.path.relpath(p, DIST).replace("\\", "/"))
    print(f"Built {DIST} and {ZIP} ({os.path.getsize(ZIP) // 1024} KB)")


if __name__ == "__main__":
    main()
