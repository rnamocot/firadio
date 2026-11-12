"""Render the FilRadio icon (same geometry as icon.svg: radio on a Philippine-flag tile) to PNG app icons.

    python tools/make_icons.py
"""
import math
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
BLUE, RED, WHITE = (0, 56, 168, 255), (206, 17, 38, 255), (255, 255, 255, 255)
GOLD, NAVY = (252, 209, 22, 255), (16, 24, 43, 255)


def star_points(cx, cy, r):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.382
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def draw_icon(size, rounded=True, scale=1.0):
    S = size * 4                                    # supersample for smooth edges
    k = S / 512 * scale
    o = S / 2 - 256 * k                             # centre the artwork (maskable safe zone)
    P = lambda x, y: (o + x * k, o + y * k)

    # Flag tile (full bleed), then clip to the rounded square
    flag = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    f = ImageDraw.Draw(flag)
    f.rectangle([0, 0, S, S / 2], fill=BLUE)
    f.rectangle([0, S / 2, S, S], fill=RED)
    tri_tip = S * 210 / 512
    f.polygon([(0, 0), (tri_tip, S / 2), (0, S)], fill=WHITE)
    for cy in (70, 446):
        f.polygon(star_points(S * 34 / 512, S * cy / 512, S * 17 / 512), fill=GOLD)
    mask = Image.new("L", (S, S), 0)
    m = ImageDraw.Draw(mask)
    if rounded:
        m.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 116 / 512), fill=255)
    else:
        m.rectangle([0, 0, S, S], fill=255)
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    im.paste(flag, (0, 0), mask)
    d = ImageDraw.Draw(im)

    def line(x1, y1, x2, y2, w, c):
        d.line([P(x1, y1), P(x2, y2)], fill=c, width=max(1, int(w * k)))
        for x, y in ((x1, y1), (x2, y2)):
            r = w * k / 2
            cx, cy = P(x, y)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)

    def circle(cx, cy, r, fill):
        x, y = P(cx, cy)
        d.ellipse([x - r * k, y - r * k, x + r * k, y + r * k], fill=fill)

    line(318, 178, 386, 96, 18, GOLD)                                     # antenna
    d.polygon([P(*p) for p in star_points(396, 82, 34)], fill=GOLD)       # star tip
    d.rounded_rectangle([*P(79, 167), *P(433, 417)], radius=int(61 * k), fill=NAVY)   # outline
    d.rounded_rectangle([*P(89, 177), *P(423, 407)], radius=int(51 * k), fill=GOLD)   # body
    circle(190, 292, 72, NAVY)                                            # speaker
    for i in range(8):                                                    # flag sun rays
        a = math.radians(i * 45 - 90)
        line(190 + math.cos(a) * 38, 292 + math.sin(a) * 38, 190 + math.cos(a) * 52, 292 + math.sin(a) * 52, 11, GOLD)
    circle(190, 292, 24, GOLD)
    d.rounded_rectangle([*P(290, 226), *P(396, 288)], radius=int(16 * k), fill=NAVY)  # dial window
    for x, top in ((308, 256), (326, 248), (344, 256), (378, 256)):
        line(x, 270, x, top, 7, GOLD)
    line(361, 238, 361, 278, 8, RED)                                      # needle
    circle(314, 350, 22, NAVY)                                            # knobs
    circle(372, 350, 22, NAVY)
    return im.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for s in (192, 512):
        draw_icon(s).save(os.path.join(OUT, f"icon-{s}.png"))
    draw_icon(512, rounded=False, scale=0.78).save(os.path.join(OUT, "icon-maskable-512.png"))
    draw_icon(180, rounded=False, scale=0.9).save(os.path.join(OUT, "apple-touch-icon.png"))
    draw_icon(64).save(os.path.join(OUT, "favicon-64.png"))
    print("icons written to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
