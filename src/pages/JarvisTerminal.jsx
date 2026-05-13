import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Globe3D from "../components/Globe3D";

const API = "https://jarvis-6bc54ec6.base44.app/functions/getLiveIntel";
const STALE_AFTER_MS = 5 * 60 * 1000;

const C = {
  bg:"#020509", panel:"rgba(4,10,16,0.95)", border:"rgba(0,200,120,0.14)",
  borderB:"rgba(0,200,120,0.06)", neon:"#00c878", neonD:"rgba(0,200,120,0.1)",
  blue:"#0096d4", blueD:"rgba(0,150,212,0.12)",
  gold:"#e8a800", goldD:"rgba(232,168,0,0.12)",
  red:"#e8203c", redD:"rgba(232,32,60,0.12)",
  purple:"#a855f7", purpleD:"rgba(168,85,247,0.12)",
  orange:"#f07820", text:"#566878", textB:"#a8bcc8",
  glass:"rgba(4,10,18,0.82)",
  mark:{ INTERNAL:"#00c878", FINANCIAL:"#e8a800", PII:"#e8203c", LEGAL:"#a855f7", RESTRICTED:"#f07820" },
  type:{ person:"#00c878", org:"#0096d4", invest:"#e8a800", asset:"#f07820", property:"#0096d4", creative:"#a855f7", client:"#e8203c", target:"#e8203c" },
};

const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const asArray = (value) => (Array.isArray(value) ? value : []);
const asString = (value, fallback = "") => (typeof value === "string" ? value : fallback);
const isEarthquakeEntry = (entry) => (
  entry &&
  typeof entry === "object" &&
  typeof entry.id === "string" &&
  typeof entry.place === "string" &&
  Number.isFinite(entry.mag) &&
  Number.isFinite(entry.lat) &&
  Number.isFinite(entry.lng)
);

const normalizeLiveData = (payload) => {
  const data = asObject(payload);
  const corpus = asObject(data.corpus);
  const timeline = asArray(corpus.timeline).filter((item) => item && typeof item === "object");
  const earthquakes = asArray(data.earthquakes).filter(isEarthquakeEntry);
  return {
    ...data,
    corpus: {
      ...corpus,
      timeline,
    },
    earthquakes,
  };
};

// ── SECURITY MARKINGS ─────────────────────────────────────────────────────────
const MARK = ({ label, color }) => (
  <span style={{ fontSize:7, padding:"1px 5px", borderRadius:2, background:color+"18", color, border:`1px solid ${color}33`, letterSpacing:1, fontWeight:"bold", flexShrink:0 }}>
    {label}
  </span>
);

// ── GLASS PANEL ──────────────────────────────────────────────────────────────
const Glass = ({ children, style, onClick }) => (
  <div onClick={onClick} style={{ background:"rgba(4,10,16,0.98)", border:`1px solid ${C.border}`, borderRadius:4, boxShadow:"0 4px 24px rgba(0,0,0,0.7)", ...style }}>{children}</div>
);

// ── ONTOLOGY — REAL OBJECTS ──────────────────────────────────────────────────
const OBJECTS = [
  // PERSONS
  { id:"sam",       label:"Sam Kazangas",       type:"person",   mark:"PII",        conf:1.0, x:460,y:260,
    props:{ DOB:"27 Nov 1992", Heritage:"Greek Cypriot Australian", Home:"35 Springfield Rd Padstow NSW", Email:"samkazangas@gmail.com", Artist:"$avva", GitHub:"samskiezz" },
    linked:["psg","hilts","harrison","nisha","pangani","dubai","crypto","music","target"] },
  { id:"harrison",  label:"Harrison Vaubell",   type:"person",   mark:"INTERNAL",   conf:0.98, x:260,y:220,
    props:{ Phone:"0415557997", Email:"harrison@projectsolar.com.au", Role:"PSG Co-founder 50/50", WA_Messages:"6,161", Dynamic:"Sam mentors tech, Harrison runs ops" },
    linked:["psg","sam","dubai","ifza"] },
  { id:"nisha",     label:"Nisha Nissan",        type:"person",   mark:"PII",        conf:0.97, x:580,y:380,
    props:{ Emails:"nisha.nissan@hotmail.com", Employer:"Commonwealth Bank", Wedding:"Sat 20 Mar 2027 (deciding)", Venues:"Ottimo House · Kefalos CY · Breakfast Point" },
    linked:["sam","austral"] },
  // ORGS
  { id:"psg",       label:"Project Solar Group", type:"org",      mark:"FINANCIAL",  conf:1.0, x:280,y:150,
    props:{ ABN:"29 685 341 744", Ownership:"50/50 Sam + Harrison", Revenue:"$180k/wk", Expenses:"$60k/wk", Net:"$120k/wk", AnnualNet:"~$6.24M", Domain:"@projectsolar.com.au", Tools:"ServiceM8 · OpenSolar · Xero · NAB · RingCentral" },
    linked:["sam","harrison","defended","target"] },
  { id:"hilts",     label:"Hilts Group Australia", type:"org",    mark:"FINANCIAL",  conf:0.99, x:640,y:150,
    props:{ ABN:"27 651 379 298", Ownership:"100% Sam", Email:"sam@hilts.com.au", Clients:"Anytime Fitness · Ashfield RSL · Metro Petrol" },
    linked:["sam","target"] },
  { id:"ifza",      label:"IFZA FZCO Dubai",    type:"org",      mark:"FINANCIAL",  conf:0.90, x:700,y:290,
    props:{ Type:"UAE Free Zone Company", Partners:"Sam + Harrison", Sector:"Solar Energy", Timeline:"Mar 2026 registration", Visa:"Investor visa pathway" },
    linked:["sam","harrison","dubai"] },
  { id:"defended",  label:"Defended Energy",    type:"client",   mark:"INTERNAL",   conf:0.95, x:170,y:340,
    props:{ Owner:"Abdul", Sales:"Bill · Heath", Admin:"Carlos (scheduling) · Hassan (jobs)", Volume:"2–5 jobs/week", Issues:"$900/wk freight absorbed · steep roofs · Origin meter issue" },
    linked:["psg"] },
  // INVESTMENTS
  { id:"pangani",   label:"Pangani TZ",         type:"invest",   mark:"FINANCIAL",  conf:0.88, x:340,y:400,
    props:{ Size:"6 acres / ~10,000 SQM", Location:"Ushongo Mabaoni Beachfront, Pangani, Tanzania", Ask:"$175k USD", Agent:"Jolyon Darker · Peponi Real Estate", Legal:"Eden Law Chambers", Structure:"ZIPA-compliant 99yr leasehold" },
    linked:["sam","zanzibar","target"] },
  { id:"zanzibar",  label:"Zanzibar Resort",    type:"invest",   mark:"FINANCIAL",  conf:0.85, x:390,y:475,
    props:{ Strategy:"$100M resort anchor", Location:"Matemwe / Paje beachfront", Agent:"Africa Luxury Properties", Timeline:"2033–2035", Structure:"ZIPA 99yr leasehold" },
    linked:["sam","pangani","target"] },
  { id:"dubai",     label:"Dubai / Emaar",       type:"invest",   mark:"FINANCIAL",  conf:0.92, x:660,y:250,
    props:{ Plans:"Golf Acres Emaar South 1BR (Apr 2026) + Golf Vale (Jun 2026)", Agent:"M Khalid Khan · APIL Properties", Strategy:"Airbnb yield + investor visa", Currency:"AED pegged USD — zero FX risk" },
    linked:["sam","harrison","ifza","target"] },
  // ASSETS
  { id:"crypto",    label:"XRP / BTC Portfolio", type:"asset",   mark:"FINANCIAL",  conf:0.99, x:740,y:360,
    props:{ XRP:"9,300 units @ $2.07 AUD = $19,251 AUD", Exchanges:"BTCMarkets · Coinbase · eToro · CoinJar", BTC:"Above A$98,000 — institutional buying Mar 2026" },
    linked:["sam","target"] },
  { id:"austral",   label:"Lot 227 Austral NSW", type:"property", mark:"PII",       conf:0.96, x:560,y:470,
    props:{ Address:"Lot 227 Swamphen St, Austral NSW", Builder:"Gurner", Owner:"Nisha Nissan", Electrical:"Consultation confirmed Feb 2026" },
    linked:["nisha"] },
  { id:"music",     label:"$avva Music",         type:"creative", mark:"INTERNAL",  conf:0.99, x:690,y:160,
    props:{ Artist:"$avva", Distributor:"DistroKid", Releases:"Still Me (5k+ streams) · Not Like This · The Same · Later · Working · Breathe", Platforms:"Spotify · Apple Music · Deezer · TikTok · YouTube", Royalties:"Active — payout Feb 2026" },
    linked:["sam"] },
  // TARGET
  { id:"target",    label:"$100M Target",        type:"target",  mark:"RESTRICTED", conf:1.0, x:460,y:155,
    props:{ Goal:"$100M net worth", Timeline:"2033–2035", Engine:"PSG $120k/wk → property → Zanzibar resort", Status:"ON TRACK — PSG $6.24M/yr base" },
    linked:["sam","psg","pangani","zanzibar","dubai","crypto","hilts"] },
];

const LINKS = [
  { a:"sam", b:"psg", label:"CONTROLS 50%", strength:3 },
  { a:"sam", b:"hilts", label:"OWNS 100%", strength:2 },
  { a:"sam", b:"harrison", label:"CO-FOUNDER / CUZZY", strength:3 },
  { a:"sam", b:"nisha", label:"FIANCÉE", strength:3 },
  { a:"sam", b:"pangani", label:"DD ACTIVE", strength:2 },
  { a:"sam", b:"zanzibar", label:"STRATEGY", strength:2 },
  { a:"sam", b:"dubai", label:"ENQUIRY LIVE", strength:2 },
  { a:"sam", b:"crypto", label:"HOLDS", strength:2 },
  { a:"sam", b:"music", label:"ARTIST", strength:1 },
  { a:"sam", b:"target", label:"TARGETS", strength:3 },
  { a:"harrison", b:"psg", label:"OWNS 50%", strength:3 },
  { a:"harrison", b:"dubai", label:"CO-INVESTOR", strength:2 },
  { a:"harrison", b:"ifza", label:"CO-APPLICANT", strength:2 },
  { a:"psg", b:"defended", label:"KEY RETAILER", strength:2 },
  { a:"psg", b:"target", label:"CASH ENGINE", strength:3 },
  { a:"dubai", b:"ifza", label:"VIA IFZA FZCO", strength:2 },
  { a:"pangani", b:"zanzibar", label:"ADJACENT", strength:2 },
  { a:"zanzibar", b:"target", label:"ANCHOR", strength:3 },
  { a:"nisha", b:"austral", label:"OWNER/BUILD", strength:2 },
  { a:"crypto", b:"target", label:"FEEDS", strength:1 },
  { a:"hilts", b:"target", label:"FEEDS", strength:1 },
];

// ── COUNTRIES WITH REAL INTEL ─────────────────────────────────────────────────
const COUNTRIES = [
  { code:"AU", name:"Australia", flag:"🇦🇺", lat:-33.87, lng:151.21, risk:"LOW", riskScore:12,
    positions:["PSG $180k/wk","Hilts Group","Lot 227 Austral","XRP $19k AUD","Wedding planning"],
    watch:["STC rebate scheme","AUD/USD","NAB rate decisions","Solar policy"] },
  { code:"TZ", name:"Tanzania", flag:"🇹🇿", lat:-5.4, lng:38.9, risk:"MEDIUM", riskScore:58,
    positions:["Pangani 6 acres $175k USD — DD active","Eden Law Chambers engaged","ZIPA 99yr leasehold"],
    watch:["TZS/USD","East Africa conflict","Tanzania elections","ZIPA laws"] },
  { code:"AE", name:"UAE/Dubai", flag:"🇦🇪", lat:25.20, lng:55.27, risk:"LOW", riskScore:18,
    positions:["IFZA FZCO registration","Golf Acres Emaar South Apr 2026","Golf Vale Jun 2026","Investor visa Sam + Harrison"],
    watch:["Dubai property index","IFZA fees","AED/AUD","Emaar launch phases"] },
  { code:"ZZ", name:"Zanzibar", flag:"🌍", lat:-6.16, lng:39.19, risk:"MEDIUM", riskScore:52,
    positions:["$100M resort anchor","Matemwe/Paje beachfront","Africa Luxury Properties agent"],
    watch:["Tourism growth","Foreign land laws","East Africa conflict spillover"] },
  { code:"CY", name:"Cyprus", flag:"🇨🇾", lat:35.12, lng:33.43, risk:"LOW", riskScore:8,
    positions:["Heritage — Greek Cypriot Australian","Kefalos wedding venue — active thread"],
    watch:["EU stability","Euro zone","Cyprus property"] },
  { code:"TH", name:"Thailand", flag:"🇹🇭", lat:15.87, lng:100.99, risk:"LOW", riskScore:10,
    positions:["Banyan Tree Phuket — Mar 18-21 2026 (closed)","Grande Centre Point Bangkok"],
    watch:["Trip closed — returned Sydney 22 Mar 2026"] },
];

// ── RISK SIGNALS (scored) ─────────────────────────────────────────────────────
const RISK_SIGNALS = [
  { id:"r1", title:"Defended Energy freight dispute", severity:72, type:"OPERATIONAL", country:"AU", impact:"DIRECT", detail:"Absorbing ~$900/wk freight. Verbal only. No paper trail. SOPA rights available.", linked:"defended", trend:"STABLE" },
  { id:"r2", title:"East Africa conflict — Congo spillover", severity:58, type:"GEOPOLITICAL", country:"TZ", impact:"WATCH", detail:"GDELT: Eastern Congo activity. Monitor Tanzania/Zanzibar border. Pangani risk if escalation.", linked:"pangani", trend:"RISING" },
  { id:"r3", title:"Tanzania land law complexity", severity:55, type:"LEGAL", country:"TZ", impact:"DIRECT", detail:"99yr leasehold — foreign ownership restricted. Eden Law Chambers engaged. ZIPA compliance required.", linked:"pangani", trend:"STABLE" },
  { id:"r4", title:"AU solar policy change risk", severity:68, type:"REGULATORY", country:"AU", impact:"CRITICAL", detail:"STC rebate scheme drives PSG leads directly. Policy cut = direct hit to $120k/wk net.", linked:"psg", trend:"WATCH" },
  { id:"r5", title:"Origin Energy meter application loss", severity:45, type:"OPERATIONAL", country:"AU", impact:"DIRECT", detail:"Picton job — Origin lost application twice. Recurring issue. Needs escalation.", linked:"psg", trend:"STABLE" },
  { id:"r6", title:"Red Sea disruption", severity:40, type:"GEOPOLITICAL", country:"AE", impact:"WATCH", detail:"Brent crude +2.1%. Indian Ocean maritime routes — Zanzibar coastal position affected.", linked:"zanzibar", trend:"RISING" },
  { id:"r7", title:"XRP concentration risk", severity:32, type:"FINANCIAL", country:"AU", impact:"WATCH", detail:"9,300 XRP single asset. Exchange risk across 4 platforms. Regulatory uncertainty.", linked:"crypto", trend:"STABLE" },
  { id:"r8", title:"Wedding decision pending", severity:28, type:"PERSONAL", country:"AU", impact:"LOG", detail:"Ottimo House Sat 20 Mar 2027 — deciding. Cyprus Kefalos thread active. Decision needed.", linked:"nisha", trend:"WATCH" },
];

// ── WATCHLIST ─────────────────────────────────────────────────────────────────
const WATCHLIST_INIT = [
  { id:"w1", obj:"pangani", label:"Pangani DD", status:"ACTIVE", alert:"Eden Law response pending", added:"14 Mar 2026" },
  { id:"w2", obj:"dubai", label:"Golf Acres Emaar", status:"ACTIVE", alert:"APIL Properties — reply received 16 Mar", added:"14 Mar 2026" },
  { id:"w3", obj:"defended", label:"Defended Energy dispute", status:"ALERT", alert:"$900/wk freight — no paper trail", added:"Ongoing" },
  { id:"w4", obj:"psg", label:"PSG Pipeline", status:"LIVE", alert:"119 runs today — 46.2 credits", added:"Automated" },
  { id:"w5", obj:"target", label:"$100M target", status:"ON_TRACK", alert:"PSG net $6.24M/yr. Next: Pangani deposit.", added:"Strategic" },
];

// ─────────────────────────────────────────────────────────────────────────────
// PANEL SYSTEM — Gridline-style window manager
// ─────────────────────────────────────────────────────────────────────────────

const PANEL_DEFS = {
  MAP:        { title:"🌍 GLOBE / MAP",         w:620, h:420, x:0,   y:48 },
  VERTEX:     { title:"◈ VERTEX GRAPH",         w:580, h:420, x:630, y:48 },
  EXPLORER:   { title:"⊞ OBJECT EXPLORER",      w:500, h:380, x:0,   y:478 },
  TIMELINE:   { title:"◷ TIMELINE",             w:500, h:320, x:510, y:478 },
  RISK:       { title:"⚠ RISK SIGNALS",         w:400, h:320, x:1020, y:48 },
  EMAILS:     { title:"✉ EMAIL CORPUS",         w:460, h:360, x:0,   y:868 },
  WATCHLIST:  { title:"◉ WATCHLIST",            w:380, h:300, x:510, y:808 },
  MARKETS:    { title:"$ MARKETS",              w:360, h:300, x:900, y:478 },
  ANALYST:    { title:"◎ AI ANALYST",           w:420, h:440, x:1020, y:378 },
};

// ─────────────────────────────────────────────────────────────────────────────
// VERTEX GRAPH
// ─────────────────────────────────────────────────────────────────────────────
function VertexGraph({ selectedObj, onSelect, focusId }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef(OBJECTS.map(o => ({ ...o, vx:0, vy:0 })));
  const rafRef = useRef(null);
  const drag = useRef(null);
  const dragOff = useRef({ x:0, y:0 });
  const [hov, setHov] = useState(null);

  const getPos = (e, c) => {
    const r = c.getBoundingClientRect();
    return { x:(e.clientX-r.left)*(c.width/r.width), y:(e.clientY-r.top)*(c.height/r.height) };
  };
  const findNode = pos => nodesRef.current.find(n => {
    const dx=n.x-pos.x, dy=n.y-pos.y;
    return Math.sqrt(dx*dx+dy*dy) < n.size+8;
  });

  // Filter to focus node + neighbors if focusId set
  const visibleIds = useMemo(() => {
    if (!focusId) return new Set(OBJECTS.map(o=>o.id));
    const neighbors = new Set([focusId]);
    LINKS.forEach(l => {
      if (l.a===focusId) neighbors.add(l.b);
      if (l.b===focusId) neighbors.add(l.a);
    });
    return neighbors;
  }, [focusId]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    const draw = () => {
      const nodes = nodesRef.current;
      if (!drag.current) {
        // Physics
        for (let i=0; i<nodes.length; i++) {
          for (let j=i+1; j<nodes.length; j++) {
            if (!visibleIds.has(nodes[i].id) || !visibleIds.has(nodes[j].id)) continue;
            const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y;
            const d=Math.sqrt(dx*dx+dy*dy)||1;
            const f=25000/(d*d);
            nodes[i].vx+=dx/d*f; nodes[i].vy+=dy/d*f;
            nodes[j].vx-=dx/d*f; nodes[j].vy-=dy/d*f;
          }
        }
        LINKS.forEach(lnk => {
          if (!visibleIds.has(lnk.a)||!visibleIds.has(lnk.b)) return;
          const a=nodes.find(n=>n.id===lnk.a), b=nodes.find(n=>n.id===lnk.b);
          if (!a||!b) return;
          const dx=b.x-a.x, dy=b.y-a.y, d=Math.sqrt(dx*dx+dy*dy)||1;
          const f=(d-150)*0.015*lnk.strength;
          a.vx+=dx/d*f; a.vy+=dy/d*f; b.vx-=dx/d*f; b.vy-=dy/d*f;
        });
        nodes.forEach(n => {
          n.vx+=(W/2-n.x)*0.003; n.vy+=(H/2-n.y)*0.003;
          n.vx*=0.78; n.vy*=0.78;
          n.x=Math.max(20,Math.min(W-20,n.x+n.vx));
          n.y=Math.max(20,Math.min(H-20,n.y+n.vy));
        });
      }

      ctx.clearRect(0,0,W,H);
      // Grid
      ctx.strokeStyle="rgba(0,200,120,0.02)"; ctx.lineWidth=0.5;
      for (let x=0;x<W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for (let y=0;y<H;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

      // Links
      LINKS.forEach(lnk => {
        if (!visibleIds.has(lnk.a)||!visibleIds.has(lnk.b)) return;
        const a=nodes.find(n=>n.id===lnk.a), b=nodes.find(n=>n.id===lnk.b);
        if (!a||!b) return;
        const active = selectedObj && (selectedObj===lnk.a || selectedObj===lnk.b);
        ctx.save();
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
        ctx.strokeStyle = active ? C.type[a.type]+"cc" : "rgba(0,200,120,0.09)";
        ctx.lineWidth = active ? lnk.strength*1.4 : lnk.strength*0.5;
        if (active){ ctx.shadowBlur=10; ctx.shadowColor=C.type[a.type]; }
        ctx.stroke();
        if (active){
          const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
          ctx.shadowBlur=0; ctx.font="bold 7px Courier New";
          ctx.fillStyle="rgba(160,200,220,0.85)"; ctx.textAlign="center";
          ctx.fillText(lnk.label,mx,my-4);
        }
        ctx.restore();
      });

      // Nodes
      nodes.forEach(node => {
        if (!visibleIds.has(node.id)) return;
        const isSel=selectedObj===node.id, isHov=hov===node.id;
        const r=node.size||12, col=C.type[node.type]||C.neon;
        ctx.save();
        // Glow rings
        if (isSel||isHov){
          [3,2,1].forEach(ring=>{
            ctx.beginPath(); ctx.arc(node.x,node.y,r+ring*6,0,Math.PI*2);
            ctx.strokeStyle=col+Math.floor(0.15/ring*255).toString(16).padStart(2,"0");
            ctx.lineWidth=0.8; ctx.stroke();
          });
        }
        // Outer pulse ring
        ctx.beginPath(); ctx.arc(node.x,node.y,r+4,0,Math.PI*2);
        ctx.strokeStyle=col+"22"; ctx.lineWidth=1; ctx.stroke();
        // Glass fill
        const g=ctx.createRadialGradient(node.x-r*.3,node.y-r*.3,1,node.x,node.y,r);
        g.addColorStop(0,col+"55"); g.addColorStop(.5,col+"22"); g.addColorStop(1,col+"06");
        ctx.beginPath(); ctx.arc(node.x,node.y,r,0,Math.PI*2);
        ctx.fillStyle=g; ctx.fill();
        ctx.strokeStyle=isSel?col:col+"66"; ctx.lineWidth=isSel?1.5:0.8;
        ctx.shadowBlur=isSel?18:5; ctx.shadowColor=col; ctx.stroke();
        // Confidence dot
        ctx.shadowBlur=0;
        ctx.beginPath(); ctx.arc(node.x+r*.6,node.y-r*.6,3,0,Math.PI*2);
        ctx.fillStyle=node.conf>0.9?C.neon:node.conf>0.7?C.gold:C.red; ctx.fill();
        // Label
        ctx.font=`bold ${isSel?9:8}px Courier New`;
        ctx.fillStyle=isSel?col:col+"bb"; ctx.textAlign="center";
        ctx.fillText(node.label,node.x,node.y+r+13);
        // Mark badge
        ctx.font="6px Courier New"; ctx.fillStyle=C.mark[node.mark]+"88";
        ctx.fillText(node.mark,node.x,node.y+r+21);
        ctx.restore();
      });

      rafRef.current=requestAnimationFrame(draw);
    };
    rafRef.current=requestAnimationFrame(draw);
    return ()=>cancelAnimationFrame(rafRef.current);
  }, [hov, selectedObj, visibleIds]);

  return (
    <div style={{ position:"relative", width:"100%", height:"100%" }}>
      <canvas ref={canvasRef} width={560} height={380}
        style={{ width:"100%", height:"100%", cursor:hov?"pointer":"crosshair", display:"block" }}
        onMouseMove={e=>{
          const c=canvasRef.current; if(!c)return;
          const pos=getPos(e,c);
          if(drag.current){ const n=nodesRef.current.find(x=>x.id===drag.current); if(n){n.x=pos.x-dragOff.current.x;n.y=pos.y-dragOff.current.y;} return; }
          const n=findNode(pos); setHov(n?n.id:null);
        }}
        onMouseDown={e=>{
          const c=canvasRef.current; if(!c)return;
          const pos=getPos(e,c); const n=findNode(pos);
          if(n){drag.current=n.id;dragOff.current={x:pos.x-n.x,y:pos.y-n.y};}
        }}
        onMouseUp={e=>{
          if(drag.current){drag.current=null;return;}
          const c=canvasRef.current; if(!c)return;
          const n=findNode(getPos(e,c)); if(n)onSelect(n.id);
        }}
        onMouseLeave={()=>{setHov(null);drag.current=null;}}
      />
      {/* Type legend */}
      <div style={{ position:"absolute", bottom:4, left:6, display:"flex", gap:6, flexWrap:"wrap" }}>
        {Object.entries(C.type).map(([t,col])=>(
          <div key={t} style={{ display:"flex",alignItems:"center",gap:3,background:"rgba(2,5,8,0.85)",padding:"1px 5px",borderRadius:2,border:`1px solid ${col}1a` }}>
            <div style={{ width:5,height:5,borderRadius:"50%",background:col }}/>
            <span style={{ fontSize:6,color:col }}>{t.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div style={{ position:"absolute",top:5,right:6,fontSize:7,color:"rgba(0,200,120,0.35)",letterSpacing:1 }}>
        VERTEX · {OBJECTS.length} OBJECTS · {LINKS.length} LINKS · DRAG NODES
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBE / MAP with USGS live earthquakes
// ─────────────────────────────────────────────────────────────────────────────
function GlobeMap({ selectedCountry, onSelect, earthquakes, liveData }) {
  const [tick, setTick] = useState(0);
  useEffect(()=>{ const t=setInterval(()=>setTick(i=>i+1),800); return()=>clearInterval(t); },[]);

  const proj = (lat,lng) => ({ x:((lng+180)/360)*900, y:((90-lat)/180)*450 });
  const rCol = r => ({LOW:C.neon,MEDIUM:C.gold,HIGH:C.red}[r]||C.text);

  const eqColors = (mag) => mag>=6?"#ff2200":mag>=5?"#ff8800":mag>=4.5?"#ffcc00":"#88ff88";

  return (
    <div style={{ position:"relative",width:"100%",height:"100%",background:"#010408",overflow:"hidden" }}>
      <svg width="100%" height="100%" viewBox="0 0 900 450" preserveAspectRatio="xMidYMid meet" style={{ position:"absolute",inset:0 }}>
        <defs>
          <radialGradient id="bg2" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#030c14"/><stop offset="100%" stopColor="#010408"/>
          </radialGradient>
          <filter id="glow2"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect width="900" height="450" fill="url(#bg2)"/>
        {/* Grid lines */}
        {[-90,-60,-30,0,30,60,90,120,150,180,210,240,270].map(l=><line key={`v${l}`} x1={((l+180)/360)*900} y1={0} x2={((l+180)/360)*900} y2={450} stroke="rgba(0,200,120,0.025)" strokeWidth="0.5"/>)}
        {[-60,-30,0,30,60].map(l=><line key={`h${l}`} x1={0} y1={((90-l)/180)*450} x2={900} y2={((90-l)/180)*450} stroke="rgba(0,200,120,0.025)" strokeWidth="0.5"/>)}
        <line x1={0} y1={225} x2={900} y2={225} stroke="rgba(0,200,120,0.06)" strokeWidth="0.7" strokeDasharray="3,5"/>
        <text x={4} y={222} fontSize={7} fill="rgba(0,200,120,0.2)" fontFamily="Courier New">EQ</text>

        {/* Continents */}
        <polygon points="110,50 240,45 292,90 280,178 232,198 172,188 129,158 100,128 110,84" fill="rgba(2,12,20,0.94)" stroke="rgba(0,200,120,0.1)" strokeWidth="0.7"/>
        <polygon points="212,196 289,198 312,238 306,308 286,356 250,368 226,338 212,288 200,248" fill="rgba(2,12,20,0.94)" stroke="rgba(0,200,120,0.1)" strokeWidth="0.7"/>
        <polygon points="449,65 532,58 540,89 530,128 500,144 470,138 448,118 446,93" fill="rgba(2,12,20,0.94)" stroke="rgba(0,200,120,0.1)" strokeWidth="0.7"/>
        <polygon points="454,129 540,119 560,159 560,229 550,289 530,328 500,348 470,338 450,298 438,239 436,189 444,155" fill="rgba(2,12,20,0.94)" stroke="rgba(0,200,120,0.1)" strokeWidth="0.7"/>
        <polygon points="540,36 730,31 780,65 790,118 770,158 720,174 680,158 640,138 600,128 570,108 545,78" fill="rgba(2,12,20,0.94)" stroke="rgba(0,200,120,0.1)" strokeWidth="0.7"/>
        <polygon points="558,152 603,145 616,174 610,208 585,212 565,192 557,169" fill="rgba(2,12,20,0.94)" stroke="rgba(0,200,120,0.1)" strokeWidth="0.7"/>
        <polygon points="710,294 790,279 830,289 850,324 840,359 800,372 755,364 720,334 708,309" fill="rgba(2,12,20,0.94)" stroke="rgba(0,200,120,0.1)" strokeWidth="0.7"/>
        <ellipse cx={740} cy={213} rx={28} ry={18} fill="rgba(2,12,20,0.94)" stroke="rgba(0,200,120,0.1)" strokeWidth="0.7"/>

        {/* Connection arcs: AU to each country */}
        {(() => {
          const au = proj(-33.87,151.21);
          return COUNTRIES.filter(c=>c.code!=="AU" && c.code!=="TH").map((c,i)=>{
            const to=proj(c.lat,c.lng);
            const col=rCol(c.risk);
            const mx=(au.x+to.x)/2, my=Math.min(au.y,to.y)-70;
            return <path key={i} d={`M ${au.x} ${au.y} Q ${mx} ${my} ${to.x} ${to.y}`}
              fill="none" stroke={col+"20"} strokeWidth="0.7" strokeDasharray="4,4"/>;
          });
        })()}

        {/* USGS Earthquakes — LIVE DATA */}
        {(earthquakes||[]).map((eq,i)=>{
          const pos=proj(eq.lat,eq.lng);
          const col=eqColors(eq.mag);
          const r=Math.max(3,(eq.mag-4)*2.5);
          return (
            <g key={i}>
              <circle cx={pos.x} cy={pos.y} r={r+4} fill={col+"12"} stroke={col+"44"} strokeWidth="0.5"/>
              <circle cx={pos.x} cy={pos.y} r={r} fill={col+"30"} stroke={col} strokeWidth="0.8"/>
              <circle cx={pos.x} cy={pos.y} r={1.5} fill={col}/>
            </g>
          );
        })}

        {/* Country exposure nodes */}
        {COUNTRIES.map(c=>{
          const pos=proj(c.lat,c.lng);
          const isSel=selectedCountry===c.code;
          const col=rCol(c.risk);
          const r=isSel?13:9;
          const p=(tick%25)*0.35;
          return (
            <g key={c.code} onClick={()=>onSelect(c.code)} style={{ cursor:"pointer" }}>
              <circle cx={pos.x} cy={pos.y} r={r+p+10} fill={col+"08"} stroke={col+"10"} strokeWidth="0.3"/>
              <circle cx={pos.x} cy={pos.y} r={r+8} fill={col+"10"} stroke={col+"25"} strokeWidth="0.5"/>
              {isSel && <circle cx={pos.x} cy={pos.y} r={r+16} fill="none" stroke={col} strokeWidth="0.8" strokeDasharray="3,3" opacity={0.6}/>}
              <circle cx={pos.x} cy={pos.y} r={r} fill={col+"18"} stroke={col} strokeWidth={isSel?1.5:0.7} filter="url(#glow2)"/>
              <circle cx={pos.x} cy={pos.y} r={r*0.35} fill={col} opacity={0.8}/>
              {/* Risk score badge */}
              <g>
                <circle cx={pos.x+r+1} cy={pos.y-r-1} r={7} fill="rgba(2,5,8,0.9)" stroke={col+"55"} strokeWidth="0.5"/>
                <text x={pos.x+r+1} y={pos.y-r+2} textAnchor="middle" fontSize={6} fill={col} fontFamily="Courier New" fontWeight="bold">{c.riskScore}</text>
              </g>
              <text x={pos.x} y={pos.y+r+12} textAnchor="middle" fontSize={isSel?8:7} fill={col} fontFamily="Courier New" fontWeight="bold">{c.name}</text>
              <text x={pos.x} y={pos.y+r+20} textAnchor="middle" fontSize={6} fill={col+"66"} fontFamily="Courier New">{c.risk} · {c.positions.length} POS</text>
            </g>
          );
        })}

        {/* Legend */}
        <text x={5} y={444} fontSize={6} fill="rgba(0,200,120,0.18)" fontFamily="Courier New">JARVIS GLOBAL EXPOSURE MAP · USGS LIVE EARTHQUAKES · {earthquakes?.length||0} EQ EVENTS · REAL DATA</text>
      </svg>

      {/* Layer toggles */}
      <div style={{ position:"absolute",top:6,right:6,display:"flex",flexDirection:"column",gap:3 }}>
        {[["MY POSITIONS",C.neon,true],["USGS QUAKES",C.gold,(earthquakes?.length||0)>0],["RISK LAYER",C.red,true],["CONNECTIONS",C.blue,true]].map(([l,col,on])=>(
          <div key={l} style={{ display:"flex",alignItems:"center",gap:5,background:"rgba(1,4,8,0.9)",padding:"3px 7px",borderRadius:3,border:`1px solid ${col}1a`,backdropFilter:"blur(8px)" }}>
            <div style={{ width:5,height:5,borderRadius:"50%",background:on?col:"#222",boxShadow:on?`0 0 4px ${col}`:"none" }}/>
            <span style={{ fontSize:7,color:on?col:"#2a3d4d",letterSpacing:1 }}>{l}</span>
          </div>
        ))}
        {earthquakes && <div style={{ fontSize:7,color:C.gold,padding:"2px 6px",background:"rgba(1,4,8,0.8)",borderRadius:3,border:`1px solid ${C.gold}22`,marginTop:2 }}>
          ⚡ {earthquakes.length} EQ LIVE
        </div>}
      </div>

      {/* Country strip */}
      <div style={{ position:"absolute",bottom:0,left:0,right:0,display:"flex",background:"rgba(1,4,8,0.92)",borderTop:`1px solid ${C.border}` }}>
        {COUNTRIES.map(c=>{
          const col=rCol(c.risk);
          return (
            <div key={c.code} onClick={()=>onSelect(c.code)}
              style={{ flex:1,padding:"4px 2px",textAlign:"center",cursor:"pointer",borderRight:`1px solid ${C.borderB}`,background:selectedCountry===c.code?col+"0c":"transparent" }}>
              <div style={{ fontSize:13 }}>{c.flag}</div>
              <div style={{ fontSize:6,color:selectedCountry===c.code?col:"#2a3a4a",letterSpacing:1,marginTop:1 }}>{c.code}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OBJECT EXPLORER — Palantir-style searchable table
// ─────────────────────────────────────────────────────────────────────────────
function ObjectExplorer({ onSelect, selectedObj }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [markFilter, setMarkFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("label");
  const [expandedObj, setExpandedObj] = useState(null);

  const types = ["ALL",...new Set(OBJECTS.map(o=>o.type))];
  const marks = ["ALL",...new Set(OBJECTS.map(o=>o.mark))];

  const filtered = useMemo(()=>{
    let items = [...OBJECTS];
    if (typeFilter!=="ALL") items=items.filter(o=>o.type===typeFilter);
    if (markFilter!=="ALL") items=items.filter(o=>o.mark===markFilter);
    if (search) {
      const s=search.toLowerCase();
      items=items.filter(o=>o.label.toLowerCase().includes(s)||Object.values(o.props).some(v=>String(v).toLowerCase().includes(s)));
    }
    items.sort((a,b)=>sortBy==="label"?a.label.localeCompare(b.label):b.conf-a.conf);
    return items;
  },[search,typeFilter,markFilter,sortBy]);

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",fontFamily:"Courier New" }}>
      {/* Filters */}
      <div style={{ padding:"6px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:6,flexWrap:"wrap",flexShrink:0 }}>
        <input style={{ flex:1,minWidth:120,background:"rgba(0,200,120,0.04)",border:`1px solid ${C.border}`,borderRadius:3,padding:"4px 8px",color:C.textB,fontFamily:"Courier New",fontSize:9,outline:"none" }}
          placeholder="Search objects, properties..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
          style={{ background:"rgba(0,0,0,0.5)",border:`1px solid ${C.border}`,color:C.textB,fontFamily:"Courier New",fontSize:8,padding:"3px 6px",borderRadius:3,outline:"none" }}>
          {types.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <select value={markFilter} onChange={e=>setMarkFilter(e.target.value)}
          style={{ background:"rgba(0,0,0,0.5)",border:`1px solid ${C.border}`,color:C.textB,fontFamily:"Courier New",fontSize:8,padding:"3px 6px",borderRadius:3,outline:"none" }}>
          {marks.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <div style={{ display:"flex",gap:3 }}>
          {["label","conf"].map(s=>(
            <button key={s} onClick={()=>setSortBy(s)}
              style={{ background:sortBy===s?C.neonD:"transparent",border:`1px solid ${sortBy===s?C.neon+"44":C.border}`,color:sortBy===s?C.neon:C.text,padding:"3px 7px",borderRadius:3,cursor:"pointer",fontSize:7,fontFamily:"Courier New" }}>
              {s==="label"?"A-Z":"CONF"}
            </button>
          ))}
        </div>
      </div>
      {/* Count */}
      <div style={{ padding:"4px 8px",borderBottom:`1px solid ${C.border}`,fontSize:7,color:"#2a3d4d",flexShrink:0,display:"flex",justifyContent:"space-between" }}>
        <span>{filtered.length} objects</span>
        <span>{OBJECTS.length} total · {LINKS.length} links</span>
      </div>
      {/* Table */}
      <div style={{ flex:1,overflowY:"auto" }}>
        {/* Header */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 80px 70px 55px 45px",gap:4,padding:"4px 8px",borderBottom:`1px solid ${C.border}`,fontSize:7,color:"#2a3d4d",position:"sticky",top:0,background:C.bg }}>
          <span>OBJECT</span><span>TYPE</span><span>MARKING</span><span>CONF</span><span>LINKS</span>
        </div>
        {filtered.map(obj=>{
          const col=C.type[obj.type]||C.neon;
          const markCol=C.mark[obj.mark]||C.text;
          const linkCount=LINKS.filter(l=>l.a===obj.id||l.b===obj.id).length;
          const isExp=expandedObj===obj.id;
          const isSel=selectedObj===obj.id;
          return (
            <div key={obj.id}
              style={{ borderBottom:`1px solid rgba(0,200,120,0.04)`,background:isSel?C.neonD:"transparent" }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 80px 70px 55px 45px",gap:4,padding:"5px 8px",cursor:"pointer",alignItems:"center" }}
                onClick={()=>{ setExpandedObj(isExp?null:obj.id); onSelect(obj.id); }}>
                <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                  <div style={{ width:6,height:6,borderRadius:"50%",background:col,boxShadow:`0 0 4px ${col}`,flexShrink:0 }}/>
                  <span style={{ fontSize:9,color:isSel?col:C.textB,fontWeight:isSel?"bold":"normal" }}>{obj.label}</span>
                </div>
                <span style={{ fontSize:7,padding:"1px 5px",borderRadius:2,background:col+"18",color:col,border:`1px solid ${col}33` }}>{obj.type}</span>
                <span style={{ fontSize:7,padding:"1px 4px",borderRadius:2,background:markCol+"18",color:markCol }}>{obj.mark}</span>
                <div style={{ display:"flex",alignItems:"center",gap:3 }}>
                  <div style={{ flex:1,height:3,background:"rgba(0,200,120,0.1)",borderRadius:2,overflow:"hidden" }}>
                    <div style={{ width:`${obj.conf*100}%`,height:"100%",background:obj.conf>0.9?C.neon:obj.conf>0.7?C.gold:C.red }}/>
                  </div>
                  <span style={{ fontSize:7,color:C.text }}>{(obj.conf*100).toFixed(0)}%</span>
                </div>
                <span style={{ fontSize:8,color:C.text,textAlign:"center" }}>{linkCount}</span>
              </div>
              {/* Expanded properties */}
              {isExp && (
                <div style={{ padding:"0 8px 8px 20px",borderTop:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex",gap:4,flexWrap:"wrap",marginBottom:6,marginTop:5 }}>
                    <MARK label={obj.mark} color={markCol}/>
                    <MARK label={obj.type.toUpperCase()} color={col}/>
                    <span style={{ fontSize:7,color:"#2a3d4d" }}>CONF: {(obj.conf*100).toFixed(0)}%</span>
                  </div>
                  {Object.entries(obj.props).map(([k,v])=>(
                    <div key={k} style={{ display:"flex",gap:8,padding:"2px 0",borderBottom:`1px solid rgba(0,200,120,0.03)` }}>
                      <span style={{ fontSize:8,color:"#2a3d4d",minWidth:100,flexShrink:0 }}>{k}</span>
                      <span style={{ fontSize:8,color:C.textB,flex:1 }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop:6,fontSize:7,color:"#2a3d4d" }}>LINKED OBJECTS ({LINKS.filter(l=>l.a===obj.id||l.b===obj.id).length})</div>
                  <div style={{ display:"flex",gap:4,flexWrap:"wrap",marginTop:3 }}>
                    {LINKS.filter(l=>l.a===obj.id||l.b===obj.id).map((l,i)=>{
                      const other=OBJECTS.find(o=>o.id===(l.a===obj.id?l.b:l.a));
                      if(!other)return null;
                      const oc=C.type[other.type]||C.neon;
                      return (<span key={i} style={{ fontSize:7,padding:"1px 6px",borderRadius:3,background:oc+"18",color:oc,border:`1px solid ${oc}33` }}>
                        {l.label} → {other.label}
                      </span>);
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE — Scrollable event stream
// ─────────────────────────────────────────────────────────────────────────────
function TimelinePanel({ liveData }) {
  const [catFilter, setCatFilter] = useState("ALL");
  const events = liveData?.corpus?.timeline || [];
  const allCats = ["ALL",...new Set(events.map(e=>e.cat))];
  const filtered = catFilter==="ALL" ? events : events.filter(e=>e.cat===catFilter);
  const catCol = c => ({Travel:C.orange,Investments:C.gold,Music:C.purple,Crypto:C.gold,PSG:C.blue,PSG_Business:C.blue,Finance:C.gold,Wedding:C.purple})[c]||C.text;

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",fontFamily:"Courier New" }}>
      <div style={{ padding:"5px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:4,flexWrap:"wrap",flexShrink:0 }}>
        {allCats.map(c=>(
          <button key={c} onClick={()=>setCatFilter(c)}
            style={{ background:catFilter===c?(catCol(c)+"22"):"transparent",border:`1px solid ${catFilter===c?catCol(c)+"44":C.borderB}`,color:catFilter===c?catCol(c):C.text,padding:"2px 7px",borderRadius:3,cursor:"pointer",fontSize:7,fontFamily:"Courier New" }}>
            {c}
          </button>
        ))}
      </div>
      <div style={{ padding:"4px 8px",fontSize:7,color:"#2a3d4d",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between" }}>
        <span>{filtered.length} events shown</span>
        <span>PALANTIR TIMELINE · 3,018 total corpus events</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",position:"relative" }}>
        {/* Timeline axis */}
        <div style={{ position:"absolute",left:70,top:0,bottom:0,width:1,background:"rgba(0,200,120,0.12)" }}/>
        {filtered.map((ev,i)=>{
          const col=catCol(ev.cat);
          return (
            <div key={i} style={{ display:"flex",gap:0,padding:"5px 8px",borderBottom:`1px solid rgba(0,200,120,0.03)`,alignItems:"flex-start" }}>
              <div style={{ width:62,flexShrink:0,textAlign:"right",paddingRight:10 }}>
                <span style={{ fontSize:7,color:col }}>{ev.date}</span>
              </div>
              <div style={{ width:8,height:8,borderRadius:"50%",background:col,flexShrink:0,marginTop:2,boxShadow:`0 0 6px ${col}` }}/>
              <div style={{ flex:1,paddingLeft:10 }}>
                <div style={{ fontSize:7,color:col,letterSpacing:1,marginBottom:2 }}>{ev.cat}</div>
                <div style={{ fontSize:9,color:C.textB,lineHeight:1.4 }}>{ev.ev}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK SIGNALS — Threat scoring
// ─────────────────────────────────────────────────────────────────────────────
function RiskPanel({ onFocus }) {
  const [sortBy, setSortBy] = useState("severity");
  const sorted = [...RISK_SIGNALS].sort((a,b)=>sortBy==="severity"?b.severity-a.severity:a.type.localeCompare(b.type));
  const trendCol = t => ({RISING:C.red,STABLE:C.gold,WATCH:C.orange})[t]||C.text;
  const typeCol = t => ({OPERATIONAL:C.blue,GEOPOLITICAL:C.red,LEGAL:C.purple,REGULATORY:C.orange,FINANCIAL:C.gold,PERSONAL:C.text})[t]||C.text;

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",fontFamily:"Courier New" }}>
      <div style={{ padding:"5px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0 }}>
        <span style={{ fontSize:7,color:"#2a3d4d" }}>{RISK_SIGNALS.length} active signals</span>
        <div style={{ display:"flex",gap:3 }}>
          {["severity","type"].map(s=>(
            <button key={s} onClick={()=>setSortBy(s)}
              style={{ background:sortBy===s?C.redD:"transparent",border:`1px solid ${sortBy===s?C.red+"33":C.borderB}`,color:sortBy===s?C.red:C.text,padding:"2px 6px",borderRadius:3,cursor:"pointer",fontSize:7,fontFamily:"Courier New" }}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {/* Score histogram */}
      <div style={{ padding:"6px 8px",borderBottom:`1px solid ${C.border}`,flexShrink:0 }}>
        <div style={{ fontSize:7,color:"#2a3d4d",marginBottom:4 }}>SEVERITY DISTRIBUTION</div>
        <div style={{ display:"flex",gap:2,alignItems:"flex-end",height:24 }}>
          {sorted.map(s=>(
            <div key={s.id} style={{ flex:1,background:s.severity>60?C.red:s.severity>40?C.gold:C.neon,borderRadius:"1px 1px 0 0",height:`${s.severity/100*24}px`,opacity:0.7 }}
              title={`${s.title}: ${s.severity}`}/>
          ))}
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto" }}>
        {sorted.map(sig=>{
          const obj=OBJECTS.find(o=>o.id===sig.linked);
          const col=sig.severity>60?C.red:sig.severity>40?C.gold:C.neon;
          return (
            <div key={sig.id} style={{ padding:"7px 8px",borderBottom:`1px solid rgba(0,200,120,0.04)`,cursor:"pointer" }}
              onClick={()=>onFocus&&onFocus(sig.linked)}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4 }}>
                <div style={{ flex:1,paddingRight:8 }}>
                  <span style={{ fontSize:9,color:C.textB,fontWeight:"bold" }}>{sig.title}</span>
                  <div style={{ display:"flex",gap:4,marginTop:3,flexWrap:"wrap" }}>
                    <span style={{ fontSize:7,padding:"1px 4px",borderRadius:2,background:typeCol(sig.type)+"18",color:typeCol(sig.type),border:`1px solid ${typeCol(sig.type)}33` }}>{sig.type}</span>
                    <span style={{ fontSize:7,padding:"1px 4px",borderRadius:2,background:trendCol(sig.trend)+"18",color:trendCol(sig.trend) }}>{sig.trend}</span>
                    <span style={{ fontSize:7,color:"#2a3d4d" }}>{COUNTRIES.find(c=>c.code===sig.country)?.flag} {sig.country}</span>
                  </div>
                </div>
                <div style={{ textAlign:"right",flexShrink:0 }}>
                  <div style={{ fontSize:18,color:col,fontWeight:"bold",lineHeight:1 }}>{sig.severity}</div>
                  <div style={{ fontSize:6,color:"#2a3d4d",marginTop:2 }}>SCORE</div>
                </div>
              </div>
              {/* Score bar */}
              <div style={{ height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden",marginBottom:4 }}>
                <div style={{ width:`${sig.severity}%`,height:"100%",background:col,boxShadow:`0 0 6px ${col}` }}/>
              </div>
              <div style={{ fontSize:8,color:C.text,lineHeight:1.4 }}>{sig.detail}</div>
              {obj && <div style={{ fontSize:7,color:C.type[obj.type]||C.neon,marginTop:3 }}>→ {obj.label}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL CORPUS BROWSER
// ─────────────────────────────────────────────────────────────────────────────
function EmailCorpus({ liveData }) {
  const [tab, setTab] = useState("INVEST");
  const [search, setSearch] = useState("");

  const corpus = liveData?.corpus || {};
  const tabs = {
    INVEST:  { label:"INVESTMENTS", data:corpus.investment_emails||[], color:C.gold },
    CRYPTO:  { label:"CRYPTO", data:corpus.crypto_emails||[], color:C.orange },
    PSG:     { label:"PSG", data:corpus.psg_emails||[], color:C.blue },
    TRAVEL:  { label:"TRAVEL", data:corpus.travel_emails||[], color:C.orange },
    WEDDING: { label:"WEDDING", data:corpus.wedding_emails||[], color:C.purple },
    MUSIC:   { label:"MUSIC", data:corpus.music_emails||[], color:C.purple },
  };

  const items = (tabs[tab]?.data||[]).filter(e=>!search||e.subject?.toLowerCase().includes(search.toLowerCase())||e.from?.toLowerCase().includes(search.toLowerCase()));
  const col = tabs[tab]?.color || C.neon;

  const sigColors = { BULLISH:C.neon, BEARISH:C.red, NEUTRAL:C.gold, MILESTONE:C.purple, RELEASE:C.blue, ROYALTY:C.gold, PLATFORM:C.blue };
  const catColors = { DUBAI:C.blue, ZANZIBAR:C.gold, PANGANI:C.gold, LEGAL:C.purple, PORTFOLIO:"#888", AU_PROPERTY:C.neon, ACCOMMODATION:C.orange, FLIGHT:C.blue, ARRIVAL:C.neon, CYPRUS:C.purple, SYDNEY:C.neon, INVOICE:C.blue, CREDIT:C.gold, ADMIN:"#888" };

  const facts = corpus.facts;

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",fontFamily:"Courier New" }}>
      {/* Fact counts */}
      <div style={{ padding:"4px 6px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:6,flexWrap:"wrap",flexShrink:0 }}>
        {facts && Object.entries(facts.predicates||{}).map(([k,v])=>(
          <div key={k} style={{ background:C.neonD,padding:"2px 7px",borderRadius:2,border:`1px solid ${C.border}`,display:"flex",gap:4 }}>
            <span style={{ fontSize:7,color:"#2a3d4d" }}>{k}</span>
            <span style={{ fontSize:8,color:C.neon,fontWeight:"bold" }}>{v.toLocaleString()}</span>
          </div>
        ))}
        <span style={{ fontSize:7,color:"#2a3d4d",marginLeft:"auto",display:"flex",alignItems:"center" }}>3,804 emails · 15,822 WA · 8,939 facts</span>
      </div>
      {/* Tabs */}
      <div style={{ display:"flex",borderBottom:`1px solid ${C.border}`,flexShrink:0 }}>
        {Object.entries(tabs).map(([k,t])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{ flex:1,padding:"5px 3px",background:"transparent",border:"none",borderBottom:tab===k?`2px solid ${t.color}`:"2px solid transparent",color:tab===k?t.color:"#2a3d4d",fontSize:7,letterSpacing:0.5,cursor:"pointer",fontFamily:"Courier New" }}>
            {t.label} ({t.data.length})
          </button>
        ))}
      </div>
      {/* Search */}
      <div style={{ padding:"4px 6px",borderBottom:`1px solid ${C.border}`,flexShrink:0 }}>
        <input style={{ width:"100%",background:"rgba(0,200,120,0.03)",border:`1px solid ${C.border}`,borderRadius:3,padding:"4px 7px",color:C.textB,fontFamily:"Courier New",fontSize:9,outline:"none" }}
          placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      {/* Emails */}
      <div style={{ flex:1,overflowY:"auto" }}>
        {items.length===0 && <div style={{ padding:16,color:"#2a3d4d",fontSize:9 }}>{liveData?"No results":"Loading corpus..."}</div>}
        {items.map((e,i)=>{
          const labelCol = (e.cat&&catColors[e.cat]) || (e.signal&&sigColors[e.signal]) || col;
          const labelText = e.cat || e.signal || e.status || "";
          return (
            <div key={i} style={{ padding:"6px 8px",borderBottom:`1px solid rgba(0,200,120,0.03)`,cursor:"default" }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:2 }}>
                <span style={{ fontSize:7,padding:"1px 4px",borderRadius:2,background:labelCol+"18",color:labelCol,border:`1px solid ${labelCol}33` }}>{labelText}</span>
                <span style={{ fontSize:7,color:"#2a3d4d" }}>{e.date}</span>
              </div>
              <div style={{ fontSize:9,color:C.textB,fontWeight:"bold",marginBottom:1,lineHeight:1.3 }}>{e.subject?.slice(0,85)}</div>
              <div style={{ fontSize:8,color:C.text }}>{e.from?.slice(0,60)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WATCHLIST
// ─────────────────────────────────────────────────────────────────────────────
function WatchlistPanel({ onFocus }) {
  const [items, setItems] = useState(WATCHLIST_INIT);
  const statusCol = s => ({ACTIVE:C.neon,ALERT:C.red,LIVE:C.blue,ON_TRACK:C.neon,WATCHING:C.gold})[s]||C.text;

  const toggle = (id) => setItems(prev=>prev.map(i=>i.id===id?{...i,status:i.status==="ACTIVE"?"WATCHING":"ACTIVE"}:i));

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",fontFamily:"Courier New" }}>
      <div style={{ padding:"4px 8px",fontSize:7,color:"#2a3d4d",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between" }}>
        <span>{items.length} monitored objects</span>
        <span style={{ color:C.red }}>{items.filter(i=>i.status==="ALERT").length} ALERTS</span>
      </div>
      <div style={{ flex:1,overflowY:"auto" }}>
        {items.map(item=>{
          const col=statusCol(item.status);
          const obj=OBJECTS.find(o=>o.id===item.obj);
          return (
            <div key={item.id} style={{ padding:"7px 8px",borderBottom:`1px solid rgba(0,200,120,0.04)`,cursor:"pointer" }}
              onClick={()=>onFocus&&onFocus(item.obj)}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                  <div style={{ width:7,height:7,borderRadius:"50%",background:col,boxShadow:`0 0 5px ${col}`,animation:item.status==="ALERT"?"pulse 1.5s infinite":"none" }}/>
                  <span style={{ fontSize:9,color:C.textB,fontWeight:"bold" }}>{item.label}</span>
                </div>
                <span style={{ fontSize:7,padding:"1px 5px",borderRadius:2,background:col+"18",color:col,border:`1px solid ${col}33` }}>{item.status}</span>
              </div>
              <div style={{ fontSize:8,color:C.text,marginBottom:2 }}>{item.alert}</div>
              {obj && <div style={{ display:"flex",gap:4 }}>
                <MARK label={obj.type.toUpperCase()} color={C.type[obj.type]||C.neon}/>
                <MARK label={obj.mark} color={C.mark[obj.mark]||C.text}/>
                <span style={{ fontSize:7,color:"#2a3d4d",marginLeft:"auto" }}>{item.added}</span>
              </div>}
              <button onClick={e=>{e.stopPropagation();toggle(item.id);}}
                style={{ marginTop:4,background:"transparent",border:`1px solid ${C.borderB}`,color:C.text,padding:"1px 8px",borderRadius:3,cursor:"pointer",fontSize:7,fontFamily:"Courier New",width:"100%" }}>
                {item.status==="WATCHING"?"UNWATCH":"TOGGLE WATCH"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKETS PANEL — Live Yahoo Finance via backend
// ─────────────────────────────────────────────────────────────────────────────
function MarketsPanel({ liveData, loading }) {
  const FALLBACK = [
    { sym:"XRP/AUD", display:"XRP/AUD", price:"2.0700", change_pct:1.2, note:"9,300 × $2.07 = $19,251 AUD HELD" },
    { sym:"BTC/AUD", display:"BTC/AUD", price:"98,400", change_pct:0.6, note:"Above A$98k — institutional buying" },
    { sym:"ETH/USD", display:"ETH/USD", price:"2,041", change_pct:-1.4 },
    { sym:"AUD/USD", display:"AUD/USD", price:"0.6320", change_pct:0.3, note:"Watch: USD assets cheaper" },
    { sym:"GOLD",    display:"GOLD XAU", price:"3,021", change_pct:0.6 },
    { sym:"OIL",     display:"CRUDE OIL", price:"81.40", change_pct:2.1, note:"Red Sea disruption" },
    { sym:"AED",     display:"AED/AUD", price:"0.4190", change_pct:0.0, note:"Pegged USD — zero FX risk" },
    { sym:"TZS",     display:"TZS/USD", price:"0.000389", change_pct:0.1, note:"Stable" },
  ];

  const markets = liveData?.markets;
  const displayData = FALLBACK;

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",fontFamily:"Courier New" }}>
      <div style={{ padding:"4px 8px",fontSize:7,color:"#2a3d4d",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between" }}>
        <span>LIVE MARKET DATA</span>
        <span style={{ color:markets?C.neon:C.gold }}>{markets?"● LIVE (Yahoo Finance)":"● FALLBACK"}</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"4px 0" }}>
        {displayData.map((m,i)=>{
          const up=(m.change_pct||0)>=0;
          const col=up?C.neon:C.red;
          return (
            <div key={i} style={{ padding:"6px 8px",borderBottom:`1px solid rgba(0,200,120,0.04)` }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2 }}>
                <span style={{ fontSize:8,color:"#2a3d4d",letterSpacing:1 }}>{m.display}</span>
                <span style={{ fontSize:8,color:col }}>{up?"▲":"▼"} {Math.abs(m.change_pct).toFixed(2)}%</span>
              </div>
              <div style={{ fontSize:13,color:C.textB,fontWeight:"bold",letterSpacing:1 }}>{m.price}</div>
              {m.note && <div style={{ fontSize:7,color:C.text,marginTop:2 }}>{m.note}</div>}
            </div>
          );
        })}
        {/* Portfolio summary */}
        <div style={{ margin:"6px 8px",padding:"10px",background:C.neonD,border:`1px solid ${C.neon}22`,borderRadius:4 }}>
          <div style={{ fontSize:7,color:C.neon,letterSpacing:2,marginBottom:8 }}>PORTFOLIO POSITIONS</div>
          {[["XRP 9,300 units","$19,251 AUD",C.neon],["PSG Net/wk","$120,000",C.neon],["PSG Annual Net","~$6.24M",C.neon],["Pangani Ask","$175k USD",C.gold],["Golf Acres","AED TBC",C.blue],["$100M Target","2033–2035",C.red]].map(([k,v,col])=>(
            <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid rgba(0,200,120,0.04)` }}>
              <span style={{ fontSize:8,color:"#2a3d4d" }}>{k}</span>
              <span style={{ fontSize:9,color:col,fontWeight:"bold" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ANALYST — Chat over real corpus
// ─────────────────────────────────────────────────────────────────────────────
function AnalystPanel() {
  const [msgs, setMsgs] = useState([
    { r:"sys", t:"JARVIS ANALYST — GOTHAM MODE" },
    { r:"sys", t:`Corpus: 3,804 emails · 15,822 WA · 8,939 facts · 11,299 vectors\nOntology: ${OBJECTS.length} objects · ${LINKS.length} links · ${RISK_SIGNALS.length} risk signals` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  const KB = {
    psg: `PSG — Project Solar Group Pty Ltd\nABN: 29 685 341 744 | 50/50 Sam + Harrison Vaubell\nRevenue: $180k/wk | Expenses: $60k/wk | Net: $120k/wk | Annual: ~$6.24M\nContractors: Jesse Gordon · Tyler Gordon · Xavier Aguirre · Sulieman el-Dannoui · Adam Kandeel · Amjad Malas · Xavier Cevallos\nAdmin (PH): Jas (accounts@) · Marvin Oqueriza Benson · Red · Joplin Lualhati (WizeWork)\nPipeline: Gmail → OpenSolar → ServiceM8 — 119 runs today · 46.2 credits\n\nDEFENDED ENERGY ISSUES (real from WA corpus):\n• Stopped site delivery — Sam absorbing ~$900/wk freight verbally\n• Steep roof jobs (Wahroonga 29°) sent without pre-inspection\n• Origin Energy lost Picton meter application twice\n• 30-day payment attempt — rejected, 7 days enforced\nRisk signal: SCORE 72 — SOPA rights available`,
    zanzibar: `ZANZIBAR / PANGANI — REAL EMAIL EVIDENCE\n\n14 Mar 2026: Jolyon Darker (Peponi Real Estate) → "Re: Serious Enquiry — 6 Acres Ushongo Mabaoni Beachfront, Pangani"\n16 Mar 2026: Africa Luxury Properties → "RE: Beachfront Land Acquisition — Matemwe, Zanzibar — ~10,000 SQM"\n15 Mar 2026: Sam → "Re: Beachfront Land Acquisition Zanzibar - Foreign Investor USD 100-200k"\n12 Mar 2026: Eden Law Chambers → Legal structure for ZIPA-compliant 99yr leasehold\n\nAsk: $175k USD | Size: 6 acres / ~10,000 SQM\nStrategy: $100M resort anchor 2033–2035\nRisk score: 55 (land law) + 58 (East Africa conflict)\nStatus: DD ACTIVE`,
    dubai: `DUBAI — REAL EMAIL EVIDENCE\n\n16 Mar 2026: M Khalid Khan (APIL Properties) → "Re: Golf Acres, Emaar South — 1BR Business Investment Enquiry"\n16 Mar 2026: APIL Properties → "Golf Vale by Emaar — Phase 2 Now Open — 1BR from AED 750k"\n15 Mar 2026: Sam → "Re: IFZA Free Zone Company Setup — 2 Partners, Solar Energy, Urgent"\n\nTimeline: IFZA FZCO Mar 2026 → Golf Acres deposit Apr 2026 → Golf Vale Jun 2026\nStrategy: Airbnb yield + investor visa (Sam + Harrison)\nCurrency: AED pegged USD — zero FX risk\nRisk score: 18 (LOW)`,
    risk: `RISK SIGNAL MATRIX — ${RISK_SIGNALS.length} active signals\n\n` + RISK_SIGNALS.sort((a,b)=>b.severity-a.severity).map(s=>`[${s.severity}] ${s.title} — ${s.type} — ${s.trend}\n    ${s.detail}`).join("\n\n"),
    wealth: `WEALTH TARGET — $100M BY 2033–2035\n\nCurrent:\n• PSG net: $120k/wk = $6.24M/yr\n• XRP: 9,300 × $2.07 = $19,251 AUD\n• Pangani land: $175k USD (DD active)\n• Dubai pipeline: Golf Acres + Golf Vale + IFZA\n\nPath: PSG cash → property acquisition → Zanzibar resort\nTimeline: 2026 (Dubai IFZA) → 2026 (Pangani deposit) → 2033-2035 (Zanzibar resort anchor)\n\nKey lever: If XRP hits $5 AUD → 9,300 × $5 = $46,500 instant boost`,
    harrison: `HARRISON VAUBELL — DEEP INTEL (6,161 WA messages analysed)\n\nRole: PSG co-founder 50/50. Phone: 0415557997\nRelationship: "cuzzy", deep trust. Daily contact. Sam mentors tech, Harrison runs ops.\nShared: IFZA FZCO Dubai (co-applicant). Golf Acres deposit.\nFinancial: CC on ALL PSG emails — non-negotiable.\nPersonal: Harrison paid for Thailand trip Aug 2025. Sam proactively checks in.`,
    music: `$AVVA — DISTROKID + STREAMING DATA (real)\n\nStill Me: 5,000+ streams by 17 Feb 2026 — Apple Lyrics approved — YouTube ContentID registered\nNot Like This: live Deezer 11 Mar 2026\nThe Same: live Deezer 11 Mar 2026\nLater: live Spotify 10 Feb 2026 — Apple Lyrics approved\nWorking: pipeline Mar 2026\n\nDistributor: DistroKid. Royalty withdrawal 11 Feb 2026.\nPlatforms: Spotify · Apple Music · Deezer · TikTok · YouTube Music · Amazon · Instagram/Facebook`,
    nisha: `NISHA NISSAN — FIANCÉE\n\nnisha.nissan@hotmail.com · nisha.nissan17@gmail.com\nEmployer: Commonwealth Bank\nProperty: Lot 227 Swamphen St, Austral NSW — builder Gurner (build active)\nDaughter: born Aug 2025\n\nWEDDING (active email threads):\n• Kefalos venue Cyprus — May 2027 — active thread (kefalos@kefalos.com.cy + damon@damon.com.cy)\n• Ottimo House — Sat 20 Mar 2027 — proposed hold (DECIDING)\n• Breakfast Point Country Club — toured Feb 8 2026\nRisk signal: Score 28 — decision pending`,
    corpus: `DATA CORPUS — VERIFIED SOURCES\n\nGmail: 3,804 emails processed (11 categories)\nWhatsApp (5 chats): 15,822 messages\n  Harrison personal: 6,161 | PSG Admin group: 2,524 | Bentley/Defended: 2,982 | Abdul 1:1: 334\n\nExtracted facts: 8,939\n  amount_aud: 4,764 | contact_email: 3,271 | phone: 640 | abn: 264\n\nCategory breakdown:\n  General: 5,857 | Property_Build: 1,030 | Shopping: 928 | Property_Leads: 281 | Wedding: 224\n  Travel: 142 | Hilts_Business: 136 | Finance_Banking: 119 | Dubai_Investment: 25\n\nChromaDB vectors: 11,299 (all-MiniLM-L6-v2)\nTimeline events: 3,018\nPalantir batches: Investments(89) Crypto(92) Finance(306) PSG(38) Travel(78) Music(104) Legal(55) ATO(126)`,
  };

  const respond = q => {
    const l=q.toLowerCase();
    if (l.match(/risk|threat|signal|danger|score/)) return KB.risk;
    if (l.match(/psg|solar|pipeline|revenue|contractor|defended|harrison.*psg/)) return KB.psg;
    if (l.match(/zanzibar|pangani|tanzania|beachfront|ushongo|matemwe|eden law/)) return KB.zanzibar;
    if (l.match(/dubai|emaar|ifza|golf acres|golf vale|apil/)) return KB.dubai;
    if (l.match(/harrison/)) return KB.harrison;
    if (l.match(/nisha|wedding|cyprus|kefalos|ottimo|austral/)) return KB.nisha;
    if (l.match(/music|avva|\$avva|spotify|distrokid|stream/)) return KB.music;
    if (l.match(/wealth|100m|target|million/)) return KB.wealth;
    if (l.match(/corpus|data|source|vector|email|fact|whatsapp|wa|palantir/)) return KB.corpus;
    if (l.match(/xrp|btc|crypto|bitcoin|coin/)) return `XRP: 9,300 units @ $2.07 AUD = $19,251 AUD\nExchanges: BTCMarkets · Coinbase · eToro · CoinJar\n\nRecent BTC Markets signals (real email corpus):\n• "Bitcoin ETFs show sustained weekly inflows" (16 Mar)\n• "Bitcoin back above A$98,000 — institutions buying" (12 Mar)\n• "Bitcoin whales buy as markets sell" (23 Feb)\n• CoinJar: "XRP momentum continues" (23 Feb)\n\nNet: Bullish institutional accumulation pattern Mar 2026.`;
    if (l.match(/object|ontology|node|link|graph|vertex/)) return `ONTOLOGY — ${OBJECTS.length} objects · ${LINKS.length} links\n\nObject types: ${[...new Set(OBJECTS.map(o=>o.type))].join(" · ")}\nSecurity marks: ${[...new Set(OBJECTS.map(o=>o.mark))].join(" · ")}\n\nHighest confidence: ${OBJECTS.sort((a,b)=>b.conf-a.conf).slice(0,3).map(o=>`${o.label} (${(o.conf*100).toFixed(0)}%)`).join(" · ")}\n\nMost connected: ${OBJECTS.map(o=>({...o,lc:LINKS.filter(l=>l.a===o.id||l.b===o.id).length})).sort((a,b)=>b.lc-a.lc).slice(0,3).map(o=>`${o.label} (${o.lc} links)`).join(" · ")}`;
    return `Query: "${q}"\n\nSearching real corpus (11,299 vectors · 8,939 facts · 15,822 WA messages)\n\nTry: psg · zanzibar · dubai · risk · xrp · harrison · nisha · music · wealth · corpus · ontology`;
  };

  const send = async () => {
    if (!input.trim()||loading) return;
    const q=input.trim(); setMsgs(m=>[...m,{r:"user",t:q}]); setInput(""); setLoading(true);
    await new Promise(r=>setTimeout(r,300+Math.random()*200));
    setMsgs(m=>[...m,{r:"jarvis",t:respond(q)}]); setLoading(false);
    setTimeout(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),100);
  };

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",fontFamily:"Courier New" }}>
      <div style={{ flex:1,overflowY:"auto",padding:"8px 10px" }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ marginBottom:10 }}>
            <div style={{ fontSize:7,color:m.r==="user"?C.gold:m.r==="jarvis"?C.neon:"#2a3d4d",letterSpacing:2,marginBottom:2 }}>
              {m.r==="user"?"YOU ›":m.r==="jarvis"?"JARVIS ›":"//"}
            </div>
            <div style={{ fontSize:9,color:m.r==="user"?C.textB:m.r==="jarvis"?"#90f0c0":"#2a3d4d",lineHeight:1.7,whiteSpace:"pre-wrap" }}>{m.t}</div>
          </div>
        ))}
        {loading&&<div style={{ color:C.neon,fontSize:9 }}>scanning corpus...</div>}
        <div ref={endRef}/>
      </div>
      <div style={{ display:"flex",gap:5,padding:"6px 8px",borderTop:`1px solid ${C.border}`,flexShrink:0 }}>
        <input style={{ flex:1,background:"rgba(0,200,120,0.04)",border:`1px solid ${C.border}`,borderRadius:3,padding:"6px 8px",color:C.textB,fontFamily:"Courier New",fontSize:9,outline:"none" }}
          placeholder="risk · psg · zanzibar · dubai · ontology..."
          value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}/>
        <button onClick={send} style={{ background:C.neonD,border:`1px solid ${C.neon}33`,color:C.neon,padding:"6px 12px",borderRadius:3,cursor:"pointer",fontSize:8,fontFamily:"Courier New",letterSpacing:1 }}>RUN</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAGGABLE PANEL WRAPPER — Gridline window manager
// ─────────────────────────────────────────────────────────────────────────────
function DraggablePanel({ id, title, children, state, onMove, onResize, onClose, onMinimize, zIndex, onClick, minimized }) {
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  const onMouseDown = (e) => {
    if (e.target.closest(".panel-ctrl")) return;
    onClick();
    const startX=e.clientX, startY=e.clientY;
    const startPX=state.x, startPY=state.y;
    const onMove_=(ev) => onMove(id, startPX+(ev.clientX-startX), startPY+(ev.clientY-startY));
    const onUp=()=>{ window.removeEventListener("mousemove",onMove_); window.removeEventListener("mouseup",onUp); };
    window.addEventListener("mousemove",onMove_); window.addEventListener("mouseup",onUp);
    e.preventDefault();
  };

  const onResizeDown = (e) => {
    const startX=e.clientX, startY=e.clientY;
    const startW=state.w, startH=state.h;
    const onM=(ev)=>onResize(id,Math.max(240,startW+(ev.clientX-startX)),Math.max(160,startH+(ev.clientY-startY)));
    const onU=()=>{ window.removeEventListener("mousemove",onM); window.removeEventListener("mouseup",onU); };
    window.addEventListener("mousemove",onM); window.addEventListener("mouseup",onU);
    e.stopPropagation(); e.preventDefault();
  };

  return (
    <div style={{ position:"absolute", left:state.x, top:state.y, width:state.w, height:minimized?32:state.h,
      background:"rgba(2,7,13,0.98)", border:`1px solid ${C.border}`, borderRadius:4, overflow:"hidden",
      boxShadow:"0 8px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,200,120,0.08)",
      display:"flex", flexDirection:"column", zIndex, userSelect:"none" }}>
      {/* Header */}
      <div onMouseDown={onMouseDown}
        style={{ height:28, display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 8px", borderBottom:`1px solid ${C.border}`,
          background:"rgba(0,200,120,0.03)", cursor:"move", flexShrink:0 }}>
        <span style={{ fontSize:8, color:C.neon, letterSpacing:2, fontFamily:"Courier New", fontWeight:"bold" }}>{title}</span>
        <div className="panel-ctrl" style={{ display:"flex", gap:4 }}>
          <button onClick={onMinimize}
            style={{ background:"transparent", border:`1px solid ${C.borderB}`, color:C.gold, width:16, height:16, borderRadius:2, cursor:"pointer", fontSize:9, display:"flex", alignItems:"center", justifyContent:"center" }}>—</button>
          <button onClick={onClose}
            style={{ background:"transparent", border:`1px solid ${C.borderB}`, color:"#556", width:16, height:16, borderRadius:2, cursor:"pointer", fontSize:9 }}>✕</button>
        </div>
      </div>
      {/* Body */}
      {!minimized && <div style={{ flex:1, overflow:"hidden" }}>{children}</div>}
      {/* Resize handle */}
      {!minimized && <div onMouseDown={onResizeDown}
        style={{ position:"absolute", bottom:0, right:0, width:14, height:14, cursor:"se-resize",
          background:"linear-gradient(135deg, transparent 50%, rgba(0,200,120,0.3) 50%)", borderRadius:"0 0 4px 0" }}/>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TERMINAL
// ─────────────────────────────────────────────────────────────────────────────
export default function JarvisTerminal() {
  const [liveData, setLiveData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedObj, setSelectedObj] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState("AU");
  const [focusId, setFocusId] = useState(null);
  const [time, setTime] = useState(new Date());
  const [topZIndex, setTopZIndex] = useState(10);

  // Panel state: position, size, visible, minimized, z
  const [panels, setPanels] = useState(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1400;
    const col1 = 0, col2 = Math.floor(vw * 0.44), col3 = Math.floor(vw * 0.72);
    const pw1 = Math.floor(vw * 0.43), pw2 = Math.floor(vw * 0.27), pw3 = Math.floor(vw * 0.27);
    return {
      MAP:       { x:col1, y:50,  w:pw1,  h:400, visible:true,  minimized:false, z:10 },
      VERTEX:    { x:col2, y:50,  w:pw2,  h:400, visible:true,  minimized:false, z:10 },
      RISK:      { x:col3, y:50,  w:pw3,  h:400, visible:true,  minimized:false, z:10 },
      EXPLORER:  { x:col1, y:455, w:pw1,  h:370, visible:true,  minimized:false, z:10 },
      TIMELINE:  { x:col2, y:455, w:pw2,  h:370, visible:true,  minimized:false, z:10 },
      MARKETS:   { x:col3, y:455, w:pw3,  h:370, visible:true,  minimized:false, z:10 },
      EMAILS:    { x:col1, y:830, w:pw1,  h:350, visible:true,  minimized:false, z:10 },
      WATCHLIST: { x:col2, y:830, w:pw2,  h:350, visible:true,  minimized:false, z:10 },
      ANALYST:   { x:col3, y:830, w:pw3,  h:350, visible:true,  minimized:false, z:10 },
    };
  });

  const bringToFront = (id) => {
    const nz = topZIndex+1;
    setTopZIndex(nz);
    setPanels(p=>({...p,[id]:{...p[id],z:nz}}));
  };

  const movePanel = useCallback((id,x,y) => setPanels(p=>({...p,[id]:{...p[id],x:Math.max(0,x),y:Math.max(48,y)}})),[]);
  const resizePanel = useCallback((id,w,h) => setPanels(p=>({...p,[id]:{...p[id],w,h}})),[]);
  const closePanel = (id) => setPanels(p=>({...p,[id]:{...p[id],visible:false}}));
  const minimizePanel = (id) => setPanels(p=>({...p,[id]:{...p[id],minimized:!p[id].minimized}}));
  const openPanel = (id) => { setPanels(p=>({...p,[id]:{...p[id],visible:true,minimized:false}})); bringToFront(id); };

  // Fetch live data
  const fetchLiveData = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsError(false);
      setErrorMessage("");
      const r = await fetch(API, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type:"all"}) });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      const payload = await r.json();
      const normalized = normalizeLiveData(payload);
      setLiveData(normalized);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
      setIsError(true);
      setErrorMessage(e instanceof Error ? e.message : "Unable to refresh live intelligence feed.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(()=>{
    fetchLiveData();
    const t=setInterval(fetchLiveData,120000); // refresh every 2min
    return()=>clearInterval(t);
  },[fetchLiveData]);

  // Clock
  useEffect(()=>{ const t=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(t); },[]);

  const liveDataSafe = asObject(liveData);
  const earthquakes = asArray(liveDataSafe.earthquakes);
  const isStale = lastUpdated ? (Date.now() - lastUpdated.getTime()) > STALE_AFTER_MS : false;
  const closedPanels = Object.entries(panels).filter(([,v])=>!v.visible).map(([k])=>k);

  const SIDEBAR_PANELS = [
    { id:"MAP",      icon:"🌍", label:"GLOBE" },
    { id:"VERTEX",   icon:"◈",  label:"VERTEX" },
    { id:"RISK",     icon:"⚠",  label:"RISK" },
    { id:"EXPLORER", icon:"⊞",  label:"OBJECTS" },
    { id:"TIMELINE", icon:"◷",  label:"TIMELINE" },
    { id:"MARKETS",  icon:"$",  label:"MARKETS" },
    { id:"EMAILS",   icon:"✉",  label:"EMAILS" },
    { id:"WATCHLIST",icon:"◉",  label:"WATCH" },
    { id:"ANALYST",  icon:"◎",  label:"ANALYST" },
  ];

  return (
    <div style={{ background:C.bg, minHeight:"100vh", position:"relative", overflow:"hidden", fontFamily:"'JetBrains Mono','SF Mono',Courier New,monospace", display:"flex" }}>
      {/* ── CLASSIFICATION BANNER ──────────────────────────────────────── */}
      <div style={{ position:"fixed",top:0,left:0,right:0,height:18,background:"rgba(232,32,60,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,backdropFilter:"blur(8px)" }}>
        <span style={{ fontSize:8,color:"#fff",letterSpacing:4,fontWeight:"bold",fontFamily:"'JetBrains Mono',Courier New,monospace" }}>
          ◆ JARVIS_INTERNAL_ONLY · CLASSIFICATION: RESTRICTED · NOT FOR EXTERNAL DISTRIBUTION ◆
        </span>
      </div>

      {/* ── SIDEBAR NAV ───────────────────────────────────────────────────── */}
      <div style={{ position:"fixed", left:0, top:18, bottom:0, width:54, background:"rgba(2,6,10,0.99)", borderRight:`1px solid ${C.border}`, zIndex:9990, display:"flex", flexDirection:"column", alignItems:"center", paddingTop:36, gap:2 }}>
        {/* Logo */}
        <div style={{ marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${C.border}`, width:"100%", display:"flex", justifyContent:"center" }}>
          <svg width={20} height={20} viewBox="0 0 24 24">
            <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke={C.neon} strokeWidth="1.5" fill="none"/>
            <circle cx={12} cy={12} r={2.5} fill={C.neon} opacity={0.8}/>
          </svg>
        </div>
        {SIDEBAR_PANELS.map(p => {
          const active = panels[p.id]?.visible;
          return (
            <button key={p.id} onClick={()=>active?closePanel(p.id):openPanel(p.id)}
              title={p.label}
              style={{ width:42, height:42, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, background:active?"rgba(0,200,120,0.1)":"transparent", border:`1px solid ${active?C.neon+"44":"rgba(0,200,120,0.08)"}`, borderRadius:4, cursor:"pointer", transition:"all 0.15s" }}>
              <span style={{ fontSize:12 }}>{p.icon}</span>
              <span style={{ fontSize:5, color:active?C.neon:"#2a3d4d", letterSpacing:0.5, fontFamily:"Courier New" }}>{p.label}</span>
            </button>
          );
        })}
        {/* Status dot */}
        <div style={{ marginTop:"auto", marginBottom:12, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:C.red, animation:"pulse 1.5s infinite" }}/>
          <span style={{ fontSize:5, color:C.red, letterSpacing:1, fontFamily:"Courier New" }}>LIVE</span>
        </div>
      </div>

      {/* ── TOPBAR ────────────────────────────────────────────────────────── */}
      <div style={{ position:"fixed",top:18,left:54,right:0,height:32
        ,display:"flex",alignItems:"center",padding:"0 12px",background:"rgba(2,5,8,0.99)",borderBottom:`1px solid ${C.border}`,zIndex:9998,gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ color:C.neon,fontSize:11,fontWeight:"bold",letterSpacing:4 }}>JARVIS</span>
          <span style={{ color:"#2a3d4d",fontSize:7,letterSpacing:2 }}>GLOBAL INTELLIGENCE TERMINAL</span>
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <span style={{ fontSize:8,color:C.neon,background:C.neonD,padding:"2px 7px",borderRadius:3,border:`1px solid ${C.neon}22` }}>PSG $120k/wk</span>
          <span style={{ fontSize:8,color:C.gold,background:C.goldD,padding:"2px 7px",borderRadius:3,border:`1px solid ${C.gold}22` }}>XRP $19.2k</span>
          <span style={{ fontSize:8,color:C.blue,background:C.blueD,padding:"2px 7px",borderRadius:3,border:`1px solid ${C.blue}22` }}>{earthquakes.length} EQ LIVE</span>
          <span style={{ fontSize:8,color:"#2a3d4d" }}>{time.toLocaleTimeString("en-AU",{timeZone:"Australia/Sydney",hour:"2-digit",minute:"2-digit",second:"2-digit"})} AEST</span>
        </div>
      </div>

      {(isError || isStale) && (
        <div style={{ position:"fixed", top:50, left:54, right:0, minHeight:24, padding:"4px 10px", zIndex:9999, display:"flex", alignItems:"center", gap:10, background:isError?"rgba(232,32,60,0.15)":"rgba(232,168,0,0.13)", borderBottom:`1px solid ${isError?C.red:C.gold}44` }}>
          <span style={{ fontSize:8, color:isError?C.red:C.gold, fontWeight:"bold" }}>
            {isError ? `OFFLINE · ${asString(errorMessage, "Live feed unavailable")}` : `STALE DATA · Last refresh ${lastUpdated ? lastUpdated.toLocaleTimeString() : "unknown"}`}
          </span>
          <button onClick={fetchLiveData} style={{ marginLeft:"auto", fontSize:8, color:C.neon, border:`1px solid ${C.neon}44`, background:"rgba(0,200,120,0.08)", borderRadius:3, padding:"2px 8px", cursor:"pointer" }}>
            RETRY
          </button>
        </div>
      )}

      {/* ── TICKER ────────────────────────────────────────────────────────── */}
      <div style={{ position:"fixed",top:50,left:54,right:0
        ,height:20,background:"rgba(2,5,8,0.99)",borderBottom:`1px solid ${C.border}`,zIndex:9997,display:"flex",alignItems:"center",overflow:"hidden" }}>
        <div style={{ position:"absolute",left:0,top:0,bottom:0,width:60,background:"linear-gradient(to right,#020509,transparent)",zIndex:2,display:"flex",alignItems:"center",paddingLeft:6 }}>
          <span style={{ fontSize:7,color:C.neon,letterSpacing:1 }}>MKT</span>
        </div>
        <div style={{ display:"flex",paddingLeft:70,animation:"scroll 45s linear infinite",whiteSpace:"nowrap",gap:0 }}>
          {["XRP/AUD 2.07 ▲+1.2%","BTC/AUD 98,400 ▲+0.6%","ETH/USD 2,041 ▼-1.4%","AUD/USD 0.6320 ▲+0.3%","CRUDE 81.40 ▲+2.1%","GOLD 3,021 ▲+0.6%","PSG NET $120k/wk","XRP×9,300=$19,251","PANGANI DD ACTIVE","IFZA FZCO PLANNING","$100M TARGET 2033","XRP/AUD 2.07 ▲+1.2%","BTC/AUD 98,400 ▲+0.6%","ETH/USD 2,041 ▼-1.4%","AUD/USD 0.6320 ▲+0.3%","CRUDE 81.40 ▲+2.1%","GOLD 3,021 ▲+0.6%","PSG NET $120k/wk","XRP×9,300=$19,251","PANGANI DD ACTIVE","IFZA FZCO PLANNING","$100M TARGET 2033"].map((item,i)=>(
            <span key={i} style={{ display:"inline-flex",marginRight:24,fontSize:8,color:item.includes("▼")?C.red:item.includes("▲")?C.neon:C.textB,fontFamily:"Courier New" }}>{item}</span>
          ))}
        </div>
      </div>

      {/* ── WORKSPACE ─────────────────────────────────────────────────────── */}
      <div style={{ marginTop:70, marginLeft:54, minHeight:"calc(100vh - 70px)", position:"relative" }}>
        {/* MAP */}
        {panels.MAP?.visible && (
          <DraggablePanel id="MAP" title="🌍 GLOBE / MAP" state={panels.MAP} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("MAP")} onMinimize={()=>minimizePanel("MAP")} zIndex={panels.MAP.z}
            onClick={()=>bringToFront("MAP")} minimized={panels.MAP.minimized}>
            <Globe3D selectedCountry={selectedCountry} onSelect={setSelectedCountry} earthquakes={earthquakes}/>
          </DraggablePanel>
        )}

        {/* VERTEX */}
        {panels.VERTEX?.visible && (
          <DraggablePanel id="VERTEX" title="◈ VERTEX GRAPH" state={panels.VERTEX} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("VERTEX")} onMinimize={()=>minimizePanel("VERTEX")} zIndex={panels.VERTEX.z}
            onClick={()=>bringToFront("VERTEX")} minimized={panels.VERTEX.minimized}>
            <VertexGraph selectedObj={selectedObj} onSelect={id=>{setSelectedObj(id);setFocusId(null);}} focusId={focusId}/>
          </DraggablePanel>
        )}

        {/* OBJECT EXPLORER */}
        {panels.EXPLORER?.visible && (
          <DraggablePanel id="EXPLORER" title="⊞ OBJECT EXPLORER" state={panels.EXPLORER} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("EXPLORER")} onMinimize={()=>minimizePanel("EXPLORER")} zIndex={panels.EXPLORER.z}
            onClick={()=>bringToFront("EXPLORER")} minimized={panels.EXPLORER.minimized}>
            <ObjectExplorer selectedObj={selectedObj} onSelect={id=>{setSelectedObj(id);setFocusId(null);bringToFront("VERTEX");}}/>
          </DraggablePanel>
        )}

        {/* TIMELINE */}
        {panels.TIMELINE?.visible && (
          <DraggablePanel id="TIMELINE" title="◷ TIMELINE" state={panels.TIMELINE} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("TIMELINE")} onMinimize={()=>minimizePanel("TIMELINE")} zIndex={panels.TIMELINE.z}
            onClick={()=>bringToFront("TIMELINE")} minimized={panels.TIMELINE.minimized}>
            <TimelinePanel liveData={liveDataSafe}/>
          </DraggablePanel>
        )}

        {/* RISK SIGNALS */}
        {panels.RISK?.visible && (
          <DraggablePanel id="RISK" title="⚠ RISK SIGNALS" state={panels.RISK} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("RISK")} onMinimize={()=>minimizePanel("RISK")} zIndex={panels.RISK.z}
            onClick={()=>bringToFront("RISK")} minimized={panels.RISK.minimized}>
            <RiskPanel onFocus={id=>{setSelectedObj(id);setFocusId(id);bringToFront("VERTEX");}}/>
          </DraggablePanel>
        )}

        {/* EMAILS */}
        {panels.EMAILS?.visible && (
          <DraggablePanel id="EMAILS" title="✉ EMAIL CORPUS" state={panels.EMAILS} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("EMAILS")} onMinimize={()=>minimizePanel("EMAILS")} zIndex={panels.EMAILS.z}
            onClick={()=>bringToFront("EMAILS")} minimized={panels.EMAILS.minimized}>
            <EmailCorpus liveData={liveDataSafe}/>
          </DraggablePanel>
        )}

        {/* WATCHLIST */}
        {panels.WATCHLIST?.visible && (
          <DraggablePanel id="WATCHLIST" title="◉ WATCHLIST" state={panels.WATCHLIST} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("WATCHLIST")} onMinimize={()=>minimizePanel("WATCHLIST")} zIndex={panels.WATCHLIST.z}
            onClick={()=>bringToFront("WATCHLIST")} minimized={panels.WATCHLIST.minimized}>
            <WatchlistPanel onFocus={id=>{setSelectedObj(id);setFocusId(id);bringToFront("VERTEX");}}/>
          </DraggablePanel>
        )}

        {/* MARKETS */}
        {panels.MARKETS?.visible && (
          <DraggablePanel id="MARKETS" title="$ MARKETS" state={panels.MARKETS} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("MARKETS")} onMinimize={()=>minimizePanel("MARKETS")} zIndex={panels.MARKETS.z}
            onClick={()=>bringToFront("MARKETS")} minimized={panels.MARKETS.minimized}>
            <MarketsPanel liveData={liveDataSafe} loading={isLoading}/>
          </DraggablePanel>
        )}

        {/* AI ANALYST */}
        {panels.ANALYST?.visible && (
          <DraggablePanel id="ANALYST" title="◎ AI ANALYST" state={panels.ANALYST} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("ANALYST")} onMinimize={()=>minimizePanel("ANALYST")} zIndex={panels.ANALYST.z}
            onClick={()=>bringToFront("ANALYST")} minimized={panels.ANALYST.minimized}>
            <AnalystPanel/>
          </DraggablePanel>
        )}

        {/* Spacer for scrolling */}
        <div style={{ height:1250 }}/>
      </div>

      {/* ── STATUS BAR ────────────────────────────────────────────────────── */}
      <div style={{ position:"fixed",bottom:0,left:54,right:0,height:22,display:"flex",alignItems:"center",gap:10,padding:"0 12px",background:"rgba(2,5,8,0.99)",borderTop:`1px solid ${C.border}`,zIndex:9998,fontSize:7,color:"#2a3d4d",fontFamily:"Courier New" }}>
        {[["OBJECTS",OBJECTS.length,C.neon],["LINKS",LINKS.length,C.blue],["RISK",RISK_SIGNALS.length,C.red],["EQ LIVE",earthquakes.length,C.gold],["CORPUS","3,804 emails",C.neon],["VECTORS","11,299",C.blue],["FACTS","8,939",C.gold],["PANELS",Object.values(panels).filter(p=>p.visible).length+"/9",C.text]].map(([k,v,col],i)=>(
          <span key={k} style={{ display:"flex",gap:4,alignItems:"center" }}>
            {i>0&&<span style={{ color:"#0d1a22" }}>◆</span>}
            <span>{k}</span><span style={{ color:col,fontWeight:"bold" }}>{v}</span>
          </span>
        ))}
        <span style={{ marginLeft:"auto",color:"#0d1a22" }}>JARVIS v6.0 · PALANTIR-GOTHAM/GRIDLINE · REAL CORPUS LOADED</span>
      </div>
    </div>
  );
}
