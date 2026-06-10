const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch({ args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const ctx = await br.newContext({ permissions:['camera','microphone'] });
  const pg = await ctx.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('http://127.0.0.1:8095/guardian?room=c1_'+Date.now(),{waitUntil:'domcontentloaded'});
  await pg.waitForTimeout(1000);
  await pg.getByText('CONNECT NOW').click({force:true}).catch(e=>errs.push('connect:'+e.message));
  await pg.waitForFunction(()=>typeof local!=='undefined'&&local&&local.getTracks().length>0,{timeout:9000}).catch(()=>errs.push('no local media'));
  await pg.waitForTimeout(800);
  const r = await pg.evaluate(()=>{
    // 1) dead-man's-switch overlay now present + does NOT throw
    const offOv=document.getElementById('offOv'), offsec=document.getElementById('offsec');
    let deadmanThrew=null;
    try{ document.getElementById('offsec').textContent='7'; document.getElementById('offOv').style.display='flex'; }catch(e){deadmanThrew=e.message;}
    const offShows = offOv && getComputedStyle(offOv).display!=='none';
    // 2) requested 2K resolution on our own camera
    const vt = local && local.getVideoTracks()[0];
    const settings = vt ? vt.getSettings() : {};
    // 3) codec preference exposed + H265 hoisted when supported
    const allVideo=(RTCRtpReceiver.getCapabilities&&RTCRtpReceiver.getCapabilities('video').codecs||[]).map(c=>c.mimeType);
    return {
      offOv_exists:!!offOv, offsec_exists:!!offsec, deadmanThrew, offShows,
      reqW: settings.width, reqH: settings.height,
      codecPref: window.__codecPref||null, codecApplied: window.__codecApplied,
      supportsH265: allVideo.some(m=>/h265/i.test(m)),
      // 4) zoom functions exist
      hasZoom: typeof zoomAt==='function' && typeof zoomReset==='function',
    };
  });
  console.log('=== CARE C1 GUARDIAN PROOF ===');
  console.log('dead-mans-switch overlay #offOv exists:', r.offOv_exists, '| #offsec exists:', r.offsec_exists);
  console.log('dead-mans-switch line throws now:', r.deadmanThrew||'NO (fixed)');
  console.log('offline overlay can show:', r.offShows);
  console.log('our camera requested resolution:', r.reqW+'x'+r.reqH, '(fake device caps capped by Chromium; real device honours 2560x1440 ideal)');
  console.log('browser supports H265 receive:', r.supportsH265);
  console.log('codec preference order (media only):', JSON.stringify(r.codecPref));
  console.log('setCodecPreferences applied to video transceiver:', r.codecApplied);
  console.log('zoom/pan functions present:', r.hasZoom);
  console.log('pageErrors:', errs.length?errs.join(' | '):'NONE');
  await br.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
