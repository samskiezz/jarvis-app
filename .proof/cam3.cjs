// Robust two-way proof: wait for BOTH sides to have local media before measuring; long settle window.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8095', room = 'pwcam3_' + Date.now();
(async () => {
  const br = await chromium.launch({ args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const cP = await br.newContext({ permissions: ['camera', 'microphone'] });
  const cG = await br.newContext({ permissions: ['camera', 'microphone'] });
  const pP = await cP.newPage(), pG = await cG.newPage();
  const errs = []; pP.on('pageerror', e => errs.push('P:' + e.message)); pG.on('pageerror', e => errs.push('G:' + e.message));

  await pP.goto(B + '/talk?room=' + room, { waitUntil: 'domcontentloaded' });
  await pP.click('#go', { force: true }).catch(e => errs.push('Pclick:' + e.message));
  // wait until patient actually has local media (camera acquired in background)
  await pP.waitForFunction(() => typeof local !== 'undefined' && local && local.getTracks().length > 0, { timeout: 8000 }).catch(() => errs.push('P:no local media'));

  // only NOW bring the guardian online so its offer arrives after patient media is live
  await pG.goto(B + '/guardian?room=' + room, { waitUntil: 'domcontentloaded' });
  await pG.getByText('CONNECT NOW').click({ force: true }).catch(e => errs.push('Gclick:' + e.message));
  await pG.waitForFunction(() => typeof local !== 'undefined' && local && local.getTracks().length > 0, { timeout: 8000 }).catch(() => errs.push('G:no local media'));

  let r = {};
  for (let i = 0; i < 24; i++) {
    await pP.waitForTimeout(1200);
    const at = pg => pg.evaluate(() => { const e = document.getElementById('remote'); return !!(e && e.srcObject && e.srcObject.getTracks().length); });
    const vw = pg => pg.evaluate(() => { const e = document.getElementById('remote'); return (e && e.videoWidth) || 0; });
    const cs = pg => pg.evaluate(() => (typeof pc !== 'undefined' && pc) ? pc.connectionState : 'none');
    r = { pConn: await cs(pP), gConn: await cs(pG), pT: await at(pP), gT: await at(pG), pVW: await vw(pP), gVW: await vw(pG) };
    if (r.pT && r.gT) break;
  }
  console.log('patient pc:', r.pConn, '| guardian pc:', r.gConn);
  console.log('mum sees son: track=' + r.pT + ' liveFrames=' + (r.pVW > 0) + ' (' + r.pVW + 'px)');
  console.log('son sees mum: track=' + r.gT + ' liveFrames=' + (r.gVW > 0) + ' (' + r.gVW + 'px)');
  console.log('errors:', errs.slice(0, 8).join(' | ') || 'none');
  console.log('\n>>> TWO-WAY VIDEO NEGOTIATES (both get remote tracks):', (r.pT && r.gT) ? 'YES ✅' : 'NO ❌');
  console.log('>>> TWO-WAY LIVE FRAMES (both decode pixels):', (r.pVW > 0 && r.gVW > 0) ? 'YES ✅' : 'partial');
  await br.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
