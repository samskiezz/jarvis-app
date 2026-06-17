#!/usr/bin/env python3
"""Connect to the live Pixel Stream, optionally send console commands, and capture a screenshot.

This runs on any GPU-less machine because the UE5 frames are rendered remotely.
It is useful for verifying whether black-video is due to a broken renderer or
an empty scene.

Usage:
  python diagnose_stream.py <url> [out.png]

Environment:
  COMMANDS  - comma-separated UE console commands to send after connect (default: stat fps)
"""
import asyncio
import os
import sys
from playwright.async_api import async_playwright

DEFAULT_COMMANDS = "stat fps"


async def main(url: str, out: str):
    commands = [c.strip() for c in os.environ.get("COMMANDS", DEFAULT_COMMANDS).split(",") if c.strip()]
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

        # Dismiss the "Click to start" overlay if present.
        for sel in ["#playButton", "text=Click to start", ".play-overlay", "video"]:
            try:
                el = await pg.wait_for_selector(sel, timeout=4000)
                await el.click()
                break
            except Exception:
                continue

        # Wait for the <video> to be producing frames.
        await pg.wait_for_function(
            "() => { const v=document.querySelector('video'); return v && v.videoWidth>0 && !v.paused; }",
            timeout=60000,
        )
        await pg.wait_for_timeout(3000)

        # Send console commands via the PixelStreaming data channel.
        for cmd in commands:
            try:
                await pg.evaluate(
                    f"(cmd) => {{ if (window.pixelStreaming && window.pixelStreaming.emitConsoleCommand) "
                    f"window.pixelStreaming.emitConsoleCommand(cmd); else throw new Error('pixelStreaming not ready'); }}",
                    cmd,
                )
                print(f"sent console command: {cmd}")
                await pg.wait_for_timeout(1500)
            except Exception as e:
                print(f"failed to send command '{cmd}': {e}")

        await pg.wait_for_timeout(2000)
        video = await pg.query_selector("video")
        (await (video.screenshot(path=out) if video else pg.screenshot(path=out)))
        print(f"captured live UE5 stream -> {out}")
        await br.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: diagnose_stream.py <signalling-url> [out.png]")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "ue5_diagnose.png"))
