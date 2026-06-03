#!/usr/bin/env python3
"""Capture a real screenshot of the live UE5 Pixel Stream — from ANY machine.

Because the UE5 frames are rendered on the GPU host and streamed as H.264 over
WebRTC, the *capturing* browser needs no GPU. So this runs anywhere (including a
GPU-less CI box) and yields a true screenshot of the actual game graphics.

Usage:
  python capture_stream.py https://<gpu-host>/   [out.png]

It opens the signalling frontend, waits for the WebRTC video track to start
producing frames, clicks-to-start if needed, and screenshots the <video>.
"""
import sys
import asyncio
from playwright.async_api import async_playwright


async def main(url: str, out: str):
    async with async_playwright() as p:
        br = await p.chromium.launch(args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        pg = await br.new_page(viewport={"width": 1920, "height": 1080})
        await pg.goto(url, wait_until="domcontentloaded")
        # The Epic frontend often shows a "Click to start" overlay; dismiss it.
        for sel in ["#playButton", "text=Click to start", ".play-overlay", "video"]:
            try:
                el = await pg.wait_for_selector(sel, timeout=4000)
                await el.click()
                break
            except Exception:
                continue
        # Wait until the <video> element is actually receiving frames.
        await pg.wait_for_function(
            "() => { const v=document.querySelector('video'); return v && v.videoWidth>0 && !v.paused; }",
            timeout=60000)
        await pg.wait_for_timeout(3000)  # let a keyframe + a little motion land
        video = await pg.query_selector("video")
        (await (video.screenshot(path=out) if video else pg.screenshot(path=out)))
        print(f"captured live UE5 stream -> {out}")
        await br.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: capture_stream.py <signalling-url> [out.png]"); sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "ue5_stream.png"))
