"""
Playwright smoke + UX checks for static academic-site-framework.
Run from this directory with: python verify_playwright.py
Requires: playwright (pip), chromium installed (playwright install chromium).
"""
from __future__ import annotations

import http.server
import socketserver
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
PORT = 8899
BASE = f"http://127.0.0.1:{PORT}"

PAGES = [
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
    "about.html",
    "education-umich.html",
    "education-utoronto.html",
]

# These immediately redirect to index.html#…; shell checks run after navigation settles.
REDIRECT_FIRST = {"work.html", "education.html"}


def start_server():
    handler = http.server.SimpleHTTPRequestHandler
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    httpd.allow_reuse_address = True
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def check_horizontal_overflow(page, page_name: str, vw: int, issues: list[str]) -> None:
    """Detect layout wider than viewport (common with 100vw + scrollbar)."""
    sw = page.evaluate("() => document.documentElement.scrollWidth")
    iw = page.evaluate("() => window.innerWidth")
    if sw > iw + 2:
        issues.append(
            f"[{page_name}] horizontal overflow @ {vw}px: scrollWidth={sw} innerWidth={iw}"
        )


def main():
    import os

    os.chdir(ROOT)
    httpd = start_server()
    time.sleep(0.2)

    issues: list[str] = []
    console_all: list[tuple[str, str]] = []

    try:
        _run_checks(issues, console_all)
    finally:
        httpd.shutdown()

    print("=== Console warnings/errors ===")
    if not console_all:
        print("(none)")
    else:
        for pn, line in console_all:
            print(f"  {pn}: {line}")

    print("\n=== Issues ===")
    if not issues:
        print("PASS - no issues detected.")
        return 0
    for i in issues:
        print(f"  - {i}")
    return 1


def _run_checks(issues, console_all):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            locale="zh-CN",
        )

        # --- Per-page: load, console, 404-ish network ---
        for page_name in PAGES:
            page = context.new_page()
            msgs: list[str] = []

            def on_console(msg):
                t = msg.type
                txt = msg.text
                msgs.append(f"{t}: {txt}")
                if t in ("error", "warning"):
                    console_all.append((page_name, f"{t}: {txt}"))

            page.on("console", on_console)
            failed: list[str] = []

            def on_response(resp):
                if resp.status >= 400:
                    failed.append(f"{resp.status} {resp.url}")

            page.on("response", on_response)
            url = f"{BASE}/{page_name}"
            try:
                page.goto(url, wait_until="networkidle", timeout=45000)
            except Exception as e:
                issues.append(f"[{page_name}] goto failed: {e}")
                page.close()
                continue

            page.wait_for_timeout(300)
            # Lazy images: scroll through page so below-the-fold <img> load before we assert sizes.
            page.evaluate("async () => { const z = () => window.scrollTo(0, document.body.scrollHeight); z(); await new Promise(r => setTimeout(r, 400)); window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 200)); }")
            page.wait_for_timeout(400)
            for f in failed:
                issues.append(f"[{page_name}] HTTP {f}")

            check_horizontal_overflow(page, page_name, 1280, issues)

            effective = page_name
            if page_name in REDIRECT_FIRST:
                u = page.url
                if "index.html" in u:
                    effective = "index.html (after redirect from " + page_name + ")"

            # Legacy mode UI removed
            if page.locator("#site-mode-select").count() != 0:
                issues.append(f"[{effective}] unexpected #site-mode-select (should be removed)")

            # Shared shell (redirect stubs land on index with full shell)
            if page.locator("header.mast.mast--site").count() < 1:
                issues.append(f"[{effective}] missing header.mast.mast--site")

            if page.locator("[data-version-fab] .version-fab__btn").count() < 1:
                issues.append(f"[{effective}] missing version FAB button")

            if page.locator("script[src='site-ui.js']").count() < 1:
                issues.append(f"[{effective}] missing script site-ui.js")

            # Images: every <img> with a same-origin src should decode to non-zero width
            broken = page.evaluate(
                """() => {
                  const out = [];
                  for (const im of document.images) {
                    try {
                      const u = new URL(im.currentSrc || im.src, location.href);
                      if (u.origin !== location.origin) continue;
                      if (!im.complete || im.naturalWidth === 0)
                        out.push(im.currentSrc || im.src);
                    } catch (e) { out.push(String(im.src)); }
                  }
                  return out;
                }"""
            )
            for src in broken:
                issues.append(f"[{effective}] broken or zero-size image: {src}")

            # index variants: profile + certs (only on real home URLs, including hash navigations)
            path_last = page.url.rsplit("/", 1)[-1]
            path_base = path_last.split("#")[0].split("?")[0]
            if path_base.startswith("index") or (
                page_name in REDIRECT_FIRST and "index.html" in page.url
            ):
                if page.locator(".hr-advantage-list").count() < 1:
                    issues.append(f"[{effective}] missing .hr-advantage-list")
                if page.locator(".hr-stat-band").count() < 1:
                    issues.append(f"[{effective}] missing .hr-stat-band")
                if page.locator(".mast-identity__name").count() < 1:
                    issues.append(f"[{effective}] missing .mast-identity__name")
                if page.locator(".mast-nav-anchor a[href^='#']").count() < 4:
                    issues.append(
                        f"[{effective}] expected 4+ in-page mast nav anchors, got "
                        f"{page.locator('.mast-nav-anchor a[href^=\"#\"]').count()}"
                    )
                if page.locator(".cert-zoom-trigger[data-cert-zoom]").count() < 2:
                    issues.append(f"[{effective}] expected 2+ cert zoom triggers")

            page.close()

        # --- Version FAB opens panel on home ---
        page = context.new_page()
        page.goto(f"{BASE}/index.html", wait_until="networkidle", timeout=45000)
        page.wait_for_timeout(200)
        btn = page.locator("[data-version-fab] .version-fab__btn").first
        panel = page.locator("#version-panel-home")
        if panel.count() != 1:
            issues.append("[index] expected #version-panel-home")
        else:
            btn.click()
            page.wait_for_timeout(150)
            hidden = panel.get_attribute("hidden")
            if hidden is not None and hidden != "false":
                issues.append("[index] version panel still hidden after FAB click")
            aria_exp = btn.get_attribute("aria-expanded")
            if aria_exp != "true":
                issues.append(f"[index] FAB aria-expanded expected true, got {aria_exp!r}")
        page.keyboard.press("Escape")
        page.close()

        # --- Cert lightbox from index ---
        page = context.new_page()
        page.goto(f"{BASE}/index.html", wait_until="networkidle", timeout=45000)
        page.locator(".cert-zoom-trigger[data-cert-zoom]").first.click()
        page.wait_for_timeout(200)
        if page.locator(".lightbox.is-open").count() < 1:
            issues.append("[index] cert click did not open .lightbox.is-open")
        page.close()

        # --- Mobile viewport: mast + FAB ---
        mob = context.new_page()
        mob.set_viewport_size({"width": 390, "height": 844})
        mob.goto(f"{BASE}/index.html", wait_until="networkidle", timeout=45000)
        mob.wait_for_timeout(200)
        box = mob.locator("[data-version-fab] .version-fab__btn").bounding_box()
        if not box or box["y"] < 0 or box["y"] > 3000:
            issues.append(f"[index mobile] bad FAB bounding box: {box}")
        mob.close()

        # --- Mobile overflow on every page ---
        for page_name in PAGES:
            m = context.new_page()
            m.set_viewport_size({"width": 390, "height": 844})
            m.goto(f"{BASE}/{page_name}", wait_until="networkidle", timeout=45000)
            m.wait_for_timeout(250)
            check_horizontal_overflow(m, page_name + " (mobile)", 390, issues)
            m.close()

        browser.close()


if __name__ == "__main__":
    raise SystemExit(main())
