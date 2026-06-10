// Definitive negotiation proof: read top-level `pc`/`local` by bare identifier (they are NOT on window),
// confirm SDP offer/answer exchange + ontrack on BOTH sides, and report ICE state + candidate gathering.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8095', room = 'pwcam4_' + Date.now();
(async () => {
  const br = await chromium.launch({ args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const cP = await br.newContext({ permissions: ['camera', 'microphone'] });
  const cG = await br.newContext({ permissions: ['camera', 'microphone'] });
  const pP = await cP.newPage(), pG = await cG.newPage();
  const errs = []; pP.on('pageerror', e => errs.push('P:' + e.message)); pG.on('pageerror', e => errs.push('G:' + e.message));

  await pP.goto(B + '/talk?room=' + room, { waitUntil: 'domcontentloaded' });
  await pP.click('#go', { force: true }).catch(e => errs.push('Pclick:' + e.message));
  await pP.waitForFunction(() => typeof local !== 'undefined' && local && local.getTracks().length > 0, { timeout: 9000 }).catch(() => errs.push('P:no local media'));

  await pG.goto(B + '/guardian?room=' + room, { waitUntil: 'domcontentloaded' });
  await pG.getByText('CONNECT NOW').click({ force: true }).catch(e => errs.push('Gclick:' + e.message));
  await pG.waitForFunction(() => typeof local !== 'undefined' && local && local.getTracks().length > 0, { timeout: 9000 }).catch(() => errs.push('G:no local media'));

  const snap = pg => pg.evaluate(() => {
    const hasPc = typeof pc !== 'undefined' && !!pc;
    const e = document.getElementById('remote');
    return {
      pc: hasPc ? pc.connectionState : 'none',
      ice: hasPc ? pc.iceConnectionState : 'none',
      sig: hasPc ? pc.signalingState : 'none',
      localTracks: (typeof local !== 'undefined' && local) ? local.getTracks().length : 0,
      senders: hasPc ? pc.getSenders().filter(s => s.track).length : 0,
      remoteTrack: !!(e && e.srcObject && e.srcObject.getTracks().length),
      remoteTrackKinds: (e && e.srcObject) ? e.srcObject.getTracks().map(t => t.kind) : [],
      videoW: (e && e.videoWidth) || 0,
    };
  });

  let P = {}, G = {};
  for (let i = 0; i < 28; i++) {
    await pP.waitForTimeout(1200);
    P = await snap(pP); G = await snap(pG);
    if (P.remoteTrack && G.remoteTrack) break;
  }
  console.log('PATIENT  pc=' + P.pc + ' ice=' + P.ice + ' sig=' + P.sig + ' senders=' + P.senders + ' remoteTrack=' + P.remoteTrack + ' [' + P.remoteTrackKinds + '] videoW=' + P.videoW);
  console.log('GUARDIAN pc=' + G.pc + ' ice=' + G.ice + ' sig=' + G.sig + ' senders=' + G.senders + ' remoteTrack=' + G.remoteTrack + ' [' + G.remoteTrackKinds + '] videoW=' + G.videoW);
  console.log('errors:', errs.slice(0, 8).join(' | ') || 'none');
  const offerAnswered = (P.sig === 'stable' && G.sig === 'stable');
  console.log('\n>>> SDP OFFER/ANSWER COMPLETE (both signalingState=stable):', offerAnswered ? 'YES ✅' : 'NO');
  console.log('>>> BOTH SIDES NEGOTIATE REMOTE TRACKS:', (P.remoteTrack && G.remoteTrack) ? 'YES ✅' : 'NO (' + (P.remoteTrack ? '' : 'patient missing ') + (G.remoteTrack ? '' : 'guardian missing') + ')');
  console.log('>>> ICE FULLY CONNECTED (needs real relay/net):', (P.pc === 'connected' && G.pc === 'connected') ? 'YES ✅' : (P.ice + '/' + G.ice));
  await br.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
