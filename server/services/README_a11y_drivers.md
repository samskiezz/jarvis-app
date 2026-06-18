# Accessibility hardware bridges — `a11y_drivers.py`

Drop-in registry for the four accessibility channels Jarvis can bridge: **gaze
tracking**, **single-switch scanning**, **screen reader read-aloud**, and
**dwell click**. Every driver is safe to query on every host — missing
hardware/SDK is reported, never raised.

This file is consumed by:
- `server/services/a11y_drivers.py` — driver registry
- `server/routes/a11y_drivers.py` — `GET /v1/a11y/drivers`, `POST /v1/a11y/drivers/{name}/activate`

## Channel map

| Channel | Driver | Side | What it needs |
| --- | --- | --- | --- |
| `gaze` | `webgazer` | browser | A webcam + camera permission |
| `gaze` | `tobii` | server | Tobii hardware + `pip install tobii_research` |
| `switch` | `web_bluetooth` | browser | Chrome/Edge on Win/macOS/Linux/Android, BLE switch |
| `switch` | `usb_hid` | server | `pip install pyusb` + libusb-1.0 |
| `screen_reader` | `nvda` | server (Windows) | NVDA installed + `nvdaControllerClient64.dll` on disk |
| `screen_reader` | `voiceover` | server (macOS) | nothing — uses built-in `say` |
| `dwell` | `dwell` | browser | nothing — pure JS timing |

## Activation, one step per driver

### `webgazer` — free, webcam (gap-fix #1)
No install. `POST /v1/a11y/drivers/webgazer/activate` returns a
`bootstrap_snippet` to inject into the page. Accuracy ~130px after
~3 calibration clicks (Brown/Princeton paper). Project status: stable
since 2016; maintenance-only as of Feb 2026.

### `tobii` — Tobii Eye Tracker 5, ~$230 (gap-fix #1)
1. Buy a Tobii Eye Tracker 5 from https://www.tobii.com (~USD 230).
2. Plug into USB-A.
3. Install: `pip install tobii_research`.
4. `POST /v1/a11y/drivers/tobii/activate` — should report the device.
**Caveat**: the consumer ET5 may need the Stream Engine bridge for
research-grade gaze streams; for interaction-grade gaze it works
through Tobii Experience / Tobii Game Hub. See
https://developer.tobii.com/community/forums/topic/python-sdk-with-tobii-eye-tracker-5/

### `web_bluetooth` — BLE single-switch (gap-fix #2)
No install on the server side. The endpoint returns the
`navigator.bluetooth.requestDevice()` filter object. Tested with:
- Logitech Adaptive Gaming Kit "Buddy Button" (~USD 100)
- AbleNet Hook+ USB Switch Interface (~USD 65) when paired through a BLE bridge

### `usb_hid` — wired single-switch (gap-fix #2)
1. `pip install pyusb`
2. Linux: `apt install libusb-1.0-0`
3. Plug switch (AbleNet Hook+, Origin Instruments, Logitech Adaptive Kit).
4. `GET /v1/a11y/drivers` — switch should appear under known vendor IDs.

### `nvda` — Windows screen reader (gap-fix #5)
1. Install NVDA on the Windows host: https://www.nvaccess.org/download/
2. Download the controller-client DLL (v2, NVDA 2024.1+):
   https://github.com/nvaccess/nvda/tree/master/extras/controllerClient
3. Drop `nvdaControllerClient64.dll` next to the python process
   (architecture must match — x64 python needs x64 DLL).
4. `POST /v1/a11y/drivers/nvda/activate` with body `{"text": "Hello"}` to speak.

### `voiceover` — macOS screen reader (gap-fix #5)
No install — built-in. `POST /v1/a11y/drivers/voiceover/activate` with
body `{"text": "..."}` uses the `say` CLI which respects the user's
VoiceOver voice preference.

### `dwell` — hover-to-click (gap-fix #6)
Pure browser. `GET /v1/a11y/drivers` returns the recommended timing
parameters (default 800ms dwell, 200ms fade, 24px cancel radius). The
client implements:

```js
let timer, lastX, lastY;
addEventListener('pointermove', (e) => {
  if (timer && Math.hypot(e.clientX - lastX, e.clientY - lastY) > 24) clearTimeout(timer);
  lastX = e.clientX; lastY = e.clientY;
  timer = setTimeout(() => document.elementFromPoint(e.clientX, e.clientY)?.click(), 800);
});
```

## Browser-side gaze snippet (for the live UI)

`POST /v1/a11y/drivers/webgazer/activate` returns this; paste once into the page
when the user opts in:

```html
<script src="https://webgazer.cs.brown.edu/webgazer.js"></script>
<script>
  webgazer
    .setRegression('ridge')
    .setGazeListener((d) => {
      if (d) window.postMessage({ type: 'jarvis.gaze', x: d.x, y: d.y }, '*');
    })
    .begin();
</script>
```

## Single-step activation summary

| Gap | One step the owner takes |
| --- | --- |
| #1 gaze (free) | None — `POST /v1/a11y/drivers/webgazer/activate` and paste snippet |
| #1 gaze (precision) | Buy Tobii Eye Tracker 5 (~$230) + `pip install tobii_research` |
| #2 switch (BLE) | Buy Logitech Buddy Button (~$100) or AbleNet Hook+ (~$65) |
| #2 switch (USB) | `pip install pyusb` + plug device |
| #5 screen reader (Win) | Install NVDA + drop `nvdaControllerClient64.dll` next to server |
| #5 screen reader (mac) | None — built-in |
| #6 dwell click | None — paste 6-line JS snippet |

## Sources

- WebGazer.js project page — https://webgazer.cs.brown.edu/
- WebGazer GitHub — https://github.com/jspsych/WebGazer
- Tobii Pro SDK Python docs — https://developer.tobiipro.com/python/python-getting-started.html
- `tobii_research` on PyPI — https://pypi.org/project/tobii-research/
- Tobii ET5 + Python forum — https://developer.tobii.com/community/forums/topic/python-sdk-with-tobii-eye-tracker-5/
- NVDA Controller Client — https://github.com/nvaccess/nvda/tree/master/extras/controllerClient
- Web Bluetooth API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
- Web Bluetooth samples — https://googlechrome.github.io/samples/web-bluetooth/
