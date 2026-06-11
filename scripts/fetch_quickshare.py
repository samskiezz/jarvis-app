#!/usr/bin/env python3
"""
Download a Samsung QuickShare (quickshare.samsungcloud.com) shared file to disk.

Why this exists: a plain curl/requests GET returns HTTP 403 because the CDN
gates on a browser User-Agent, and the real file lives behind a SIGNED content
API. The share page (fetched with an Android UA) embeds the linkId + a signature;
each content's download URL is:
   /ls/public/v1/links/{linkId}/contents/{contentId}?signature={sig}&storageType=file
which 302-redirects to the actual storage object. This resolves it end to end.

Usage:
  python3 scripts/fetch_quickshare.py <share_url> [out_dir]
  # downloads every file in the share into out_dir (default server/voices/raw_user)
"""
import os, re, sys, html, urllib.request, urllib.error

UA = ("Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _get(url, want_bytes=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read() if want_bytes else r.read().decode("utf-8", "replace")


def fetch(share_url, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    page = _get(share_url)
    # linkId + signature live in the embedded signed content URLs
    m = re.search(r"/ls/public/v1/links/([^/]+)/contents/([a-f0-9]+)\?signature=([^\"&]+)", page)
    if not m:
        print("[quickshare] could not find signed content URL on the page — link may be expired/private.")
        return 1
    link_id, _first_cid, sig = m.groups()
    # every distinct content id on the page (files + thumbnails); we keep the big ones
    cids = list(dict.fromkeys(re.findall(r"/contents/([a-f0-9]+)\?signature=", page)))
    # a human file name if present
    name_m = re.search(r'"name"\s*:\s*"([^"]+)"', page)
    base_name = html.unescape(name_m.group(1)).strip() if name_m else "quickshare_file"
    base_name = re.sub(r"[^\w.\- ]+", "_", base_name)

    saved = []
    for i, cid in enumerate(cids):
        url = (f"https://quickshare.samsungcloud.com/ls/public/v1/links/{link_id}"
               f"/contents/{cid}?signature={sig}&storageType=file")
        try:
            data = _get(url, want_bytes=True)
        except urllib.error.HTTPError as e:
            print(f"[quickshare] content {cid[:8]} → HTTP {e.code} (skip)"); continue
        # skip tiny thumbnails (<200 KB) — we want the real media
        if len(data) < 200_000:
            print(f"[quickshare] content {cid[:8]} is {len(data)}B (thumbnail) — skipped"); continue
        # extension by sniffing
        ext = ".mp3" if data[:3] == b"ID3" or data[:2] == b"\xff\xfb" else \
              ".wav" if data[:4] == b"RIFF" else \
              ".m4a" if data[4:8] == b"ftyp" else ".bin"
        fn = os.path.join(out_dir, (base_name if len(cids) == 1 else f"{base_name}_{i}") + ext)
        with open(fn, "wb") as f:
            f.write(data)
        print(f"[quickshare] saved {fn}  ({len(data)/1048576:.1f} MB)")
        saved.append(fn)
    if not saved:
        print("[quickshare] nothing downloaded (only thumbnails found).")
        return 2
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "server", "voices", "raw_user")
    sys.exit(fetch(sys.argv[1], out))
