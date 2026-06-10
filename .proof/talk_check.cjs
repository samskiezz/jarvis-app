const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader'] });
  const p = await br.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  await p.goto('http://127.0.0.1:8095/talk',{waitUntil:'domcontentloaded'}).catch(e=>errs.push('goto:'+e.message));
  await p.waitForTimeout(3500);
  const has = await p.evaluate(()=>({buildTask: typeof window.buildTask==='function', pollSwarm: typeof window.pollSwarm==='function', go: !!document.getElementById('go')}));
  console.log('pageErrors:', errs.slice(0,4).join(' | ')||'NONE');
  console.log('functions present:', JSON.stringify(has));
  await br.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
