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

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
ZIP = os.path.join(os.path.dirname(ROOT), "filradio-xyz-upload.zip")
FILES = ["index.html", "stats.html", "manifest.webmanifest", "sw.js", "icon.svg", "og-image.png",
         "robots.txt", "sitemap.xml"]
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


def main():
    clean_dist()
    for f in FILES:
        shutil.copy2(os.path.join(ROOT, f), os.path.join(DIST, f))
    for d in DIRS:
        shutil.copytree(os.path.join(ROOT, d), os.path.join(DIST, d))
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
