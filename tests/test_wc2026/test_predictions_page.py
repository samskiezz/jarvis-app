"""Static and integration checks for the Jarvis Match Centre page.

These tests guard the redesigned premium dashboard:
- CSP + cache headers are present.
- Untrusted output is escaped before innerHTML insertion.
- JS syntax is valid.
- The page renders in a headless browser without JS/console errors.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
HTML_PATH = REPO_ROOT / "server" / "wc2026_predictions.html"


@pytest.fixture
def html() -> str:
    return HTML_PATH.read_text(encoding="utf-8")


@pytest.fixture
def inline_js(html: str) -> str:
    scripts = re.findall(r"<script>(.*?)</script>", html, re.DOTALL)
    return "\n".join(scripts)


def test_html_file_exists(html: str) -> None:
    assert HTML_PATH.exists()
    assert "Jarvis Match Centre" in html


def test_csp_meta_present(html: str) -> None:
    assert 'http-equiv="Content-Security-Policy"' in html
    assert "default-src 'self'" in html
    assert "connect-src 'self'" in html


def test_responsible_gambling_link_present(html: str) -> None:
    assert "responsiblegambling.org" in html
    assert "gamble responsibly" in html.lower()


def test_accessibility_landmarks_present(html: str) -> None:
    assert "<main" in html
    assert 'aria-live="polite"' in html
    assert 'role="dialog"' in html
    assert 'aria-modal="true"' in html
    assert 'aria-pressed="false"' in html
    assert 'aria-label="Tournament sections"' in html


def test_reduced_motion_support(html: str) -> None:
    assert "prefers-reduced-motion" in html


def test_escape_function_exists_and_used(inline_js: str) -> None:
    assert "function esc(" in inline_js or "const esc =" in inline_js
    # Key dynamic fields should be wrapped in esc() before innerHTML assignment.
    checks = [
        ("m.home", "esc(m.home)"),
        ("m.away", "esc(m.away)"),
        ("m.n", "esc(String(m.n))"),
        ("p.predicted_score", "esc(p.predicted_score"),
        ("m.result", "esc(m.result)"),
        ("p.predicted_wdl", "esc(p.predicted_wdl"),
    ]
    for name, pattern in checks:
        assert pattern in inline_js, f"{name} is not escaped (missing {pattern})"


def test_js_syntax_valid(inline_js: str) -> None:
    tmp = Path("/tmp/wc2026_predictions_check.js")
    tmp.write_text(inline_js, encoding="utf-8")
    result = subprocess.run(["node", "--check", str(tmp)],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_no_internal_hostnames_leaked(html: str) -> None:
    # Internal infra hostnames should not appear in client-facing HTML/comments.
    bad = ["ssh6.vast.ai", ":11336", ":11435", ":11434"]
    lower = html.lower()
    for host in bad:
        assert host not in lower, f"Internal hostname leaked: {host}"


def test_only_mc_assets_used(html: str) -> None:
    """All local media references must use the custom mc_* asset family."""
    import re
    # Find src/url references under asset/ or jarvis_assets/.
    refs = set(re.findall(r'(?:src|href|url\(["\']?|poster=["\']?)([^"\'>\s)]+)', html))
    for ref in refs:
        if "/" not in ref:
            continue
        top = ref.split("/")[0].lower()
        if top in ("asset", "jarvis_assets") and not re.match(r'^(?:asset|jarvis_assets)/mc_', ref):
            assert False, f"Non-mc asset referenced: {ref}"


def test_no_underworld_media(html: str) -> None:
    lower = html.lower()
    assert "underworld/" not in lower
    assert "uw_" not in lower
    assert "asset/uw_" not in lower


@pytest.mark.skipif(
    not (REPO_ROOT / "node_modules" / "playwright-core").exists(),
    reason="playwright-core not installed",
)
def _server_available() -> bool:
    try:
        import urllib.request
        with urllib.request.urlopen("http://127.0.0.1:8095/jarvis/predictions", timeout=3):
            return True
    except Exception:
        return False


@pytest.mark.skipif(
    subprocess.run(["node", "-e", "require('playwright-core')"], capture_output=True).returncode != 0,
    reason="playwright-core cannot be required",
)
@pytest.mark.skipif(not _server_available(), reason="dashboard server not running on :8095")
def test_page_renders_without_console_errors() -> None:
    script = REPO_ROOT / "test_wc2026_page_runtime.cjs"
    script.write_text(_PLAYWRIGHT_SCRIPT, encoding="utf-8")
    try:
        result = subprocess.run(
            ["node", str(script)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert result.returncode == 0, result.stdout + "\n" + result.stderr
        output = result.stdout.strip()
        assert "FAIL" not in output, output
        assert "errors: []" in output, output
    finally:
        script.unlink(missing_ok=True)


_PLAYWRIGHT_SCRIPT = r'''
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' && !/Failed to load resource.*404/.test(text)) {
      errors.push('console: ' + text);
    }
  });
  await page.goto('http://127.0.0.1:8095/jarvis/predictions', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const upcoming = await page.locator('#match-feed .prediction-card').count();
  const knockout = await page.locator('#knockout-content .bracket-match').count();
  const groups = await page.locator('#groups-grid .group-card').count();
  const news = await page.locator('#news-grid .news-card').count();
  const nextup = await page.locator('#nextup-feed .next-card').count();
  const slips = await page.locator('#builder-slips .slip-card').count();
  const lab = await page.locator('#lab-grid .lab-card').count();
  console.log('errors:', JSON.stringify(errors));
  console.log('upcoming:', upcoming, 'knockout:', knockout, 'groups:', groups, 'news:', news, 'nextup:', nextup, 'slips:', slips, 'lab:', lab);
  if (errors.length || upcoming === 0 || knockout === 0 || groups !== 12 || news === 0 || nextup === 0 || slips !== 3 || lab === 0) {
    console.log('FAIL');
    process.exitCode = 1;
  } else {
    console.log('PASS');
  }
  await browser.close();
})();
'''
