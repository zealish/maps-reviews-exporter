#!/usr/bin/env python3
"""Generate extension icons: green rounded square + Maps-style pin + red star."""
import math
import os
from PIL import Image, ImageDraw

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, "icons")
os.makedirs(OUT, exist_ok=True)


def make(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    r = max(2, size // 5)
    dr.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=(15, 157, 88, 255))

    # white pin: tail + head
    cx, cy = size * 0.5, size * 0.42
    rad = size * 0.25
    dr.polygon(
        [
            (cx - size * 0.13, cy + size * 0.08),
            (cx + size * 0.13, cy + size * 0.08),
            (cx, size * 0.82),
        ],
        fill=(255, 255, 255, 255),
    )
    dr.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(255, 255, 255, 255))

    # red star inside pin head
    ro, ri = size * 0.14, size * 0.06
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rr = ro if i % 2 == 0 else ri
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    dr.polygon(pts, fill=(234, 67, 53, 255))
    return img


for s in (16, 48, 128):
    make(s).save(os.path.join(OUT, f"icon{s}.png"))
    print(f"icon{s}.png written")
