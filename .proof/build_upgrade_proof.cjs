// Prove: the self-dev BUILD button POSTs /upgrade (Claude executes), and the proposal link opens /proposal text.
const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport:{width:1440,height:900} })).newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const posts=[]; const gets=[];
  page.on('request',r=>{ const u=r.url();
    if(r.method()==='POST' && /\/upgrade/.test(u)) posts.push(u);
    if(/\/proposal/.test(u)) gets.push(u); });
  await page.goto(B+'/', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(900); await page.mouse.click(720,450); await page.waitForTimeout(2500);
  await page.evaluate(async()=>{ if(typeof loadSuggestions==='function'){await loadSuggestions(true);await new Promise(r=>setTimeout(r,1400));}});

  // click the proposal link of the first block
  const link = await page.$('#sdevBody .sd-link');
  const linkClicked = !!link;
  if(link){ await link.click(); await page.waitForTimeout(900); }
  const propOpen = await page.evaluate(()=>{ const p=document.getElementById('prop'); return p? getComputedStyle(p).display!=='none':false; });
  const propText = await page.evaluate(()=>{ const p=document.getElementById('prop'); return p? (p.textContent||'').slice(0,160):''; });
  // close proposal if open
  await page.evaluate(()=>{ const p=document.getElementById('prop'); if(p)p.style.display='none'; });

  // click BUILD on the first block → must POST /upgrade
  const build = await page.$('#sdevBody .sd-build');
  const buildClicked = !!build;
  if(build){ await build.click(); await page.waitForTimeout(1500); }

  await browser.close();
  console.log(JSON.stringify({
    linkClicked, propOpen, propTextHead:propText.replace(/\s+/g,' ').trim(),
    proposalGETs:gets, buildClicked, upgradePOSTs:posts,
    verdict:{ proposal_opens: linkClicked && (propOpen || gets.length>0),
              build_posts_upgrade: buildClicked && posts.length>0 },
    pageErrors:errs
  }, null, 2));
})().catch(e=>{console.error('ERR',e&&e.stack||e);process.exit(1);});
