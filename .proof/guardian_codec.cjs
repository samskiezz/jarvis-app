const { chromium } = require('playwright');
(async () => {
  const room='gcodec_'+Date.now(), B='http://127.0.0.1:8095';
  const br = await chromium.launch({ args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const cP=await br.newContext({permissions:['camera','microphone']}), cG=await br.newContext({permissions:['camera','microphone']});
  const pP=await cP.newPage(), pG=await cG.newPage();
  const errs=[]; pP.on('pageerror',e=>errs.push('P:'+e.message)); pG.on('pageerror',e=>errs.push('G:'+e.message));
  await pP.goto(B+'/talk?room='+room,{waitUntil:'domcontentloaded'});
  await pP.click('#go',{force:true}).catch(()=>{});
  await pG.goto(B+'/guardian?room='+room,{waitUntil:'domcontentloaded'});
  await pG.getByText('CONNECT NOW').click({force:true}).catch(()=>{});
  // wait until guardian pc exists + offer made
  let r={};
  for(let i=0;i<24;i++){ await pG.waitForTimeout(1000);
    r = await pG.evaluate(()=>({pref:window.__codecPref, applied:window.__codecApplied, sig: (typeof pc!=='undefined'&&pc)?pc.signalingState:'none'}));
    if(r.pref) break; }
  // inspect the actual SDP the guardian offered to see which video codec is listed FIRST
  const sdpFirst = await pG.evaluate(()=>{
    if(typeof pc==='undefined'||!pc||!pc.localDescription) return null;
    const sdp=pc.localDescription.sdp;
    const m=sdp.split('\n').find(l=>l.startsWith('m=video'));
    if(!m) return null;
    const pts=m.trim().split(' ').slice(3);
    // map first payload type to its codec name
    const rtpmap={}; sdp.split('\n').forEach(l=>{const mm=l.match(/^a=rtpmap:(\d+) ([^\/]+)/);if(mm)rtpmap[mm[1]]=mm[2];});
    return {firstPT:pts[0], firstCodec:rtpmap[pts[0]]||'?', order:pts.slice(0,5).map(p=>rtpmap[p]||p)};
  });
  console.log('guardian __codecPref:', JSON.stringify(r.pref));
  console.log('setCodecPreferences applied:', r.applied);
  console.log('offer m=video payload order (first 5 codecs):', sdpFirst?JSON.stringify(sdpFirst.order):'n/a');
  console.log('FIRST preferred send codec in SDP:', sdpFirst?sdpFirst.firstCodec:'n/a');
  console.log('pageErrors:', errs.length?errs.join(' | '):'NONE');
  await br.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
