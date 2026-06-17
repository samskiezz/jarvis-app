#!/usr/bin/env python3
"""Connect to the Pixel Stream, toggle the UE debug camera, and fly around.

Usage:
  python debug_camera_fly.py <url> [out.png]
"""
import asyncio
import sys
from playwright.async_api import async_playwright


async def main(url: str, out: str):
    async with async_playwright() as p:
        br = await p.chromium.launch(
            args=[
                "--no-sandbox",
                "--autoplay-policy=no-user-gesture-required",
                "--disable-web-security",
            ]
        )
        pg = await br.new_page(viewport={"width": 1920, "height": 1080})
        await pg.goto(url, wait_until="domcontentloaded")

        for sel in ["#playButton", "text=Click to start", ".play-overlay", "video"]:
            try:
                el = await pg.wait_for_selector(sel, timeout=4000)
                await el.click()
                break
            except Exception:
                continue

        await pg.wait_for_function(
            "() => { const v=document.querySelector('video'); return v && v.videoWidth>0 && !v.paused; }",
            timeout=60000,
        )
        await pg.wait_for_timeout(3000)

        # Toggle debug camera.
        await pg.evaluate(
            "() => { if (window.pixelStreaming && window.pixelStreaming.emitConsoleCommand) window.pixelStreaming.emitConsoleCommand('toggledebugcamera'); }"
        )
        print("toggled debug camera")
        await pg.wait_for_timeout(1500)

        # Fly: hold W and look around.
        print("flying forward / looking around")
        await pg.keyboard.press("w")
        await pg.wait_for_timeout(500)
        await pg.keyboard.press("w")
        await pg.wait_for_timeout(500)
        await pg.keyboard.press("ArrowUp")
        await pg.wait_for_timeout(300)
        await pg.keyboard.press("ArrowDown")
        await pg.wait_for_timeout(300)
        await pg.keyboard.press("a")
        await pg.wait_for_timeout(500)
        await pg.keyboard.press("d")
        await pg.wait_for_timeout(500)
        await pg.keyboard.press("s")
        await pg.wait_for_timeout(500)

        await pg.wait_for_timeout(2000)
        video = await pg.query_selector("video")
        (await (video.screenshot(path=out) if video else pg.screenshot(path=out)))
        print(f"captured -> {out}")
        await br.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: debug_camera_fly.py <signalling-url> [out.png]")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "ue5_debug_fly.png"))
