// Greeting proof for the UNIVERSE page (server/jarvis_live.html at /): it engages on pointerdown
// (not a #go button) and greets BEFORE any camera work. Capture the <audio>.play() of /tts and the network hit.
const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
const HANG = process.argv[3] !== 'grant';   // default: camera prompt left PENDING (greeting must still fire first)
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const tts = [], errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  page.on('requestfinished', async req => { try { if (req.url().includes('/tts')) { const r = await req.response(); tts.push('/tts -> ' + (r && r.status()) + ' ' + (r && (r.headers()['content-type']||''))); } } catch(e){} });
  await page.addInitScript((hang) => {
    window.__audio = [];
    if (hang && navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
    const op = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const src = (this.currentSrc || this.src || '').slice(0, 60);
      let p; try { p = op.apply(this, arguments); } catch(e){ window.__audio.push('PLAY_THROW '+e.name+' '+src); throw e; }
      if (p && p.then) p.then(()=>window.__audio.push('PLAY_OK '+src)).catch(e=>window.__audio.push('PLAY_REJECT '+e.name+' '+src));
      else window.__audio.push('PLAY_NOPROMISE '+src);
      return p;
    };
  }, HANG);
  await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.mouse.click(720, 450);       // pointerdown → engage() → greeting
  await page.waitForTimeout(5000);
  const audio = await page.evaluate(() => window.__audio);
  console.log('SCENARIO: camera prompt = ' + (HANG ? 'PENDING (unanswered)' : 'granted (fake device)'));
  console.log('=== AUDIO play() LOG ==='); console.log((audio||[]).join('\n') || '(no play() calls)');
  console.log('=== /tts NETWORK ==='); console.log(tts.join('\n') || '(no /tts request fired)');
  console.log('=== PAGE ERRORS ==='); console.log(errs.join('\n') || '(none)');
  const spoke = (audio||[]).some(a => a.includes('tts?text') && a.startsWith('PLAY_OK')) || tts.length > 0;
  console.log('\n>>> VERDICT: greeting voice ' + (spoke ? 'PLAYED' : 'DID NOT PLAY (silent)'));
  await browser.close();
})().catch(e => { console.error('TEST_ERROR', e); process.exit(1); });
