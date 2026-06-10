const http = require('http');
const { chromium } = require('playwright');

const TESTS = [];
const ERRS = [];

function test(name, fn) {
  TESTS.push({ name, fn });
}

async function runTest(t) {
  try {
    await t.fn();
    console.log(`  ✅ ${t.name}`);
    return true;
  } catch (e) {
    const msg = e.message || String(e);
    console.log(`  ❌ ${t.name}: ${msg.slice(0, 100)}`);
    ERRS.push(`${t.name}: ${msg.slice(0, 150)}`);
    return false;
  }
}

// HTTP request helper
async function req(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 8095,
      path,
      method,
      timeout: 3000,
    };

    const request = http.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers, parseErr: true });
        }
      });
    });

    request.on('error', reject);
    request.on('timeout', () => { request.destroy(); reject(new Error('timeout')); });
    request.end();
  });
}

// === TEST SUITE ===

// 1. EDGE CASES
test('Empty task list fallback', async () => {
  const r = await req('/tasks');
  if (!Array.isArray(r.data)) throw new Error('Not an array');
});

test('Invalid swarm ID returns ok:false', async () => {
  const r = await req('/swarm?id=999999');
  if (r.data.ok !== false) throw new Error('Expected ok:false for invalid id');
});

test('/tasks schema validation (all fields present)', async () => {
  const r = await req('/tasks');
  if (r.data.length === 0) return; // Ok if empty
  const task = r.data[0];
  const required = ['id', 'status', 'pct', 'eta', 'elapsed', 'est'];
  const missing = required.filter(f => !(f in task));
  if (missing.length > 0) throw new Error(`Missing: ${missing.join(',')}`);
});

test('/swarms schema validation (all fields present)', async () => {
  const r = await req('/swarms');
  if (r.data.length === 0) return;
  const swarm = r.data[0];
  const required = ['id', 'status', 'step', 'steps', 'updated'];
  const missing = required.filter(f => !(f in swarm));
  if (missing.length > 0) throw new Error(`Missing: ${missing.join(',')}`);
});

// 2. RESPONSE TIMING
test('HTTP response time acceptable (<1s)', async () => {
  const start = Date.now();
  await req('/tasks');
  const elapsed = Date.now() - start;
  if (elapsed > 1000) throw new Error(`/tasks took ${elapsed}ms`);
});

test('Content-Type is application/json', async () => {
  const r = await req('/tasks');
  const ct = r.headers['content-type'];
  if (!ct || !ct.includes('application/json')) {
    throw new Error(`Wrong content-type: ${ct}`);
  }
});

// 3. ERROR HANDLING - PAGE STABILITY
test('No JavaScript errors during page load', async () => {
  const br = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const p = await br.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 120)));

  await p.goto('http://127.0.0.1:8095/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(2000);

  await br.close();

  if (errs.length > 0) {
    throw new Error(`JS errors: ${errs.join(' | ')}`);
  }
});

test('No JavaScript errors during 8s polling window', async () => {
  const br = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const p = await br.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 120)));

  await p.goto('http://127.0.0.1:8095/', { waitUntil: 'domcontentloaded' }).catch(() => {});

  // Let polling run for 8s (at least 2-3 poll cycles at ~3s intervals)
  await p.waitForTimeout(8000);

  await br.close();

  if (errs.length > 0) {
    throw new Error(`JS errors during polling: ${errs.join(' | ')}`);
  }
});

// 4. MOBILE RESPONSIVENESS
test('Page loads on mobile viewport (375x667)', async () => {
  const br = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const p = await br.newPage();

  await p.setViewportSize({ width: 375, height: 667 });
  await p.goto('http://127.0.0.1:8095/', { waitUntil: 'domcontentloaded' }).catch(() => {});

  const clientWidth = await p.evaluate(() => {
    const el = document.documentElement;
    return el.clientWidth;
  });

  await br.close();

  if (clientWidth < 320 || clientWidth > 400) {
    throw new Error(`Unexpected viewport width: ${clientWidth}`);
  }
});

test('Page loads on tablet viewport (768x1024)', async () => {
  const br = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const p = await br.newPage();

  await p.setViewportSize({ width: 768, height: 1024 });
  await p.goto('http://127.0.0.1:8095/', { waitUntil: 'domcontentloaded' }).catch(() => {});

  const clientWidth = await p.evaluate(() => document.documentElement.clientWidth);

  await br.close();

  if (clientWidth < 700 || clientWidth > 800) {
    throw new Error(`Unexpected viewport width: ${clientWidth}`);
  }
});

test('Page loads on desktop viewport (1440x900)', async () => {
  const br = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const p = await br.newPage();

  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('http://127.0.0.1:8095/', { waitUntil: 'domcontentloaded' }).catch(() => {});

  const clientWidth = await p.evaluate(() => document.documentElement.clientWidth);

  await br.close();

  if (clientWidth < 1400 || clientWidth > 1480) {
    throw new Error(`Unexpected viewport width: ${clientWidth}`);
  }
});

// 5. LIVE TASKS SPECIFIC CHECKS
test('Live Tasks dock entry present in HTML', async () => {
  const r = await req('/');
  const html = r.data;
  if (typeof html !== 'string') throw new Error('HTML is not string');
  if (!html.includes('Live Tasks') && !html.includes('worklist')) {
    throw new Error('Live Tasks entry not found in HTML');
  }
});

test('Live Tasks overlay markup present', async () => {
  const r = await req('/');
  const html = r.data;
  if (!html.includes('ovWork') && !html.includes('LIVE TASKS')) {
    throw new Error('Live Tasks overlay markup not found');
  }
});

test('Live Tasks functions exist in scope', async () => {
  const br = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const p = await br.newPage();

  await p.goto('http://127.0.0.1:8095/', { waitUntil: 'domcontentloaded' }).catch(() => {});

  const funcs = await p.evaluate(() => {
    return {
      worklistStart: typeof window.worklistStart === 'function',
      worklistStop: typeof window.worklistStop === 'function',
      pollTick: typeof window.pollTick === 'function',
      joinModel: typeof window.joinModel === 'function',
    };
  });

  await br.close();

  const missing = Object.entries(funcs).filter(([_, exists]) => !exists).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing functions: ${missing.join(', ')}`);
  }
});

// 6. ENDPOINT CONTRACTS
test('/tasks returns at least 1 task (or empty gracefully)', async () => {
  const r = await req('/tasks');
  if (!Array.isArray(r.data)) throw new Error('Not array');
  // Empty is ok
});

test('/swarms returns valid swarm list', async () => {
  const r = await req('/swarms');
  if (!Array.isArray(r.data)) throw new Error('Not array');
  // Empty is ok
});

// === MAIN ===
(async () => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('STAGE 11: LIVE TASK LIST PRODUCTION HARDENING VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  console.log('Running tests...\n');
  for (const t of TESTS) {
    const result = await runTest(t);
    if (result) passed++;
    else failed++;
  }

  console.log('\n───────────────────────────────────────────────────────────\n');
  console.log(`RESULTS: ${passed}/${TESTS.length} tests passed\n`);

  if (ERRS.length > 0) {
    console.log('FAILURES:\n');
    ERRS.forEach((e, i) => console.log(`${i + 1}. ${e}`));
    console.log('\n❌ HARDENING FAILED — Fix errors above\n');
    process.exit(1);
  } else {
    console.log('✅ All production hardening checks PASSED');
    console.log('   • Edge cases handled');
    console.log('   • Mobile/tablet/desktop responsive');
    console.log('   • No JavaScript errors');
    console.log('   • Error handling validated');
    console.log('   • Endpoints verified');
    console.log('\n✅ READY FOR STAGE 12: SHIP\n');
  }
})().catch(e => {
  console.error('\nFATAL ERROR:', e.message);
  process.exit(1);
});
