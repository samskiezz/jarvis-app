I now have everything verified. Key reconciliations against the designs:

1. **Line drift**: Designs cite stale line numbers. Confirmed actual anchors: ring mults at 1895/1907; radial law at 1970; orbit-speed at 1984; topic-belt at 1991; home at 1253; fog at 1280; camera at 1281; controls at 1283-1285; starfield at 1377-1381; `_orbBody` at 1867-1887; `flyToBody` at 2217; `_bodyAt` at 2351; `onCanvasClick` at 2383; `selectBody` at 2399; `tickFrame` at 2431; anim spin lines at 2462-2464; auto-orbit at 2520-2522.

2. **Conflicts found**:
   - **`onCanvasClick`/`_bodyAt`/`flyToBody`/`selectBody`/`_orbBody.userData`** are touched by BOTH interaction-panels AND vfx-density. They propose nearly identical pickability fixes (`_pickBodies` vs `_pickables`). Must merge to ONE registry and ONE merged target-set/walk-up.
   - **Starfield (1377-1381)** is touched by BOTH spatial-camera (far shell) AND vfx-density (twinkling shader field). vfx-density's `r=900..3200` shell sits INSIDE the new galaxy field (out to ~3400) — that conflicts with spatial's foundational rescale. Must reconcile radii.
   - **`buildDomainPlanets` radial law / `_orbBody` / anim loop** touched by spatial + placement + vfx.
   - **`getCard` overrides (satellite 1932 / meteor 1951)** rewritten by interaction-panels; vfx adds meteor streaks in same function.

3. **Verified facts that change the designs**:
   - `flyToBody` uses local `b.position` — interaction-panels correctly flags this is broken for nested orbs. Confirmed.
   - `_orbBody` groups are NOT in `bodies` — confirmed un-pickable. Both designs fix this.
   - `selectBody` sets `userData.refresh` that re-calls `getCard` every tick — would thrash `loadOrbNeighbours`. Confirmed; gate needed.
   - vfx-density's `_animPick` scale writer vs existing `b.scale.setScalar(sc)` at 2452 — real double-writer conflict for `bodies`. Confirmed.
   - The galaxies' core-orbit overwrites `position` every frame (line 2464) — placement's clustering mutation of `userData.oa` is compatible (loop reads `oa`). Confirmed.
   - dashboard.py changes (deg sort, /domainaffinity) are out of scope of jarvis_live.html but referenced by placement; I'll include them as a separate ordered phase since they're additive and the client degrades gracefully.

I have enough to write the brief. This is a synthesis/architecture task, not a code-edit task — I'll output the complete ordered integration brief verbatim.

---

# INTEGRATION BRIEF — Holographic Data-Universe (single integrator, apply in order)

**Target file:** `/opt/jarvis-app-1/server/jarvis_live.html` (+ two additive edits in `/opt/jarvis-app-1/server/dashboard.py`, Phase 0).
**Deploy model:** saving the file IS the deploy (http.server reads fresh per request). No build/restart.
**Verification after EACH phase:** `node /opt/jarvis-app-1/.proof/visual_gate.cjs` must stay GREEN (mobile+desktop: not-dark, dock visible, no blocking overlay, no page errors). Do not proceed to the next phase on a red gate.

**Line numbers below are the VERIFIED current anchors (the design docs were stale).** Apply phases strictly in order — later phases assume the field scale set in Phase A.

**Ownership map (de-conflicted):**
| Region | Owner phase | Notes |
|---|---|---|
| radial law / orbit-speed / topic-belt / ring-mults / home / camera / controls / fog | **A (spatial)** | sole owner of all scale/camera numbers |
| starfield block (1377-1381) | **A owns the radii; D supplies the shader** | ONE merged block — see A4. D does NOT write a competing block. |
| child ordering + `relRadius` + labels + macro clustering | **B (placement)** | owns the `r=`/`rr=` expressions + label sprites |
| pickability + real cards + `flyToBody` world-pos | **C (interaction)** | sole owner of `_pickBodies`, `onCanvasClick`, `_bodyAt`, `flyToBody`, `selectBody`, card dispatchers |
| hover/select tween + VFX + SFX + nebula | **D (vfx)** | reuses C's `_pickBodies` registry; adds hover state only |

**Single-registry rule:** C and D both wanted a pickable array. There is exactly ONE: `_pickBodies` (created in Phase C). D reuses it — D does NOT create `_pickables`.
**Single-scale-writer rule:** for `bodies[]` the ONLY `scale.setScalar` writer stays the existing line 2452 (D folds hover factor into it). For `_pickBodies` orbs the ONLY scale writer is D's `_animPick`.

---

## PHASE 0 — dashboard.py (additive server support for Phase B; client degrades gracefully if skipped)

These are optional-but-recommended. If you skip them, Phase B's clustering/ordering silently fall back (no regression, no fake data). Apply them so "most-related-first" is server-guaranteed.

**0.1 — Real degree + sort in `_children` type-branch.** In `dashboard.py`, in `_children`, inside the `node_kind.startswith("type:")` loop, replace the `has_links` boolean with a real degree, emit it, and sort the result most-related-first:

```python
deg = (_count(BRAIN_DB, "SELECT COUNT(*) FROM ont_link WHERE from_id=?", oid) or 0) \
    + (_count(BRAIN_DB, "SELECT COUNT(*) FROM ont_link WHERE to_id=?", oid) or 0)
out.append({"id": oid, "type": typ, "label": str(label)[:70],
            "color": GRAPH_COLORS.get(typ, "#9bd4e6"), "rel": "instance", "dir": "down",
            "deg": deg, "isLeaf": deg == 0})
```
then after the loop, before returning: `out.sort(key=lambda r: -r.get("deg", 0))`.

**0.2 — `/domainaffinity` endpoint.** Add `_domain_affinity()` (cached 120s, `PRAGMA query_only`, per-type `ont_link` co-occurrence matrix) next to `_graph_data`, and route `elif self.path.startswith("/domainaffinity"): self._send(json.dumps(_domain_affinity()).encode(), "application/json")` next to `/graphdata`. (Exact body as in the placement design; verify `_cached`, `BRAIN_DB`, `_count`, `GRAPH_COLORS` symbols exist before pasting.)

**Gate:** `curl -s localhost:<port>/domainaffinity` returns `{"affinity":{...}}`; `curl -s 'localhost:<port>/children?kind=type:Document&limit=5'` shows `deg` on rows.

---

## PHASE A — SCALE + CAMERA + BACKGROUND (foundation; spatial owns)

Apply these first; everything downstream depends on the field reaching ~3400u.

**A1 — Ring multipliers.**
Line 1895: `const pRing=galaxySize*2.2;` → `const pRing=galaxySize*1.9;`
Line 1907: `const mRing=psz*2.4;` → `const mRing=psz*2.0;`

**A2 — Galaxy radial law.** Line 1970, replace the `P={…}` object:
```js
    const P={angle:i*GOLDEN, radius:170+210*i, y:Math.sin(i*GOLDEN*0.7)*70*(0.4+0.6*(1-imp))};
```

**A3 — Galaxy core-orbit speed.** Line 1984, in the `b.userData.os=` assignment change `200/P.radius` → `1400/P.radius`:
```js
b.userData.os=0.013*Math.min(2.0,1400/P.radius);
```

**A4 — Topic belt.** Line 1991: `const P=vogel(i,imp*0.5,470,30);` → `const P=vogel(i,imp*0.5,3560,70);`

**A5 — Home shot.** Line 1253, replace the `home=` initializer pos:
```js
let home={pos:new THREE.Vector3(0,3060,3920),tgt:new THREE.Vector3(0,0,0)};
```
(Keep the rest of the line / comment.)

**A6 — Camera far/near.** Line 1281:
```js
camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,0.5,8000);
```

**A7 — OrbitControls rig.** Lines 1283-1285, replace the three control lines:
```js
  controls=new THREE.OrbitControls(camera,canvas);
  controls.enableDamping=true;controls.dampingFactor=.08;
  controls.enablePan=true;controls.panSpeed=0.7;controls.screenSpacePanning=true;
  controls.rotateSpeed=0.55;controls.zoomSpeed=0.9;
  controls.minDistance=40;
  controls.maxDistance=5300;
  controls.minPolarAngle=0.12;controls.maxPolarAngle=Math.PI-0.12;
  controls.target.copy(home.tgt);
```

**A8 — Fog density.** Line 1280: `0.0012` → `0.00018`:
```js
  try{scene.fog=new THREE.FogExp2(0x02040a,0.00018);}catch(e){}
```

**A9 — Auto-orbit gentle.** Line 2521: `+dt*0.04` → `+dt*0.02`:
```js
      const a=Math.atan2(camera.position.x,camera.position.z)+dt*0.02;
```

**A10 — Starfield: MERGED block (spatial radii + D's twinkle shader).** This is the single canonical starfield. Replace lines 1377-1381 with the block below. **Radii reconciliation:** the far shell sits at **6800** (spatial's number — beyond `maxDistance=5300`, inside `far=8000`) so the camera can never get among the stars; D's twinkle/parallax shader is layered onto that shell. D does NOT add its own `r=900..3200` field (that would sit inside the galaxies). Expose `_starField` for Phase D's loop driver.
```js
  // starfield — pure BACKDROP on a FAR shell (R≈6800 > maxDistance 5300, < far 8000); twinkling additive points
  (function(){
    const N=(typeof _MOBILE!=='undefined'&&_MOBILE)?4500:6000;
    const pos=new Float32Array(N*3), asz=new Float32Array(N), aph=new Float32Array(N);
    for(let i=0;i<N;i++){ const u=Math.random()*2-1, th=Math.random()*6.283185307, s=Math.sqrt(1-u*u);
      const R=6800+(Math.random()-.5)*400;
      pos[i*3]=Math.cos(th)*s*R; pos[i*3+1]=u*R; pos[i*3+2]=Math.sin(th)*s*R;
      asz[i]=1.4+Math.random()*Math.random()*2.6; aph[i]=Math.random()*6.28; }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    g.setAttribute('aSize',new THREE.BufferAttribute(asz,1));
    g.setAttribute('aPh',new THREE.BufferAttribute(aph,1));
    const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{uTime:{value:0},uPR:{value:Math.min(devicePixelRatio,2)},uColor:{value:new THREE.Color(0x9fe6ff)}},
      vertexShader:`attribute float aSize,aPh; uniform float uTime,uPR; varying float vTw;
        void main(){ vTw=0.6+0.4*sin(uTime*1.3+aPh);
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=aSize*uPR*vTw; gl_Position=projectionMatrix*mv; }`,
      fragmentShader:`uniform vec3 uColor; varying float vTw;
        void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
          float a=smoothstep(0.5,0.0,r)*0.7*vTw;
          gl_FragColor=vec4(uColor*(0.7+0.6*vTw),a); }`});
    const stars=new THREE.Points(g,m); stars.frustumCulled=false; stars.renderOrder=-10;
    scene.add(stars); _starField=stars;
  })();
```
Declare the global once near the other scene globals (e.g. after line 1251): `let _starField=null,_nebula=null;`

> Note: `sizeAttenuation` is intentionally not used (custom shader); `gl_PointSize=aSize*uPR*vTw` is constant-on-screen (crisp pinpoints) — matches spatial's intent and D's twinkle simultaneously.

**Gate A:** 16 galaxy systems spread across a wide breathable field, no overlapping rings, stars only far backdrop, home frames the whole field. Dock/panels/lifeline intact.

---

## PHASE B — RELATIONSHIP ORDERING + LABELS (placement owns)

Depends on A (rings already rescaled). B touches ONLY child ordering, the `r=`/`rr=` expressions, label sprites, and appends a clustering pass. It does NOT touch any A number.

**B1 — `relRadius` helper.** Add immediately after `_orbitRing` (after line 1863):
```js
/* §8 closest-related sit innermost. baseRing = spatial's ring radius; rank 0 = most related (server ont_link order).
   Only RADIUS encodes relationship strength; the golden-angle φ ANGLE is untouched (even spread preserved). */
function relRadius(baseRing, rank, total){
  const n=Math.max(1,(total||1)-1);
  const t=Math.min(1,(rank||0)/n);
  return baseRing*(0.80+0.40*t);
}
```

**B2 — Wire `relRadius` into the two `r=`/`rr=` lines.**
Line 1898: `const a=i*GOLDEN, r=pRing*(0.9+0.04*i);` →
```js
      const a=i*GOLDEN, r=relRadius(pRing, i, planets.length);
```
Line 1910: `const aa=j*GOLDEN, rr=mRing*(0.9+0.05*j);` →
```js
            const aa=j*GOLDEN, rr=relRadius(mRing, j, moons.length);
```
(φ angles `a`/`aa` unchanged. With Phase 0 applied, `planets[]`/`moons[]` already arrive most-related-first; if Phase 0 was skipped, this still runs — order falls back to recency, never broken.)

**B3 — Label sprite on every `_orbBody`.** In `_orbBody` (after the `rim` `g.add(rim);` at line 1878, before `g.userData={…}`):
```js
  const _lbl=makeLabel((label||entityId||'').slice(0,40));
  _lbl.scale.set(22,5.5,1);
  _lbl.position.set(0, size+size*0.9+1.2, 0);
  _lbl.material.opacity=0; _lbl.visible=false;
  g.add(_lbl);
```
Then add two fields to the `g.userData={…}` object (line 1879): `labelSprite:_lbl, tier:tag,`.

> Decluttering rule to avoid double-labels: galaxies keep their always-on `makeLabel` (lines 1682/1708 — untouched). Orb bodies use this distance-gated sprite. Phase D's hover label and this declutter label are the SAME sprite (`labelSprite`); D's `_animPick` and B's `_labelPass` both write `labelSprite.material.opacity` — to avoid two opacity writers, **B owns the declutter pass; D's hover reads through it** (see D note). Implement B's `_labelPass` as the single opacity writer; D forces a label by setting `g.userData.hoverWant` which `_labelPass` treats as "always reveal".

**B4 — `_labelPass`/`_fadeLabel` declutter.** Add a top-level helper near the anim loop (e.g. before `tickFrame`, after line 2429). This is the SINGLE writer of orb label opacity:
```js
const _LABEL_CAP=18, _labelTmp=new THREE.Vector3(); let _labelAcc=0;
function _labelPass(dt){
  _labelAcc+=dt; if(_labelAcc<0.16) return; _labelAcc=0;
  const cam=camera.position, cand=[];
  for(let i=0;i<_spinBodies.length;i++){ const g=_spinBodies[i], sp=g.userData.labelSprite; if(!sp) continue;
    g.getWorldPosition(_labelTmp); const dist=_labelTmp.distanceTo(cam);
    const core=g.userData.pickMesh;
    const wsize=(core&&core.geometry&&core.geometry.parameters&&core.geometry.parameters.radius)||1;
    const forced=(g.userData.hoverWant>0)||(_selected===g);   // hover (Phase D) or selection forces a label
    if(dist>620 && !forced){ _fadeLabel(sp,0,dt); continue; }
    cand.push({sp, score: forced?1e9:(wsize/Math.max(1,dist))});
  }
  cand.sort((a,b)=>b.score-a.score);
  for(let i=0;i<cand.length;i++) _fadeLabel(cand[i].sp, i<_LABEL_CAP?1:0, dt);
}
function _fadeLabel(sp,target,dt){ const next=sp.material.opacity+(target-sp.material.opacity)*Math.min(1,dt*8);
  sp.material.opacity=next; sp.visible=next>0.02; }
```
> Distance threshold raised 520→**620** to match the larger Phase-A field (was tuned for the old ~400u field). `_selected` and `hoverWant` are read here; both exist after Phases C/D — guard with `g.userData.hoverWant>0` (undefined → falsy, safe if D not yet applied).

**B5 — Wire `_labelPass` into the loop.** After line 2463 (the `_spinBodies` self-rotate line), add:
```js
    _labelPass(dt);
```

**B6 — Macro clustering (append to end of `buildDomainPlanets`).** Insert just before `rebuildMacroConnections();` (line 1999) — i.e. after the topics `forEach` closes:
```js
  // §8 MACRO CLUSTERING: pull high-affinity galaxies toward a shared mean angle (bounded ±0.45 rad; Vogel radius preserved)
  fetch('domainaffinity').then(r=>r.json()).then(da=>{
    const aff=(da&&da.affinity)||{};
    const baseAng={}; entries.forEach(([dom],i)=>{ baseAng[dom]=i*GOLDEN; });
    const ang=Object.assign({},baseAng);
    for(let pass=0; pass<3; pass++){ const next={};
      entries.forEach(([dom])=>{ let sx=Math.cos(ang[dom]),sy=Math.sin(ang[dom]),w=1; const nbrs=aff[dom]||{};
        Object.keys(nbrs).forEach(other=>{ if(ang[other]==null)return; const wgt=Math.log10(1+nbrs[other]);
          sx+=Math.cos(ang[other])*wgt; sy+=Math.sin(ang[other])*wgt; w+=wgt; });
        let target=Math.atan2(sy,sx), d=target-baseAng[dom]; d=Math.atan2(Math.sin(d),Math.cos(d));
        next[dom]=baseAng[dom]+Math.max(-0.45,Math.min(0.45,d)); });
      Object.assign(ang,next); }
    bodyMap.forEach((b,name)=>{ if(name.indexOf('dom:')!==0)return; const dom=name.slice(4),u=b.userData;
      if(ang[dom]==null)return; u.oa=ang[dom]; b.position.set(Math.cos(u.oa)*u.orr,u.oy,Math.sin(u.oa)*u.orr); });
    rebuildMacroConnections();
  }).catch(()=>{});
```
> Compatible with A3's core-orbit: the loop at line 2464 reads `u.oa` each frame, so mutating `u.oa` here makes galaxies continue orbiting from the clustered angle. If `/domainaffinity` is absent, the `.catch` no-ops and the original `rebuildMacroConnections();` (still present on line 1999) runs — pure Vogel, zero regression.

**Gate B:** orb labels fade in only for near/large bodies (≤18 at once), most-related children sit innermost, related galaxies cluster, layout never collapses. Dock/panels/lifeline intact.

---

## PHASE C — PICKABLE + REAL PANELS (interaction owns)

Depends on B3 (orbs now carry `tier`/`label`). C is the SOLE owner of pickability and cards. **This phase creates the single `_pickBodies` registry that Phase D reuses.**

**C1 — `_pickBodies` registry.** After line 1866 (`const _spinBodies=[];`):
```js
const _pickBodies=[];   // flat list of holographic orb GROUPS for raycasting (they're not in `bodies`)
```

**C2 — `_orbBody` userData: stable name + real card hook + push to registry.** Replace the `g.userData={…}` object (lines 1879-1884) with:
```js
  g.userData={[tag]:true, label:(label||entityId||'').slice(0,60), entityId:entityId, kind:kind, pickMesh:core,
    name:'orb:'+tag+':'+(entityId||label||Math.random().toString(36).slice(2)),
    labelText:(label||entityId||'').slice(0,60), orbBody:true, tier:tag, labelSprite:_lbl,
    spinSelf:0.06+((size*7)%1)*0.22,
    getCard:()=>orbCard(g)};
  _spinBodies.push(g); _pickBodies.push(g);
```
> This MERGES B3's `labelSprite:_lbl, tier:tag` (keep them) with C's new fields. The old inline placeholder `getCard` (the `{Type,Entity}` + "placed by the golden-angle φ law" stub) is REMOVED — replaced by `orbCard(g)`. The existing `_spinBodies.push(g);` line 1885 is now folded into this block; delete the standalone line 1885 to avoid a double-push.

**C3 — `orbCard` + loaders + helpers.** Add after `_orbBody` closes (after line 1887):
```js
function orbCard(g){
  const u=g.userData, tag=(u.planet&&'planet')||(u.moon&&'moon')||(u.satellite&&'satellite')||(u.meteor&&'meteor')||'body';
  const title=(u.label||u.entityId||'').slice(0,48);
  if(tag==='planet'||tag==='moon'){
    loadOrbNeighbours(g, tag);
    return {title, subtitle:tag+' · loading real links…',
      props:[{k:'Entity',v:(u.entityId||'—').slice(0,40)}],
      lines:['Fetching this entity\u2019s real relationships from brain.db…'],
      actions:[{label:'◈ Open in knowledge graph',kind:'graph',arg:(u.label||u.entityId)}]};
  }
  return {title, subtitle:tag, props:[{k:'Entity',v:(u.entityId||'—').slice(0,40)}],
    actions:[{label:'◈ Open in knowledge graph',kind:'graph',arg:(u.label||u.entityId)}]};
}
function loadOrbNeighbours(g, tag){
  const u=g.userData, id=u.entityId; if(!id)return;
  fetch('children?id='+encodeURIComponent(id)+'&kind=obj:'+encodeURIComponent(id)+'&limit=8')
   .then(r=>r.json()).then(d=>{
    if(_selected!==g)return;
    const kids=(d&&d.children)||[];
    const props=[{k:'Type', v:(u.kind||'').replace(/^type:/,'')||tag},
                 {k:'Links', v:String((d&&d.total)||kids.length)+((d&&d.truncated)?'+':'')}];
    kids.slice(0,4).forEach(c=>props.push({k:(c.rel||'rel').toLowerCase(), v:String(c.label||c.id).slice(0,34)}));
    const lines = kids.length ? ['Real relationships from the knowledge graph (ont_link).']
                              : ['No outgoing/incoming links recorded for this entity yet.'];
    const actions=[];
    kids.slice(0,3).forEach(c=>{ if(findOrbByEntity(c.id)||findOrbByLabel(c.label))
      actions.push({label:'→ '+String(c.label||c.id).slice(0,22),kind:'_fn',
        fn:()=>{const b=findOrbByEntity(c.id)||findOrbByLabel(c.label); if(b)selectBody(b);}}); });
    actions.push({label:'▸ Recent '+((u.kind||'').replace(/^type:/,'')||tag),kind:'drill',
                  arg:'type:'+((u.kind||'').replace(/^type:/,'')||tag)});
    actions.push({label:'◈ Open in knowledge graph',kind:'url',
                  arg:'graph?focus='+encodeURIComponent(u.label||u.entityId)});
    openCardLive(g,{title:(u.label||u.entityId||'').slice(0,48),
      subtitle:tag+' · '+((u.kind||'').replace(/^type:/,'')||'entity'), props, lines, actions});
  }).catch(e=>{});
}
function findOrbByEntity(id){ if(!id)return null;
  for(let i=0;i<_pickBodies.length;i++){if(_pickBodies[i].userData.entityId===id)return _pickBodies[i];} return null; }
function findOrbByLabel(lab){ if(!lab)return null; const lo=String(lab).toLowerCase();
  for(let i=0;i<_pickBodies.length;i++){if((_pickBodies[i].userData.label||'').toLowerCase()===lo)return _pickBodies[i];} return null; }
function openCardLive(g, card){ if(_selected!==g)return; _cardDrilled=false; showCardWithFns(card); }
```
> `kind:'url'` with `arg:'graph?focus=…'` routes through existing `doAction` (`window.open(arg)`); `'drill'` routes to `openDetail`. `kind:'_fn'` is rebound by `showCardWithFns` (line 2415, verified). No `doAction` change.

**C4 — Satellite real card (replace lines 1932-1934).**
```js
      m.userData.getCard=()=>({title:(s.label||s.name),subtitle:'Docker/pm2 service · '+s.status,
        props:[{k:'Status',v:s.status},{k:'CPU',v:(s.cpu||0)+'%'},{k:'Mem',v:(s.mem_mb||0)+'MB'},
               {k:'Uptime',v:(s.up_min||0)+'m'},{k:'Restarts',v:s.restarts||0}],
        lines:['Real pm2 service powering JARVIS.'],
        actions:[
          {label:'📜 Live logs',kind:'drill',arg:'runner:'+s.name},
          {label:(s.status==='online'?'↻ Restart':'▶ Start'),kind:'_fn',
            fn:()=>orbControl(s.name, s.status==='online'?'restart':'start')},
          {label:'🛰 Live Tasks',kind:'_fn',fn:()=>setMode('worklist')}]});
```
> Verify the dock mode id for Live Tasks is `'worklist'` before pasting (grep `setMode(` usages); if the Live-Tasks app uses a different mode string, substitute it.

**C5 — Meteor real card (replace lines 1951-1953).**
```js
      m.userData.getCard=()=>({title:alert.title,subtitle:'⚠ '+alert.level+' alert',
        props:[{k:'Level',v:alert.level}],
        lines:[alert.detail||'',alert.hint||''].filter(Boolean),
        actions:[{label:'🩺 Open System Vitals',kind:'_fn',fn:()=>openVitals()},
                 {label:'↻ Run all daemons',kind:'task',arg:'run all'}]});
```
> Verify `openVitals` exists (grep); if not, fall back to `{kind:'graph',arg:'vitals'}` as the action.

**C6 — `orbControl` (real pm2 POST).** Add near `doAction` (after line 1217):
```js
function orbControl(name, action){
  const b=_selected;
  showCardKeepActions({title:name,subtitle:action+'ing…',props:[{k:'Action',v:action}],lines:['Sending real pm2 '+action+' …']});
  fetch('control?action='+encodeURIComponent(action)+'&name='+encodeURIComponent(name),{method:'POST'})
   .then(r=>r.json()).then(res=>{
     showCardKeepActions({title:name,subtitle:res.ok?('✓ '+action+'ed'):('✗ '+(res.error||'failed')),
       props:[{k:'Action',v:action},{k:'OK',v:String(!!res.ok)}], lines:[(res.msg||res.error||'').slice(0,160)]});
     setTimeout(()=>{ if(b&&b.userData.refresh)b.userData.refresh(); },1500);
   }).catch(e=>{showCardKeepActions({title:name,subtitle:'✗ network error',lines:[String(e).slice(0,120)]});});
}
```

**C7 — `flyToBody` world-position fix.** Replace lines 2217-2219:
```js
function flyToBody(b){
  b.updateWorldMatrix(true,false);
  const bp=b.getWorldPosition(new THREE.Vector3());
  const dir=camera.position.clone().sub(bp); if(dir.lengthSq()<1)dir.set(0,0,1); dir.normalize();
  const off=(b.userData.orbBody?Math.max(8,(b.userData.pickMesh?b.userData.pickMesh.geometry.parameters.radius:2)*6):46);
  tween(bp.clone().add(dir.multiplyScalar(off)),bp);
}
```
> Keeps galaxies/KPIs identical (`off=46`); orbs get a size-aware close-in. The orb keeps orbiting after the tween (acceptable, NASA-Eyes behaviour).

**C8 — Make orbs pickable in click + drag.**
`onCanvasClick` (lines 2387-2392), replace the target build + walk-up:
```js
  const targets=bodies.slice();
  for(let i=0;i<_pickBodies.length;i++)targets.push(_pickBodies[i]);
  if(_constellation&&_constellation.inst)targets.push(_constellation.inst);
  const hit=ray.intersectObjects(targets,true)[0];
  if(hit){
    if(_constellation&&hit.object===_constellation.inst&&hit.instanceId!=null){selectNode(hit.instanceId);return;}
    let o=hit.object;while(o&&!o.userData.name&&!o.userData.orbBody)o=o.parent;
    if(o){clearTimeout(_selectPending);
      _selectPending=setTimeout(()=>{selectBody(o);_selectPending=null;},220);return;}
  }
```
`_bodyAt` (line 2354), replace the single raycast line:
```js
  const tg=bodies.slice();for(let i=0;i<_pickBodies.length;i++)tg.push(_pickBodies[i]);
  const hit=ray.intersectObjects(tg,true)[0];
```
> Note for `_pinDragStart` (line 2358): it gates on `b.userData.name`. Orbs now HAVE `userData.name` (C2), so they become drag-pinnable too — this is harmless/desirable; no change needed.

**C9 — Gate planet/moon refresh (prevents per-tick endpoint thrash).** In `selectBody`, after `const gc=b.userData.getCard;` (line 2403) add:
```js
    if(b.userData.orbBody && (b.userData.planet||b.userData.moon)){
      selectBody.__noRefresh=true;
    }
```
and change the `b.userData.refresh=…` line (2406) to respect it:
```js
    b.userData.refresh=(b.userData.orbBody&&(b.userData.planet||b.userData.moon))?null:
      (()=>{ if(_selected===b && !_cardDrilled){const oo=b.userData.getCard&&b.userData.getCard();if(oo)showCardKeepActions(oo);} });
```
> (Drop the temporary `__noRefresh` flag — the inline conditional on the refresh assignment is the clean form. Satellites/meteors keep live refresh; planets/moons load links once.)

**Gate C:** click a planet → card shows real rel names + neighbour labels, "→ related" buttons fly to on-screen orbs; click a satellite → "📜 Live logs" shows real pm2 lines, "↻ Restart" POSTs and recolours next vitals tick; click a meteor → vitals opens; fly-to lands ON the orb (not empty space). Dock/panels/lifeline intact.

---

## PHASE D — INTERACTION-ANIM + VFX + SFX + DENSITY (vfx owns; reuses C's `_pickBodies`)

Depends on C (`_pickBodies` exists) and B (`labelSprite` exists). **D does NOT create a second pickable registry and does NOT write a competing starfield.**

**D1 — Hover/select state on orbs.** In `_orbBody`, in the `g.userData={…}` object (C2 block), append: `baseScale:1, hover:0, hoverWant:0, selPulse:0, selected:false,`.
On `bodies` (galaxies/KPIs): in `addBody` userData (line 1680) and `addManifestBody` userData (line 1706) add `hover:0,hoverWant:0,selPulse:0,` (they already have `baseScale`/`selected`).

**D2 — Hover raycast: EXTEND the existing pointermove (do NOT add a 2nd listener).** Replace the listener body at lines 1408-1410:
```js
  $('uni').addEventListener('pointermove',e=>{ if(gridMat)
      gridMat.uniforms.uPtr.value.set((e.clientX/innerWidth)*2-1, -((e.clientY/innerHeight)*2-1));
    _pinDragMove(e); _hoverProbe(e); });
```
Add `_hoverProbe` near `_bodyAt` (after line 2355):
```js
let _hovered=null, _lastHoverT=0;
function _hoverProbe(e){
  if(!uniReady||userDragging||(_pinGrab&&_pinGrab.armed)||flying)return;
  const now=performance.now(); if(now-_lastHoverT<55)return; _lastHoverT=now;
  mouse.x=(e.clientX/innerWidth)*2-1; mouse.y=-(e.clientY/innerHeight)*2+1;
  ray.setFromCamera(mouse,camera);
  const pool=bodies.slice(); for(let i=0;i<_pickBodies.length;i++)pool.push(_pickBodies[i]);
  const hit=ray.intersectObjects(pool,true)[0];
  let o=hit?hit.object:null; while(o&&!(o.userData&&(o.userData.name||o.userData.pickMesh)))o=o.parent;
  if(o===_hovered)return;
  if(_hovered)_hovered.userData.hoverWant=0;
  _hovered=o||null;
  if(_hovered){_hovered.userData.hoverWant=1; document.body.style.cursor='pointer'; sfxBlip('hover');}
  else document.body.style.cursor='';
}
```
> Hover sets `hoverWant`; B's `_labelPass` reveals the label (single opacity writer). D's `_animPick` reads `hover` for scale/glow but does NOT touch `labelSprite.opacity`.

**D3 — Selection ring (additive dashed, holographic).** Add helper (top-level, near `_orbBody`):
```js
function _attachSelRing(b){
  const sz=(b.userData.pickMesh&&b.userData.pickMesh.geometry.parameters.radius)||b.userData.baseScale||4;
  const seg=96, pos=new Float32Array((seg+1)*3), R=sz*1.5;
  for(let i=0;i<=seg;i++){const a=i/seg*6.2831853; pos[i*3]=Math.cos(a)*R; pos[i*3+1]=Math.sin(a)*R; pos[i*3+2]=0;}
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const ring=new THREE.Line(g,new THREE.LineDashedMaterial({color:0x9bffff,transparent:true,opacity:0,
    dashSize:R*0.16,gapSize:R*0.10,depthWrite:false,blending:THREE.AdditiveBlending}));
  ring.computeLineDistances(); ring.userData.selRing=true; ring.renderOrder=2;
  b.add(ring); b.userData.selRing=ring;
}
```
In `selectBody`, after line 2401 (`_selected=b;b.userData.selected=true;`):
```js
  if(b.userData.selRing===undefined)_attachSelRing(b);
  b.userData.selPulse=1; sfxBlip('select');
```
In `closeCard` (line 1186), after clearing `_selected.userData.selected=false`, add: `_selected.userData.hoverWant=0;` (guard with the existing `if(_selected)`).

**D4 — `_wireMat` scanline shimmer.** Add helper (near `_holoShell`):
```js
const _wireMats=[];
function _wireMat(col){ const m=new THREE.ShaderMaterial({ wireframe:true, transparent:true,
  blending:THREE.AdditiveBlending, depthWrite:false,
  uniforms:{uColor:{value:new THREE.Color(col)}, uFlow:{value:0}, uAmp:{value:0}},
  vertexShader:`varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform vec3 uColor; uniform float uFlow,uAmp; varying vec3 vP;
    void main(){ float scan=0.5+0.5*sin(vP.y*2.2 - uFlow*3.0);
      float a=(0.20+0.18*uAmp)*(0.45+0.55*scan); gl_FragColor=vec4(uColor*(1.0+uAmp*0.6),a); }`});
  _wireMats.push(m); return m; }
```
Use it for the wireframe material in `_orbBody` (line 1873-1874) and `_holoShell` (line 1664-1665): replace those two `new THREE.MeshBasicMaterial({…wireframe:true…})` with `_wireMat(col)`.
> Keep `pickMesh:core` as the core mesh — pick logic unaffected (wireframe is decorative).

**D5 — Orbit-ring energy.** In `_orbitRing` (before `parent.add(ring);` line 1862) add: `ring.userData._baseOp=ring.material.opacity; _orbitRings.push(ring);`. Declare `const _orbitRings=[];` near `_moonGroups` (line 1852).

**D6 — Meteor static back-streak (≤5).** In `buildMeteors`, after `const m=_orbBody(...)` (line 1949), add a short tapered additive tail child (built once, no per-frame history — the meteor group's spin reads it as a comet):
```js
      const TN=14, tpos=new Float32Array(TN*3);
      for(let k=0;k<TN;k++){ tpos[k*3]= -k*(sz*0.9); tpos[k*3+1]=0; tpos[k*3+2]=0; }   // trails along -x (back-tangent)
      const tg=new THREE.BufferGeometry(); tg.setAttribute('position',new THREE.BufferAttribute(tpos,3));
      const tail=new THREE.Line(tg,new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.5,
        blending:THREE.AdditiveBlending,depthWrite:false}));
      tail.frustumCulled=false; m.add(tail);
```

**D7 — Nebula backdrop (1 draw call, far).** Add after the starfield block in `initUniverse` (after A10):
```js
  (function(){
    const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending,
      uniforms:{uTime:{value:0}},
      vertexShader:`varying vec3 vP; void main(){vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec3 vP; uniform float uTime;
        float h(vec3 p){return fract(sin(dot(p,vec3(13.1,71.7,29.3)))*43758.5);}
        float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          float a=mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                      mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);return a;}
        void main(){ vec3 p=vP*2.4; float c=n(p)*0.6+n(p*2.3)*0.3+n(p*5.0)*0.1; c=smoothstep(0.55,0.95,c);
          vec3 col=mix(vec3(0.05,0.22,0.34),vec3(0.18,0.10,0.34),vP.y*0.5+0.5);
          gl_FragColor=vec4(col,c*0.10); }`});
    const neb=new THREE.Mesh(new THREE.SphereGeometry(6400,24,16),m);   // inside the 6800 star shell, outside maxDistance 5300
    neb.frustumCulled=false; neb.renderOrder=-11; scene.add(neb); _nebula=neb;
  })();
```
> Radius **6400** (not the design's 3000 — that would sit inside the Phase-A galaxy field). Behind everything, ahead of stars.

**D8 — SFX (off by default, calm-aware).** Add near `unlockAudio` (after line 526):
```js
let _sfxOn=false; try{_sfxOn=localStorage.getItem('jv_sfx')==='1';}catch(_){}
window.setSfx=(on)=>{_sfxOn=!!on; try{localStorage.setItem('jv_sfx',on?'1':'0');}catch(_){}};
let _lastBlip=0;
function sfxBlip(kind){
  if(!_sfxOn)return;
  if(document.body.classList.contains('calm')||document.body.classList.contains('reduce-motion'))return;
  const ctx=_ttsCtx; if(!ctx)return;
  const now=performance.now(); if(now-_lastBlip<60)return; _lastBlip=now;
  try{ const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();
    const f={hover:880,select:1320,fly:660}[kind]||880, vol={hover:0.015,select:0.05,fly:0.04}[kind]||0.02;
    o.type='sine'; o.frequency.setValueAtTime(f,t);
    if(kind==='select')o.frequency.exponentialRampToValueAtTime(f*1.5,t+0.12);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001,t+(kind==='hover'?0.10:0.22));
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t+0.3);
  }catch(_){}
}
```

**D9 — Anim-loop block (ONE insertion, after line 2464, before bloom at 2468).** This is D's only per-frame surface:
```js
    // --- INTERACTION TWEENS + VFX PUMP ---
    const _calm=document.body.classList.contains('reduce-motion')||document.body.classList.contains('calm');
    const _hoverK=_calm?0.10:0.22, _selScale=_calm?0.08:0.16;
    function _animPick(g,isBody){const u=g.userData; if(u.hover===undefined)return;
      u.hover += ((u.hoverWant||0)-u.hover)*Math.min(1,dt*9);
      u.selPulse=Math.max(0,(u.selPulse||0)-dt*1.4);
      const sel=u.selected?1:0;
      if(!isBody){ const bs=u.baseScale||1;
        g.scale.setScalar(bs*(1+u.hover*_hoverK+sel*0.06+u.selPulse*_selScale)); }  // orbs: D is sole scale writer
      if(u.selRing){u.selRing.lookAt(camera.position);
        u.selRing.material.opacity += ((sel?0.7:0)-u.selRing.material.opacity)*Math.min(1,dt*6);
        u.selRing.rotation.z += dt*(0.4+u.selPulse*2.0);}
      if(!isBody && u.pickMesh && u.pickMesh.material){u.pickMesh.material.opacity=0.16+u.hover*0.22+sel*0.18;}
    }
    for(let i=0;i<_pickBodies.length;i++)_animPick(_pickBodies[i],false);
    for(let i=0;i<bodies.length;i++)_animPick(bodies[i],true);   // bodies: ring/glow only; scale handled at 2452
    for(let i=0;i<_wireMats.length;i++){_wireMats[i].uniforms.uFlow.value=PULSE.flow;_wireMats[i].uniforms.uAmp.value=_calm?0:A;}
    for(let i=0;i<_orbitRings.length;i++){const m=_orbitRings[i].material;
      if('dashOffset' in m)m.dashOffset-=dt*(_calm?2:6);
      m.opacity=(_orbitRings[i].userData._baseOp||m.opacity)*(0.7+0.5*A);}
    if(_starField){_starField.material.uniforms.uTime.value=_calm?_starField.material.uniforms.uTime.value:t;
      if(!_calm)_starField.rotation.y+=dt*0.003;}
    if(_nebula)_nebula.material.uniforms.uTime.value=t;
```

**D10 — Single-scale-writer for `bodies`.** Because `_animPick(...,true)` does NOT scale `bodies`, fold the hover/sel factor into the EXISTING writer at line 2451-2452:
```js
      const u=b.userData;
      const sc=(1+A*0.12+SPIKE*0.18+born*0.6)*(1+(u.hover||0)*_hoverK+(u.selected?0.06:0)+(u.selPulse||0)*_selScale);
      b.scale.setScalar(sc);
```
> `_hoverK`/`_selScale` are defined in the D9 block which runs LATER in the same frame at line 2464+. Move the two `const _hoverK=…,_selScale=…` declarations (and `_calm`) to the TOP of `tickFrame` (just after `const A=PULSE.amp…` line 2437) so line 2451 can use them. Keep the rest of the D9 block where specified.

**D11 — SFX mute chip (optional UI).** Add a keyboard-focusable `role=status` chip next to `#fxgodrays` calling `setSfx(...)`, default OFF. If time-boxed, skip — `window.setSfx` is callable from console/voice regardless.

**Gate D:** hover scales+glows+labels a body and (if SFX on) blips; click flies+rings it; de-select restores; SFX silent under `calm`/`reduce-motion`; wires shimmer, orbit rings pulse, meteors have comet tails, starfield twinkles in the far backdrop, nebula reads as deep-space glow. Dock/panels/lifeline intact. Frame stays smooth on mobile (≤~3 new persistent draw calls + reused meshes).

---

## CROSS-PHASE INVARIANTS THE INTEGRATOR MUST HOLD

1. **One `_orbBody.userData` object.** Phases B3, C2, D1 all add fields to the SAME object literal. Build it ONCE with the union of fields: `{[tag]:true, label, entityId, kind, pickMesh:core, name:'orb:'+tag+'…', labelText, orbBody:true, tier:tag, labelSprite:_lbl, baseScale:1, hover:0, hoverWant:0, selPulse:0, selected:false, spinSelf:…, getCard:()=>orbCard(g)}`. Push to `_spinBodies` AND `_pickBodies` once.
2. **One starfield block** (A10). D7 nebula is separate; D does not re-add stars.
3. **One pickable registry** (`_pickBodies`, C1). `_hoverProbe` and `onCanvasClick`/`_bodyAt` all use it. No `_pickables`.
4. **One scale writer per body.** Orbs → `_animPick`. `bodies` → line 2452 (with hover folded in, D10). Never both.
5. **One label-opacity writer** (`_labelPass`/`_fadeLabel`, B4). D sets `hoverWant`; it never writes `labelSprite.opacity`.
6. **`_hoverK`/`_selScale`/`_calm` declared once** at top of `tickFrame` (D10 moves them up). Do not redeclare in the D9 block — reference them.
7. **All new fetches are relative bare strings:** `'children?…'`, `'domainaffinity'`, `'control?…'`, `'detail?…'`. No leading `/`.
8. **No new Three import / no version bump.** Only r136 core: `getWorldPosition`, `updateWorldMatrix`, `Vector3`, `Raycaster`, `LineDashedMaterial`, `ShaderMaterial`, `Points`, `AdditiveBlending`.
9. **Holographic only:** every new visual is translucent additive + `depthWrite:false`; selection ring is dashed additive (not solid); no opaque CAD surfaces.
10. **Never break dock/panels/lifeline:** no edits to `#dock`, `#card`/`#prop`/`#sdev`/`#ovWork`/`#search` structure, or the lifeline. All edits are inside `initUniverse`, the build functions, the raycast/select functions, the anim loop, and additive helpers.
11. **Real data only:** placeholder `getCard` stub and the "placed by the golden-angle φ law" line are REMOVED for planets/moons (C2/C3); loading states say "loading real links," never fake values. Clustering/ordering degrade to pure-Vogel/recency if Phase 0 endpoints are absent — never invented data.

**Risk flags removed:** (a) double-push of orb to `_spinBodies` (C2 folds in old line 1885 — delete the standalone); (b) `loadOrbNeighbours` per-tick thrash (C9 gate); (c) `flyToBody` landing in empty space for nested orbs (C7 world-pos); (d) D's starfield/nebula radii overlapping the field (corrected to 6800/6400); (e) two writers fighting on `bodies.scale` and on `labelSprite.opacity` (invariants 4 & 5); (f) `_hoverK` used before declaration (D10 hoist). **Verify each `setMode`/`openVitals`/`worklist` symbol exists (grep) before pasting C4/C5; substitute the real dock mode id if different.** Run the visual gate after every phase.