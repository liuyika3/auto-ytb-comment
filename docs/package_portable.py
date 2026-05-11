# -*- coding: utf-8 -*-
"""
Pack static site into a single ZIP for use on another PC.
Paths in HTML are relative — unzip anywhere and open index.html (or use a local server).

Usage (from this folder):
  python scripts/build_assets.py    # 占位图：保证 images/ 与 HTML 引用一致（需 Pillow）
  python package_portable.py        # 生成 ZIP；默认检查 HTML 引用的图片是否齐全
  python package_portable.py --out "D:\\Downloads\\academic-site-portable.zip"
  python package_portable.py --no-check   # 不校验引用（不推荐）
"""
from __future__ import annotations

import argparse
import re
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Root files needed to browse offline
ROOT_NAMES = {
    "index.html",
    "index-clinical.html",
    "index-ai.html",
    "work.html",
    "work-north-america.html",
    "work-ai-health.html",
    "work-roadshows.html",
    "work-greenplatter.html",
    "work-jovida.html",
    "education.html",
    "education-umich.html",
    "education-utoronto.html",
    "about.html",
    "site.css",
    "site-ui.js",
}

README_PORTABLE = """个人网站（静态便携包）
============================

重要：不要只复制单个 HTML
------------------------
本站图片、样式、脚本全部是「相对路径」（例如 images/hero-portrait.jpg）。
解压后请保持 ZIP 内的文件夹结构不变：index.html、site.css、site-ui.js 与 images 文件夹必须在同一目录下。
若只把 index.html 拷到别处打开，图片会全部失效。

如何打开
--------
1. 解压本 ZIP 到任意文件夹（路径中尽量不要有仅表情符号等特殊字符）。
2. 双击 index.html，或用浏览器「打开文件」指向解压目录里的 index.html。

若部分浏览器对 file:// 限制字体或脚本，可任选其一：
- 用 VS Code / Cursor 的 “Live Server” 打开解压后的文件夹；
- 或在解压目录内打开终端执行：
    python -m http.server 8080
  然后浏览器访问 http://127.0.0.1:8080/

打包前在本机如何补齐图片
------------------------
- 真实素材：在 academic-site-framework 下运行  python sync_assets.py  （需网络与 个人网站资料）
- 仅保证不断图、可离线演示：运行  python scripts/build_assets.py  （需 Pillow，生成占位图）
然后再运行  python package_portable.py  生成新 ZIP。
"""

# src="images/foo.jpg" | href="images/..." | data-cert-zoom="images/..."
_IMG_REF_RE = re.compile(
    r'(?:src|href|data-cert-zoom)\s*=\s*["\'](images/[^"\']+)["\']',
    re.I,
)


def collect_referenced_images() -> set[str]:
    found: set[str] = set()
    for name in ROOT_NAMES:
        if not name.endswith(".html"):
            continue
        text = (ROOT / name).read_text(encoding="utf-8", errors="replace")
        for m in _IMG_REF_RE.finditer(text):
            found.add(m.group(1).replace("\\", "/"))
    return found


def verify_image_refs(*, strict: bool) -> None:
    """Ensure every images/... path referenced by packed HTML exists on disk."""
    refs = collect_referenced_images()
    missing = sorted(rel for rel in refs if not (ROOT / rel).is_file())
    if not missing:
        print("OK: all HTML-referenced files exist under images/.")
        return
    print("WARNING: some HTML references are missing on disk (images will break):")
    for rel in missing:
        print(f"  - {rel}")
    print("Run:  python scripts/build_assets.py   or   python sync_assets.py")
    if strict:
        raise SystemExit("Abort (--strict): fix missing files before packaging.")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output zip path (default: academic-site-portable-YYYYMMDD.zip in this folder)",
    )
    p.add_argument(
        "--no-check",
        action="store_true",
        help="Skip verifying that HTML-referenced image files exist",
    )
    p.add_argument(
        "--strict",
        action="store_true",
        help="Fail if any HTML-referenced image is missing (recommended in CI)",
    )
    args = p.parse_args()

    stamp = datetime.now().strftime("%Y%m%d")
    out = args.out or (ROOT / f"academic-site-portable-{stamp}.zip")

    images_dir = ROOT / "images"
    if not images_dir.is_dir():
        raise SystemExit(
            f"Missing folder: {images_dir} — run  python scripts/build_assets.py  "
            f"or  python sync_assets.py  first."
        )

    if not args.no_check:
        verify_image_refs(strict=args.strict)

    added = 0
    with zipfile.ZipFile(
        out,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
    ) as zf:
        zf.writestr("打开说明.txt", README_PORTABLE.encode("utf-8"))
        added += 1

        for name in sorted(ROOT_NAMES):
            path = ROOT / name
            if not path.is_file():
                raise SystemExit(f"Missing required file: {path}")
            arc = name
            zf.write(path, arc)
            added += 1

        for path in sorted(images_dir.rglob("*")):
            if path.is_file():
                arc = path.relative_to(ROOT).as_posix()
                zf.write(path, arc)
                added += 1

    size_mb = out.stat().st_size / (1024 * 1024)
    print(f"Wrote {out}")
    print(f"  entries: {added}, size: {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
