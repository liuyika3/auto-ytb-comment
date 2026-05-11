# -*- coding: utf-8 -*-
"""Resize photos from ../个人网站资料 into ./images/ (keeps HTML paths unchanged)."""
from __future__ import annotations

import json
import shutil
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent / "个人网站资料"
DST = ROOT / "images"
ASSETS_FALLBACK = ROOT.parent / "assets"


def load_rgb(path: Path) -> Image.Image:
    im = Image.open(path)
    if im.mode in ("RGBA", "P"):
        bg = Image.new("RGB", im.size, (250, 250, 248))
        if im.mode == "P":
            im = im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1] if im.mode == "RGBA" else None)
        im = bg
    else:
        im = im.convert("RGB")
    return im


def cover_crop(im: Image.Image, tw: int, th: int) -> Image.Image:
    iw, ih = im.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale + 0.5), int(ih * scale + 0.5)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def contain_resize(im: Image.Image, max_w: int, max_h: int) -> Image.Image:
    im = im.copy()
    im.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    return im


def save_jpg(im: Image.Image, dest: Path, quality: int = 88) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "JPEG", quality=quality, optimize=True)


def contain_in_box(im: Image.Image, tw: int, th: int, fill=(255, 255, 255)) -> Image.Image:
    """Letterbox to tw×th for certificates / mixed aspect."""
    im = im.copy()
    im.thumbnail((tw, th), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (tw, th), fill)
    x = (tw - im.size[0]) // 2
    y = (th - im.size[1]) // 2
    canvas.paste(im, (x, y))
    return canvas


def h_concat_same_height(left: Image.Image, right: Image.Image, h: int = 900) -> Image.Image:
    l = contain_resize(left, 2000, h)
    r = contain_resize(right, 2000, h)
    lh = min(l.size[1], h)
    lw = int(l.size[0] * lh / l.size[1])
    rh = min(r.size[1], h)
    rw = int(r.size[0] * rh / r.size[1])
    l = l.resize((lw, lh), Image.Resampling.LANCZOS)
    r = r.resize((rw, rh), Image.Resampling.LANCZOS)
    gap = 24
    w = lw + gap + rw
    canvas = Image.new("RGB", (w, lh), (252, 250, 245))
    canvas.paste(l, (0, 0))
    canvas.paste(r, (lw + gap, 0))
    return canvas


def _first_existing(paths: tuple[Path, ...]) -> Path | None:
    for p in paths:
        if p.is_file():
            return p
    return None


def _find_in_assets(substr: str) -> Path | None:
    if not ASSETS_FALLBACK.is_dir():
        return None
    for p in ASSETS_FALLBACK.rglob("*"):
        if p.is_file() and substr in p.name:
            return p
    return None


def resolve_jovida_team_src() -> Path | None:
    return _first_existing(
        (
            SRC / "jovida团队合影.jpg",
            SRC / "Jovida团队合影.jpg",
            SRC / "Jovida团队合影.png",
            SRC / "Jovida团队合影.webp",
        )
    ) or _find_in_assets("dbca9729")


def resolve_umich_ww_members_src() -> Path | None:
    return _first_existing(
        (
            SRC / "社团团队活动合影.jpg",
            SRC / "社团团队活动合影.png",
            SRC / "密歇根体重管理社团成员活动.jpg",
            SRC / "密歇根体重管理社团成员活动.png",
            SRC / "密歇根体重管理社团成员活动.webp",
        )
    ) or _find_in_assets("e5015c35")


def _download_resize_jpeg(url: str, dest: Path, max_w: int, max_h: int, quality: int = 86) -> bool:
    """Fetch remote JPEG/PNG, resize with contain, save as JPEG."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; LiuSiteSync/1.0)"})
        with urllib.request.urlopen(req, timeout=45) as r:
            raw = r.read()
        im = Image.open(BytesIO(raw))
        if im.mode in ("RGBA", "P"):
            bg = Image.new("RGB", im.size, (252, 252, 250))
            if im.mode == "P":
                im = im.convert("RGBA")
            bg.paste(im, mask=im.split()[-1] if im.mode == "RGBA" else None)
            im = bg
        else:
            im = im.convert("RGB")
        save_jpg(contain_resize(im, max_w, max_h), dest, quality)
        return True
    except Exception as e:
        print("WARN:", dest.name, str(e)[:120])
        return False


def export_work_stock_thumbnails() -> None:
    """一级入口用网图示意（Unsplash）；二级页仍用资料实拍。"""
    # 医院走廊、健康科技场景、会议演讲 — 仅作列表/横幅示意，非本人现场
    pairs = (
        (
            "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&w=1800&q=82",
            DST / "work-stock-clinical.jpg",
            1600,
            1000,
        ),
        (
            "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&w=1800&q=82",
            DST / "work-stock-ai-health.jpg",
            1600,
            1000,
        ),
        (
            "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&w=1800&q=82",
            DST / "work-stock-roadshow.jpg",
            1600,
            1000,
        ),
        (
            "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&w=2000&q=82",
            DST / "work-stock-banner.jpg",
            1920,
            560,
        ),
    )
    for url, dest, mw, mh in pairs:
        if not _download_resize_jpeg(url, dest, mw, mh):
            save_jpg(Image.new("RGB", (min(mw, 1200), min(mh, 800)), (236, 238, 242)), dest, 86)


def export_app_icons() -> None:
    """Jovida：App Store 官方图标。GreenPlatter：资料夹内图标优先，否则用首张产品截图裁方图占位。"""
    jv_url = None
    try:
        req = urllib.request.Request(
            "https://itunes.apple.com/lookup?id=6752009326",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            d = json.loads(resp.read().decode())
        if d.get("results"):
            jv_url = d["results"][0].get("artworkUrl512") or d["results"][0].get("artworkUrl100")
    except Exception as e:
        print("WARN: iTunes lookup for Jovida icon:", str(e)[:100])

    if jv_url and _download_resize_jpeg(jv_url, DST / "app-icon-jovida.jpg", 512, 512, 90):
        pass
    else:
        jstub = Image.new("RGB", (512, 512), (230, 242, 238))
        save_jpg(jstub, DST / "app-icon-jovida.jpg", 88)
        print("WARN: wrote placeholder app-icon-jovida.jpg")

    gp_icon = _first_existing(
        (
            SRC / "greenplatter图标.jpg",
            SRC / "greenplatter图标.png",
            SRC / "GreenPlatter应用图标.png",
            SRC / "GreenPlatter应用图标.jpg",
            SRC / "greenplatter-app-icon.png",
            SRC / "greenplatter-app-icon.jpg",
        )
    )
    if gp_icon is not None:
        save_jpg(contain_resize(load_rgb(gp_icon), 512, 512), DST / "app-icon-greenplatter.jpg", 92)
    elif (DST / "work-gp-1.jpg").is_file():
        save_jpg(contain_resize(load_rgb(DST / "work-gp-1.jpg"), 512, 512), DST / "app-icon-greenplatter.jpg", 88)
        print("WARN: GreenPlatter 无独立应用图标源文件，已用首张产品截图裁方图占位；可将图标放入 个人网站资料/GreenPlatter应用图标.png 后重跑同步。")
    else:
        save_jpg(Image.new("RGB", (512, 512), (238, 244, 236)), DST / "app-icon-greenplatter.jpg", 88)
        print("WARN: wrote placeholder app-icon-greenplatter.jpg")


def export_jovida_team_and_ww_club() -> None:
    """横版 Jovida 团队合影 → jovida-team.jpg；竖版 W&W 活动 → work-umich-ww-members.jpg。"""
    jv_src = resolve_jovida_team_src()
    if jv_src is not None:
        jtim = load_rgb(jv_src)
        save_jpg(contain_resize(jtim, 1800, 1000), DST / "jovida-team.jpg", 90)
    else:
        save_jpg(Image.new("RGB", (1600, 900), (238, 240, 243)), DST / "jovida-team.jpg", 88)
        print(
            "WARN: 未找到 Jovida 团队合影源图，已写入灰色占位。"
            "请将横版图放入 个人网站资料/jovida团队合影.jpg（或 Jovida团队合影.png / .jpg），或 Cursor assets 中含 dbca9729 的文件。"
        )

    ww_src = resolve_umich_ww_members_src()
    if ww_src is not None:
        wtim = load_rgb(ww_src)
        save_jpg(contain_resize(wtim, 1200, 2400), DST / "work-umich-ww-members.jpg", 88)
    else:
        save_jpg(Image.new("RGB", (1080, 1440), (238, 240, 243)), DST / "work-umich-ww-members.jpg", 88)
        print(
            "WARN: 未找到社团活动源图，已写入灰色占位。"
            "请将 个人网站资料/社团团队活动合影.jpg（或原「密歇根体重管理社团成员活动」图）放入后重跑。"
        )


def export_home_work_cards() -> None:
    """首页「工作经历」三卡头图：一律使用 Unsplash 网图示意，避免与二级页真人现场混淆。"""
    pairs = (
        ("work-stock-clinical.jpg", "home-work-clinical.jpg"),
        ("work-stock-ai-health.jpg", "home-work-ai.jpg"),
    )
    for src_name, dst_name in pairs:
        src = DST / src_name
        if src.is_file():
            shutil.copy2(src, DST / dst_name)
        else:
            print(f"WARN: 缺少 {src_name}，无法写入 {dst_name}；请先成功下载 work-stock 图。")


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit(f"Missing source folder: {SRC}")

    hero = load_rgb(SRC / "个人全身照.jpg")
    save_jpg(cover_crop(hero, 1200, 1600), DST / "hero-portrait.jpg", 90)

    headshot = load_rgb(SRC / "证件照.JPG")
    save_jpg(cover_crop(headshot, 1200, 1600), DST / "id-photo.jpg", 90)
    save_jpg(cover_crop(headshot, 1920, 1080), DST / "footer-cta.jpg", 90)

    um_mark = Image.open(SRC / "密歇根大学校标.png")
    if um_mark.mode == "RGBA":
        bgm = Image.new("RGB", um_mark.size, (255, 255, 255))
        bgm.paste(um_mark, mask=um_mark.split()[3])
        um_mark = bgm
    else:
        um_mark = um_mark.convert("RGB")
    um_mark.thumbnail((360, 360), Image.Resampling.LANCZOS)
    save_jpg(um_mark, DST / "edu-umich-logo.jpg", 92)

    uo_mark = load_rgb(SRC / "多伦多大学校标.jpg")
    uo_mark.thumbnail((360, 360), Image.Resampling.LANCZOS)
    save_jpg(uo_mark, DST / "edu-uoft-logo.jpg", 90)

    clinical = load_rgb(SRC / "医院实习照片.jpg")
    save_jpg(cover_crop(clinical, 900, 900), DST / "tl-umich.jpg", 88)
    save_jpg(cover_crop(clinical, 720, 1280), DST / "card-umich.jpg", 88)
    # 单张临床代表图：cover 填满竖版框，避免灰边
    save_jpg(cover_crop(clinical, 1080, 1440), DST / "work-umich-clinical.jpg", 88)

    sp1 = load_rgb(SRC / "演讲.png")
    sp2 = load_rgb(SRC / "演讲2.png")
    sp3 = load_rgb(SRC / "演讲3.png")
    save_jpg(cover_crop(sp2, 900, 900), DST / "tl-speaker.jpg", 85)
    save_jpg(contain_resize(sp1, 1400, 2600), DST / "work-speech-1.jpg", 88)
    save_jpg(contain_resize(sp2, 1400, 2600), DST / "work-speech-2.jpg", 88)
    save_jpg(contain_resize(sp3, 1400, 2600), DST / "work-speech-3.jpg", 88)
    save_jpg(contain_resize(sp2, 1200, 2000), DST / "work-speaking.jpg", 84)

    j1 = load_rgb(SRC / "jovida项目截图1.jpg")
    j2 = load_rgb(SRC / "jovida项目截图2.jpg")
    j3 = load_rgb(SRC / "jovida项目截图3.jpg")
    for idx, ji in enumerate((j1, j2, j3), 1):
        save_jpg(contain_resize(ji, 1100, 2400), DST / f"work-jv-{idx}.jpg", 90)
    save_jpg(contain_resize(j2, 810, 1600), DST / "card-jovida.jpg", 88)
    save_jpg(contain_resize(j1, 1100, 2400), DST / "work-jovida.jpg", 88)

    g1 = load_rgb(SRC / "greenplatter项目截图1.png")
    g2 = load_rgb(SRC / "greenplatter项目截图2.png")
    g3 = load_rgb(SRC / "greenplatter项目截图3.png")
    for idx, gi in enumerate((g1, g2, g3), 1):
        save_jpg(contain_resize(gi, 1100, 2400), DST / f"work-gp-{idx}.jpg", 90)
    save_jpg(contain_resize(g2, 810, 1600), DST / "card-greenplatter.jpg", 88)
    save_jpg(contain_resize(g1, 1100, 2400), DST / "work-greenplatter.jpg", 88)

    save_jpg(cover_crop(j1, 1920, 520), DST / "work-header.jpg", 87)

    cert_um = load_rgb(SRC / "密歇根大学证书.jpg")
    save_jpg(contain_resize(cert_um, 2000, 2000), DST / "about-header.jpg", 90)

    # 多伦多本科学位证：文件名须含「证书」，不得误选「校标」
    uoft_degree_src = None
    for candidate in SRC.iterdir():
        if not candidate.is_file():
            continue
        n = candidate.name
        if "多伦多" not in n or "证书" not in n:
            continue
        if candidate.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
            continue
        uoft_degree_src = candidate
        break
    if uoft_degree_src is not None:
        deg = load_rgb(uoft_degree_src)
        save_jpg(contain_resize(deg, 2200, 2200), DST / "edu-uoft-degree.jpg", 92)

    rdn = load_rgb(SRC / "rdn证书.png")
    cscs = load_rgb(SRC / "cscs证书.png")
    save_jpg(contain_in_box(rdn, 1200, 1700), DST / "cert-rdn.jpg", 90)
    save_jpg(contain_in_box(cscs, 1200, 1700), DST / "cert-cscs.jpg", 90)
    save_jpg(contain_in_box(rdn, 560, 320), DST / "cert-rdn-thumb.jpg", 86)
    save_jpg(contain_in_box(cscs, 560, 320), DST / "cert-cscs-thumb.jpg", 86)
    save_jpg(h_concat_same_height(rdn, cscs, 920), DST / "about-credentials.jpg", 88)

    save_jpg(contain_resize(g3, 1100, 2400), DST / "about-campus.jpg", 88)

    export_jovida_team_and_ww_club()
    export_work_stock_thumbnails()
    export_home_work_cards()
    export_app_icons()

    print("OK ->", DST)


if __name__ == "__main__":
    main()
