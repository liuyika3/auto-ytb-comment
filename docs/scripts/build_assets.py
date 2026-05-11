#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate bundled placeholder visuals for academic-site-framework (original artwork, not real trademarks)."""
from __future__ import annotations

import math
import os
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "images"


def truetype(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for p in candidates:
        if os.path.isfile(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def radial_gradient(w: int, h: int, inner: tuple, outer: tuple, cx: float = 0.5, cy: float = 0.42) -> Image.Image:
    img = Image.new("RGB", (w, h))
    px = img.load()
    ix, iy = int(w * cx), int(h * cy)
    max_r = math.hypot(max(ix, w - ix), max(iy, h - iy))
    for y in range(h):
        for x in range(w):
            t = math.hypot(x - ix, y - iy) / max_r
            t = min(1.0, t**0.85)
            r = int(inner[0] * (1 - t) + outer[0] * t)
            g = int(inner[1] * (1 - t) + outer[1] * t)
            b = int(inner[2] * (1 - t) + outer[2] * t)
            px[x, y] = (r, g, b)
    return img


def draw_mesh_triangles(draw: ImageDraw.ImageDraw, w: int, h: int) -> None:
    pts = [
        (0, 0, w * 0.55, 0, w * 0.35, h * 0.45, (18, 32, 48)),
        (w * 0.4, 0, w, 0, w, h * 0.5, (15, 80, 72)),
        (0, h * 0.35, w * 0.5, h, 0, h, (120, 45, 12)),
        (w * 0.45, h * 0.4, w, h * 0.55, w, h, (8, 40, 55)),
    ]
    for x1, y1, x2, y2, x3, y3, fill in pts:
        draw.polygon([(x1, y1), (x2, y2), (x3, y3)], fill=fill)


def save_jpg(img: Image.Image, name: str, q: int = 90) -> None:
    path = OUT / name
    rgb = img.convert("RGB")
    rgb.save(path, "JPEG", quality=q, optimize=True)
    print("wrote", path)


def hero_portrait() -> None:
    w, h = 1200, 1600
    img = radial_gradient(w, h, (35, 55, 70), (8, 12, 20))
    d = ImageDraw.Draw(img)
    # soft spotlight
    for i in range(420, 0, -4):
        a = int(35 * (i / 420) ** 2)
        bbox = [w * 0.5 - i, h * 0.28 - int(i * 1.1), w * 0.5 + i, h * 0.28 + int(i * 1.35)]
        d.ellipse(bbox, fill=(20 + a, 55 + a // 2, 60 + a // 3))
    # abstract "shoulders"
    d.pieslice([w * 0.18, h * 0.42, w * 0.82, h * 1.05], 200, 340, fill=(12, 24, 32))
    d.pieslice([w * 0.22, h * 0.48, w * 0.78, h * 0.98], 20, 160, fill=(18, 36, 44))
    # monogram ring
    cx, cy = w * 0.5, h * 0.34
    for r in (220, 200, 180):
        d.arc([cx - r, cy - r, cx + r, cy + r], 30, 330, width=3, fill=(234, 179, 8))
    font = truetype(110)
    d.text((cx - 95, cy - 95), "YKL", font=font, fill=(248, 250, 252))
    sub = truetype(22)
    d.text((cx - 130, cy + 120), "PLACEHOLDER · REPLACE WITH PHOTO", font=sub, fill=(148, 163, 184))
    save_jpg(img, "hero-portrait.jpg")


def stance_wide() -> None:
    w, h = 1680, 720
    img = Image.new("RGB", (w, h), (250, 246, 238))
    d = ImageDraw.Draw(img)
    # left "code"
    d.rectangle([0, 0, w * 0.48, h], fill=(15, 23, 42))
    for i, y in enumerate(range(80, h - 40, 28)):
        d.rectangle([40, y, 40 + (i % 5) * 60 + 180, y + 10], fill=(51, 65, 85))
    # right "clinical plate"
    d.rectangle([w * 0.48, 0, w, h], fill=(254, 243, 199))
    d.ellipse([w * 0.62, h * 0.18, w * 0.92, h * 0.62], outline=(194, 65, 12), width=6)
    d.arc([w * 0.66, h * 0.28, w * 0.88, h * 0.55], 200, 340, width=14, fill=(15, 118, 110))
    font = truetype(26)
    d.text((60, 40), "AGENT WORKFLOW", font=font, fill=(226, 232, 240))
    d.text((int(w * 0.52), 40), "CLINICAL NUTRITION", font=font, fill=(124, 45, 18))
    save_jpg(img, "stance-wide.jpg")


def card_jovida() -> None:
    w, h = 1200, 900
    img = radial_gradient(w, h, (30, 58, 62), (10, 14, 22))
    d = ImageDraw.Draw(img)
    # fake phone frame
    d.rounded_rectangle([w * 0.28, h * 0.12, w * 0.72, h * 0.88], radius=36, outline=(45, 212, 191), width=5)
    d.rounded_rectangle([w * 0.32, h * 0.18, w * 0.68, h * 0.82], radius=24, fill=(15, 23, 42))
    for i, y in enumerate(range(int(h * 0.28), int(h * 0.72), 36)):
        d.rectangle([w * 0.38, y, w * 0.62, y + 18], fill=(51, 65, 85) if i % 2 else (71, 85, 105))
    d.rounded_rectangle([w * 0.38, h * 0.72, w * 0.62, h * 0.78], radius=8, fill=(234, 88, 12))
    font = truetype(34)
    d.text((w * 0.34, h * 0.06), "Jovida · UI mock (original)", font=font, fill=(204, 251, 241))
    save_jpg(img, "card-jovida.jpg")


def card_greenplatter() -> None:
    w, h = 1200, 900
    img = Image.new("RGB", (w, h), (255, 247, 237))
    d = ImageDraw.Draw(img)
    for i in range(12):
        x = 80 + (i % 4) * 260
        y = 100 + (i // 4) * 200
        d.ellipse([x, y, x + 120, y + 90], fill=(187 + i * 5, 140, 90))
    d.rounded_rectangle([w * 0.55, h * 0.35, w * 0.92, h * 0.78], radius=20, fill=(254, 215, 170), outline=(194, 65, 12), width=4)
    font = truetype(32)
    d.text((60, 50), "Metabolic · meals + constraints", font=font, fill=(124, 45, 18))
    save_jpg(img, "card-greenplatter.jpg")


def card_umich() -> None:
    w, h = 1200, 900
    img = radial_gradient(w, h, (12, 48, 96), (4, 10, 28))
    d = ImageDraw.Draw(img)
    # stadium lights suggestion
    for i in range(16):
        ang = (i / 16) * math.pi
        x = int(w * 0.5 + math.cos(ang) * w * 0.42)
        y = int(h * 0.75 + math.sin(ang) * 40)
        d.line([(w * 0.5, h * 0.2), (x, y)], fill=(250, 204, 21), width=2)
    d.rounded_rectangle([w * 0.12, h * 0.55, w * 0.88, h * 0.88], radius=12, fill=(15, 23, 42))
    font = truetype(36)
    d.text((w * 0.12, h * 0.12), "Performance nutrition (abstract)", font=font, fill=(226, 232, 240))
    save_jpg(img, "card-umich.jpg")


def tl_square(seed: str, colors: tuple) -> Image.Image:
    w = h = 800
    img = radial_gradient(w, h, colors[0], colors[1])
    d = ImageDraw.Draw(img)
    draw_mesh_triangles(d, w, h)
    font = truetype(42)
    d.text((40, 40), seed, font=font, fill=(248, 250, 252))
    return img


def filmstrip_tl() -> None:
    save_jpg(tl_square("BEIJING\nDESK", ((40, 30, 24), (12, 10, 8))), "tl-fluxvita.jpg")
    save_jpg(tl_square("MICHIGAN\nLAKE", ((20, 60, 90), (5, 15, 30))), "tl-green.jpg")
    save_jpg(tl_square("CLINICAL\nFLOOR", ((55, 20, 18), (15, 8, 8))), "tl-umich.jpg")
    save_jpg(tl_square("STAGE\nQ&A", ((30, 22, 60), (8, 8, 20))), "tl-speaker.jpg")


def footer_cta() -> None:
    w, h = 1920, 1080
    img = Image.new("RGB", (w, h), (18, 22, 32))
    d = ImageDraw.Draw(img)
    draw_mesh_triangles(d, w, h)
    # warm overlay
    warm = Image.new("RGB", (w, h), (180, 70, 20))
    img = Image.blend(img, warm, 0.35)
    d = ImageDraw.Draw(img)
    font = truetype(72)
    d.text((80, h // 2 - 60), "COLLABORATE", font=font, fill=(255, 251, 235))
    save_jpg(img, "footer-cta.jpg")


def work_header() -> None:
    w, h = 1800, 600
    img = Image.new("RGB", (w, h), (15, 23, 42))
    d = ImageDraw.Draw(img)
    xs = [0.08, 0.28, 0.52, 0.76]
    for i, x in enumerate(xs):
        d.rounded_rectangle([w * x, h * 0.18, w * (x + 0.18), h * 0.82], radius=10, fill=(30 + i * 15, 50 + i * 10, 70))
    font = truetype(40)
    d.text((40, 40), "TIMELINE COLLAGE (original)", font=font, fill=(248, 250, 252))
    save_jpg(img, "work-header.jpg")


def work_section(name: str, label: str, c1: tuple, c2: tuple) -> None:
    w, h = 1600, 900
    img = radial_gradient(w, h, c1, c2)
    d = ImageDraw.Draw(img)
    font = truetype(48)
    d.text((60, 60), label, font=font, fill=(248, 250, 252))
    sub = truetype(24)
    d.text((60, 130), "Bundled abstract · not official product UI", font=sub, fill=(203, 213, 225))
    save_jpg(img, name)


def about_images() -> None:
    w, h = 1600, 900
    img = radial_gradient(w, h, (60, 40, 90), (15, 10, 30))
    d = ImageDraw.Draw(img)
    d.polygon([(0, h), (w * 0.35, h * 0.35), (w * 0.55, h)], fill=(20, 35, 60))
    font = truetype(44)
    d.text((60, 60), "Academic backdrop (original)", font=font, fill=(248, 250, 252))
    save_jpg(img, "about-header.jpg")

    w, h = 1200, 900
    img = radial_gradient(w, h, (20, 80, 70), (8, 20, 40))
    d = ImageDraw.Draw(img)
    d.rectangle([w * 0.15, h * 0.35, w * 0.85, h * 0.72], fill=(250, 250, 250))
    for i in range(6):
        d.rectangle([w * 0.2 + i * 110, h * 0.42, w * 0.28 + i * 110, h * 0.65], fill=(15, 118, 110) if i % 2 else (234, 88, 12))
    d.text((60, 60), "Campus abstract (not official seal)", font=truetype(32), fill=(240, 253, 250))
    save_jpg(img, "about-campus.jpg")

    w, h = 1500, 1000
    img = Image.new("RGB", (w, h), (28, 25, 22))
    d = ImageDraw.Draw(img)
    for i in range(4):
        d.rounded_rectangle([80 + i * 320, 200, 360 + i * 320, 780], radius=8, outline=(212, 175, 55), width=4)
        d.text((120 + i * 320, 420), f"CERT {i+1}", font=truetype(28), fill=(253, 230, 138))
    d.text((80, 80), "Credentials still life (placeholder)", font=truetype(36), fill=(250, 250, 249))
    save_jpg(img, "about-credentials.jpg")


def work_stock_banner() -> None:
    w, h = 1920, 560
    img = radial_gradient(w, h, (18, 50, 72), (6, 10, 18))
    d = ImageDraw.Draw(img)
    font = truetype(44)
    d.text((60, 80), "Work hub banner (stock-style placeholder)", font=font, fill=(248, 250, 252))
    sub = truetype(22)
    d.text((60, 160), "Replace via sync_assets.py + Unsplash pulls", font=sub, fill=(203, 213, 225))
    save_jpg(img, "work-stock-banner.jpg")


def cert_panel(title: str, subtitle: str, name: str) -> None:
    w, h = 1200, 1700
    img = radial_gradient(w, h, (28, 32, 42), (8, 12, 20))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([80, 120, w - 80, h - 120], radius=16, outline=(212, 175, 55), width=5)
    d.text((120, 200), title, font=truetype(52), fill=(253, 230, 138))
    d.text((120, 300), subtitle, font=truetype(28), fill=(226, 232, 240))
    d.text((120, 400), "PLACEHOLDER — replace with scan", font=truetype(24), fill=(148, 163, 184))
    save_jpg(img, name)
    thumb = img.resize((560, 320), Image.Resampling.LANCZOS)
    thumb.save(OUT / name.replace(".jpg", "-thumb.jpg"), "JPEG", quality=86, optimize=True)
    print("wrote", OUT / name, OUT / name.replace(".jpg", "-thumb.jpg"))


def edu_logo_stub(label: str, name: str, c1: tuple, c2: tuple) -> None:
    w = h = 512
    img = radial_gradient(w, h, c1, c2)
    d = ImageDraw.Draw(img)
    d.text((40, 220), label, font=truetype(38), fill=(248, 250, 252))
    d.text((40, 290), "logo stub", font=truetype(20), fill=(203, 213, 225))
    save_jpg(img, name)


def edu_degree_stub() -> None:
    w, h = 1800, 1400
    img = radial_gradient(w, h, (30, 24, 60), (8, 8, 20))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([w * 0.12, h * 0.18, w * 0.88, h * 0.82], radius=24, fill=(250, 250, 252), outline=(15, 23, 42), width=4)
    d.text((int(w * 0.16), int(h * 0.32)), "BSc · Kinesiology (stub)", font=truetype(40), fill=(15, 23, 42))
    d.text((int(w * 0.16), int(h * 0.44)), "U of T degree placeholder", font=truetype(26), fill=(71, 85, 105))
    save_jpg(img, "edu-uoft-degree.jpg")


def square_app_icon(src_name: str, dst_name: str) -> None:
    src = OUT / src_name
    if not src.is_file():
        return
    im = Image.open(src).convert("RGB")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    crop = im.crop((left, top, left + side, top + side))
    crop.resize((512, 512), Image.Resampling.LANCZOS).save(OUT / dst_name, "JPEG", quality=90, optimize=True)
    print("wrote", OUT / dst_name)


def copy_if_missing(src: str, dst: str) -> None:
    a, b = OUT / src, OUT / dst
    if b.is_file():
        return
    if a.is_file():
        shutil.copy2(a, b)
        print("alias", dst, "<-", src)


def ensure_html_bundle_filenames() -> None:
    """Filenames referenced by site HTML; aliases + icons so portable zip is never empty."""
    work_section("work-stock-clinical.jpg", "Clinical track (placeholder)", (20, 40, 90), (8, 12, 28))
    work_section("work-stock-ai-health.jpg", "AI health track (placeholder)", (18, 55, 60), (5, 10, 18))
    work_section("work-stock-roadshow.jpg", "Roadshow track (placeholder)", (50, 20, 70), (15, 8, 25))
    work_stock_banner()
    cert_panel("RDN", "Commission on Dietetic Registration", "cert-rdn.jpg")
    cert_panel("CSCS", "NSCA Strength & Conditioning", "cert-cscs.jpg")
    edu_logo_stub("UMich", "edu-umich-logo.jpg", (12, 48, 96), (4, 10, 28))
    edu_logo_stub("U of T", "edu-uoft-logo.jpg", (40, 20, 80), (10, 8, 28))
    edu_degree_stub()
    for i in (1, 2, 3):
        copy_if_missing("work-jovida.jpg", f"work-jv-{i}.jpg")
        copy_if_missing("work-greenplatter.jpg", f"work-gp-{i}.jpg")
        copy_if_missing("work-speaking.jpg", f"work-speech-{i}.jpg")
    copy_if_missing("work-jovida.jpg", "jovida-team.jpg")
    copy_if_missing("work-umich-clinical.jpg", "work-umich-ww-members.jpg")
    copy_if_missing("work-stock-clinical.jpg", "home-work-clinical.jpg")
    copy_if_missing("work-stock-ai-health.jpg", "home-work-ai.jpg")
    square_app_icon("card-jovida.jpg", "app-icon-jovida.jpg")
    square_app_icon("card-greenplatter.jpg", "app-icon-greenplatter.jpg")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    hero_portrait()
    stance_wide()
    card_jovida()
    card_greenplatter()
    card_umich()
    filmstrip_tl()
    footer_cta()
    work_header()
    work_section("work-jovida.jpg", "Jovida chapter", (18, 55, 60), (5, 10, 18))
    work_section("work-greenplatter.jpg", "GreenPlatter chapter", (90, 40, 20), (30, 12, 8))
    work_section("work-umich-clinical.jpg", "UMich clinical chapter", (20, 40, 90), (8, 12, 28))
    work_section("work-speaking.jpg", "Speaking chapter", (50, 20, 70), (15, 8, 25))
    about_images()
    ensure_html_bundle_filenames()
    print("done.")


if __name__ == "__main__":
    main()
