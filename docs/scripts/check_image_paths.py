# -*- coding: utf-8 -*-
"""Scan *.html for src="images/..." and report missing files."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    imgs: set[str] = set()
    for h in sorted(ROOT.glob("*.html")):
        t = h.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r'src=["\'](images/[^"\']+)["\']', t):
            imgs.add(m.group(1))
    missing = sorted(p for p in imgs if not (ROOT / p).is_file())
    print("referenced:", len(imgs), "missing:", len(missing))
    for p in missing:
        print("  MISSING", p)
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
