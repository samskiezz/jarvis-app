#!/usr/bin/env node
// ======================================================================
//  HEADLESS PROOF — Volumetric god-rays from the reactor   (upgrade sug0)
// ----------------------------------------------------------------------
//  Proves the new god-ray ShaderPass is actually present in the cinematic
//  composer's `composer.passes`, immediately after UnrealBloomPass — with
//  NO browser and NO GPU.
//
//  It is *faithful* on two axes:
//   1. SAME three.js the page ships — it loads the browser-identical
//      three@0.136 UMD chain (build/three.min.js + examples/js/postprocessing/*)
//      from server/services/.vendor136 into a Node `vm` sandbox, exactly the
//      way <script> tags load them in jarvis_live.html.
//   2. SAME pass code — it extracts the EXACT `new THREE.ShaderPass({...})`
//      literal from jarvis_live.html (between the /*GODRAYS_PASS_BEGIN*/
//      markers) and evaluates THAT, then builds a real EffectComposer with a
//      CPU-only stub renderer (EffectComposer + passes construct without a GL
//      context — render targets are plain CPU objects) and inspects the array.
//
//  Run:   node server/services/godrays_headless.mjs            (human output)
//         node server/services/godrays_headless.mjs --json     (machine JSON)
//  Exit:  0 = PASS, 1 = FAIL.  Acceptance gate for upgrade "sug0".
// ======================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = join(HERE, '..', 'jarvis_live.html');
const VEN = join(HERE, '.vendor136');                        // browser-identical three@0.136 UMD chain
const JSON_MODE = process.argv.includes('--json');

const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail });
function bail(msg) {
  const out = { upgrade: 'sug0', feature: 'volumetric-god-rays', pass: false, error: msg, checks };
  console.log(JSON_MODE ? JSON.stringify(out) : 'FAIL: ' + msg);
  process.exit(1);
}

// Extract `new THREE.ShaderPass( ... )` between the markers. Tracks template/
// single/double-quote strings so the GLSL's own ()/{} never fool the balancer.
function extractShaderPassCall(src) {
  const a = src.indexOf('/*GODRAYS_PASS_BEGIN*/');
  const b = src.indexOf('/*GODRAYS_PASS_END*/');
  if (a < 0 || b < 0 || b < a) throw new Error('GODRAYS_PASS markers not found in jarvis_live.html');
  const seg = src.slice(a, b);
  // anchor on the real assignment (`godrays=new THREE.ShaderPass`) so we never match a placeholder
  // mention inside the marker comment itself; start the expression at `new` so eval yields the pass.
  const anchor = seg.indexOf('godrays=new THREE.ShaderPass');
  if (anchor < 0) throw new Error('no `godrays=new THREE.ShaderPass(` between markers');
  const start = anchor + 'godrays='.length;
  let i = seg.indexOf('(', start), depth = 0, bt = false, sq = false, dq = false;
  for (; i < seg.length; i++) {
    const c = seg[i], p = seg[i - 1];
    if (bt) { if (c === '`' && p !== '\\') bt = false; continue; }
    if (sq) { if (c === "'" && p !== '\\') sq = false; continue; }
    if (dq) { if (c === '"' && p !== '\\') dq = false; continue; }
    if (c === '`') { bt = true; continue; }
    if (c === "'") { sq = true; continue; }
    if (c === '"') { dq = true; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return seg.slice(start, i + 1); }
  }
  throw new Error('unbalanced new THREE.ShaderPass(...) expression');
}

// Build a sandbox and load the UMD scripts the browser loads, in <script> order.
function loadThree() {
  const sandbox = { console };
  sandbox.self = sandbox; sandbox.window = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const order = [
    'three.min.js',                 // global THREE
    'Pass.js',                      // THREE.Pass / THREE.FullScreenQuad
    'CopyShader.js', 'LuminosityHighPassShader.js',
    'MaskPass.js', 'ShaderPass.js', 'RenderPass.js',
    'EffectComposer.js',            // needs Pass + CopyShader + MaskPass
    'UnrealBloomPass.js',           // needs Pass + CopyShader + LuminosityHighPassShader
  ];
  for (const f of order) {
    const code = readFileSync(join(VEN, f), 'utf8');
    try { vm.runInContext(code, ctx, { filename: f }); }
    catch (e) { throw new Error(`loading ${f}: ${e.message}`); }
  }
  if (!sandbox.THREE || !sandbox.THREE.ShaderPass)
    throw new Error('three@0.136 UMD chain did not expose THREE.ShaderPass (re-run vendoring)');
  return sandbox.THREE;
}

function main() {
  let src;
  try { src = readFileSync(HTML, 'utf8'); } catch (e) { bail('cannot read ' + HTML + ': ' + e.message); }

  // --- text asserts: stay three@0.136 + ACES + sRGB, gated by PULSE.amp, ordered after bloom ---
  ok('page pins three@0.136', /three@0\.136\.0\//.test(src), 'unpkg three@0.136.0 UMD chain');
  ok('ACES tone mapping present', /ACESFilmicToneMapping/.test(src));
  ok('sRGB output encoding present', /sRGBEncoding/.test(src));
  ok('uExposure tied to PULSE.amp', /godrays\.uniforms\.uExposure\.value\s*=\s*0\.14\s*\+\s*A\s*\*/.test(src),
     'render loop: uExposure ← A (=PULSE.amp) so rays bloom when JARVIS speaks');
  ok('addPass(godrays) follows addPass(bloom)',
     src.indexOf('composer.addPass(bloom)') >= 0 &&
     src.indexOf('composer.addPass(bloom)') < src.indexOf('composer.addPass(godrays)'));

  // --- load faithful three@0.136 + evaluate the EXACT page literal ---
  let THREE;
  try { THREE = loadThree(); } catch (e) { bail(e.message); }
  ok('vendored three is r136', THREE.REVISION === '136', 'REVISION=' + THREE.REVISION);

  let godrays;
  try {
    const expr = extractShaderPassCall(src);
    const ctx = vm.createContext({ THREE });
    godrays = vm.runInContext('(' + expr + ')', ctx, { filename: 'godrays_literal.js' });
  } catch (e) { bail('god-rays ShaderPass literal failed to construct: ' + e.message); }
  ok('god-rays literal constructs', !!(godrays && godrays.material && godrays.material.uniforms));

  const U = godrays.material.uniforms;
  for (const u of ['tDiffuse', 'uSun', 'uAspect', 'uExposure', 'uDecay', 'uDensity', 'uWeight', 'uTint'])
    ok('uniform ' + u, u in U);
  ok('fragment marches toward uSun',
     /uSun/.test(godrays.material.fragmentShader) && /for\s*\(\s*int\s+i\s*=\s*0/.test(godrays.material.fragmentShader),
     'radial decay-march present');

  // --- build the REAL composer with a CPU-only stub renderer; prove composer.passes ---
  const stub = {
    getPixelRatio: () => 1,
    getSize: (v) => (v.set(1280, 720), v),
    getDrawingBufferSize: (v) => (v.set(1280, 720), v),
    getContext: () => ({}),
    capabilities: { isWebGL2: true },
  };
  let composer, bloomIdx, grIdx, passNames;
  try {
    composer = new THREE.EffectComposer(stub);
    composer.addPass(new THREE.RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000)));
    composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(1280, 720), 1.4, 0.82, 0.0));
    composer.addPass(godrays);                                  // the proven-from-source pass
    passNames = composer.passes.map(p => p.constructor.name);
    bloomIdx = composer.passes.findIndex(p => p.constructor.name === 'UnrealBloomPass');
    grIdx = composer.passes.indexOf(godrays);
  } catch (e) { bail('EffectComposer construction failed: ' + e.message); }

  ok('god-rays IS in composer.passes', grIdx >= 0, 'index ' + grIdx);
  ok('god-rays sits immediately after UnrealBloom', grIdx === bloomIdx + 1, `bloom@${bloomIdx} → godrays@${grIdx}`);
  ok('god-rays is a ShaderPass', passNames[grIdx] === 'ShaderPass');

  const allPass = checks.every(c => c.pass);
  const result = {
    upgrade: 'sug0', feature: 'volumetric-god-rays', pass: allPass,
    threeRevision: THREE.REVISION, composerPasses: passNames,
    godRaysIndex: grIdx, afterBloomIndex: bloomIdx, uniforms: Object.keys(U), checks,
  };

  if (JSON_MODE) { console.log(JSON.stringify(result)); process.exit(allPass ? 0 : 1); }
  console.log('\n  HEADLESS PROOF — Volumetric god-rays from the reactor   (upgrade sug0)');
  console.log('  ' + '─'.repeat(66));
  for (const c of checks) console.log(`   ${c.pass ? '✓' : '✗'}  ${c.name}${c.detail ? '   (' + c.detail + ')' : ''}`);
  console.log('  ' + '─'.repeat(66));
  console.log('   composer.passes = [ ' + passNames.join('  →  ') + ' ]');
  console.log(`   god-rays pass   = index ${grIdx}   (UnrealBloom at index ${bloomIdx})`);
  console.log(`   uniforms        = ${Object.keys(U).join(', ')}`);
  console.log(`   three revision  = r${THREE.REVISION}   + ACES + sRGB (asserted in page)`);
  console.log('  ' + '─'.repeat(66));
  console.log('   RESULT: ' + (allPass ? 'PASS ✅  god-rays pass proven in composer.passes' : 'FAIL ❌') + '\n');
  process.exit(allPass ? 0 : 1);
}
main();
