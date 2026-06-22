#!/usr/bin/env python3
"""
Rebuild ALL Chrome Web Store graphic assets for Spoiler Shield from store/sources/.

    python3 store/tools/build_assets.py

Inputs  (store/sources/):
  emblem-baseline-1254.png        AI-generated app emblem (square)        -> store icon
  promo-master-1536x1024.png      AI-generated promo banner               -> marquee, small tile, hero
  screenshot-frame-1586x992.png   AI-generated branded card frame         -> framed screenshots
  raw-screenshots/*.png           real captures of the extension running  -> placed in the frame

Outputs (store/assets/ = the files you upload; store/backups/screenshots-nocaption/ = framed but un-captioned).

No third-party libraries: imgkit.py (pure-stdlib PNG) + ttf.py (pure-stdlib TrueType) sit beside this file.
Captions need a bold TrueType font; the first one found in FONT_CANDIDATES is used, else captions are skipped
(the un-captioned framed shots are still written to backups/).
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from imgkit import read_png, write_png, crop, resize, paste
from ttf import Font, text_mask, blend

STORE = os.path.dirname(HERE)
SRC = os.path.join(STORE, "sources")
RAW = os.path.join(SRC, "raw-screenshots")
ASSETS = os.path.join(STORE, "assets")
NOCAP = os.path.join(STORE, "backups", "screenshots-nocaption")
os.makedirs(ASSETS, exist_ok=True)
os.makedirs(NOCAP, exist_ok=True)

FONT_CANDIDATES = [
    os.path.join(HERE, "caption-font.ttf"),  # drop any bold .ttf here to bundle it
    "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]
CAPTION_SIZE = 46

# raw screenshot file -> (output name, caption)
SHOTS = [
    ("youtube-search-no-durations.png",     "screenshot-2-youtube-no-durations-1280x800.png",   "No durations on thumbnails"),
    ("cs2-tournament-no-progressbar.png",   "screenshot-3-cs2-no-progressbar-1280x800.png",     "No progress bar, no spoilers"),
    ("youtube-chapters-no-timestamps.png",  "screenshot-4-chapters-no-timestamps-1280x800.png", "Chapters without timestamps"),
    ("twitch-vod-no-seekbar.png",           "screenshot-5-twitch-no-seekbar-1280x800.png",      "Twitch VODs without a seekbar"),
    ("twitch-videos-tab-no-durations.png",  "screenshot-6-twitch-videos-no-durations-1280x800.png", "VOD lengths hidden"),
]


def find_font():
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def contain(sw, sh, bw, bh):
    s = min(bw / sw, bh / sh)
    return max(1, int(sw * s)), max(1, int(sh * s))


def main():
    # ---- 1. Store icon (128) - full emblem downscaled ----
    w, h, px = read_png(os.path.join(SRC, "emblem-baseline-1254.png"))
    iw, ih, ipx = resize(w, h, px, 128, 128)
    write_png(os.path.join(ASSETS, "store-icon-128.png"), iw, ih, ipx)
    print("icon       -> store-icon-128.png")

    # ---- 2. Promo master -> marquee, small tile, hero ----
    w2, h2, p2 = read_png(os.path.join(SRC, "promo-master-1536x1024.png"))
    band = round(w2 / 2.5)                       # marquee 2.5:1
    cw, ch, cp = crop(w2, h2, p2, 0, (h2 - band) // 2, w2, band)
    mw, mh, mp = resize(cw, ch, cp, 1400, 560)
    write_png(os.path.join(ASSETS, "marquee-1400x560.png"), mw, mh, mp)
    print("marquee    -> marquee-1400x560.png")

    th = round(w2 / (440 / 280))                 # small tile 440:280
    cw, ch, cp = crop(w2, h2, p2, 0, (h2 - th) // 2, w2, th)
    sw_, sh_, sp = resize(cw, ch, cp, 440, 280)
    write_png(os.path.join(ASSETS, "small-tile-440x280.png"), sw_, sh_, sp)
    print("small tile -> small-tile-440x280.png")

    hh = round(w2 / 1.6)                          # hero screenshot 1.6:1
    cw, ch, cp = crop(w2, h2, p2, 0, (h2 - hh) // 2, w2, hh)
    hw, hgt, hp = resize(cw, ch, cp, 1280, 800)
    write_png(os.path.join(ASSETS, "screenshot-1-hero-1280x800.png"), hw, hgt, hp)
    print("hero       -> screenshot-1-hero-1280x800.png")

    # ---- 3. Framed + captioned screenshots ----
    fw, fh, fpx = read_png(os.path.join(SRC, "screenshot-frame-1586x992.png"))
    W, H, base = resize(fw, fh, fpx, 1280, 800)

    def white(x, y):
        o = (y * W + x) * 3
        return base[o] > 235 and base[o + 1] > 235 and base[o + 2] > 235
    cx, cy = W // 2, H // 2
    L = cx
    while L > 0 and white(L - 1, cy): L -= 1
    R = cx
    while R < W - 1 and white(R + 1, cy): R += 1
    T = cy
    while T > 0 and white(cx, T - 1): T -= 1
    B = cy
    while B < H - 1 and white(cx, B + 1): B += 1
    cardW, cardH = R - L + 1, B - T + 1
    SIDE, TB = 12, 8
    iw, ih = cardW - 2 * SIDE, cardH - 2 * TB

    # emblem position (rose slash / white clock in the top-left strip) for caption placement
    exmin = eymin = 10**9; exmax = eymax = 0
    for y in range(0, 210):
        for x in range(0, 300):
            o = (y * W + x) * 3
            r, g, b = base[o], base[o + 1], base[o + 2]
            if (r > 170 and g < 130) or (r > 225 and g > 225 and b > 225):
                exmin = min(exmin, x); exmax = max(exmax, x)
                eymin = min(eymin, y); eymax = max(eymax, y)
    cap_x = exmax + 34
    cap_vc = (eymin + eymax) // 2

    fontpath = find_font()
    font = Font(fontpath) if fontpath else None
    print("caption font:", fontpath or "NONE FOUND (captions skipped)")

    for raw, out, caption in SHOTS:
        sw, sh, spx = read_png(os.path.join(RAW, raw))
        nw, nh = contain(sw, sh, iw, ih)
        rw, rh, rpx = resize(sw, sh, spx, nw, nh)
        canvas = bytearray(base)
        px_ = L + (cardW - nw) // 2
        py_ = T + (cardH - nh) // 2
        paste(W, H, canvas, rw, rh, rpx, px_, py_)
        write_png(os.path.join(NOCAP, out), W, H, canvas)   # un-captioned backup
        if font:
            mw2, mh2, _, m = text_mask(font, caption, CAPTION_SIZE)
            blend(canvas, W, H, m, mw2, mh2, cap_x, cap_vc - mh2 // 2,
                  (255, 255, 255), shadow=(2, 2, (18, 14, 38), 0.55))
        write_png(os.path.join(ASSETS, out), W, H, canvas)
        print(f"shot       -> {out}" + ("" if font else "  (no caption)"))

    print("\nDone. Upload files are in store/assets/.")


if __name__ == "__main__":
    main()
