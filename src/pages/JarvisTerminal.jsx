import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Globe3D from "../components/Globe3D";
import LiveTactical3D from "../components/LiveTactical3D";
import DraggablePanel from "../components/DraggablePanel";
import { COLORS as C } from "@/domain/colors";
import { OBJECTS, LINKS } from "@/domain/ontology";
import { COUNTRIES } from "@/domain/countries";
import { RISK_SIGNALS } from "@/domain/risk";
import { WATCHLIST_INIT } from "@/domain/watchlist";
import { MARKETS_FALLBACK } from "@/domain/markets";
import { appParams } from "@/lib/app-params";
import { PANELS as PANEL_REGISTRY, buildDefaultPanelState } from "@/panels/registry";
import { agentChat } from "@/lib/jarvisApi";
import IronManChat from "@/components/IronManChat/IronManChat";

const API = `${appParams.apiBaseUrl}/functions/getLiveIntel`;

const ROW_GRID_TEMPLATE = "1fr 80px 70px 55px 45px";
const ROW_DOT_STYLE = { width:6, height:6, borderRadius:"50%", flexShrink:0 };
const ROW_CONF_BAR_STYLE = { flex:1, height:3, background:"rgba(0,200,120,0.1)", borderRadius:2, overflow:"hidden" };

// ── SECURITY MARKINGS ─────────────────────────────────────────────────────────
const MARK = ({ label, color }) => (
  <span style={{ fontSize:7, padding:"1px 5px", borderRadius:2, background:color+"18", color, border:`1px solid ${color}33`, letterSpacing:1, fontWeight:"bold", flexShrink:0 }}>
    {label}
  </span>
);

// ── GLASS PANEL ──────────────────────────────────────────────────────────────
const UnusedGlass = ({ children, style, onClick }) => (
  <div onClick={onClick} style={{ background:"rgba(4,10,16,0.98)", border:`1px solid ${C.border}`, borderRadius:4, boxShadow:"0 4px 24px rgba(0,0,0,0.7)", ...style }}>{children}</div>
);

// ─────────────────────────────────────────────────────────────────────────────
// PANEL SYSTEM — Gridline-style window manager
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// VERTEX GRAPH
// ─────────────────────────────────────────────────────────────────────────────
function VertexGraph({ selectedObj, onSelect, focusId, isActive = true }) {
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

  const nodeById = useMemo(() => new Map(nodesRef.current.map((n) => [n.id, n])), []);
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
          const a=nodeById.get(lnk.a), b=nodeById.get(lnk.b);
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
        const a=nodeById.get(lnk.a), b=nodeById.get(lnk.b);
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

    const start = () => {
      if (rafRef.current || !isActive || document.visibilityState !== "visible") return;
      rafRef.current = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (!rafRef.current) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [hov, selectedObj, visibleIds, nodeById, isActive]);

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
function UnusedGlobeMap({ selectedCountry, onSelect, earthquakes }) {
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
  const linkCounts = useMemo(() => {
    const counts = new Map();
    LINKS.forEach((l) => {
      counts.set(l.a, (counts.get(l.a) || 0) + 1);
      counts.set(l.b, (counts.get(l.b) || 0) + 1);
    });
    return counts;
  }, []);

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
        <div style={{ display:"grid",gridTemplateColumns:ROW_GRID_TEMPLATE,gap:4,padding:"4px 8px",borderBottom:`1px solid ${C.border}`,fontSize:7,color:"#2a3d4d",position:"sticky",top:0,background:C.bg }}>
          <span>OBJECT</span><span>TYPE</span><span>MARKING</span><span>CONF</span><span>LINKS</span>
        </div>
        {filtered.map(obj=>{
          const col=C.type[obj.type]||C.neon;
          const markCol=C.mark[obj.mark]||C.text;
          const linkCount=linkCounts.get(obj.id) || 0;
          const isExp=expandedObj===obj.id;
          const isSel=selectedObj===obj.id;
          return (
            <div key={obj.id}
              style={{ borderBottom:`1px solid rgba(0,200,120,0.04)`,background:isSel?C.neonD:"transparent" }}>
              <div style={{ display:"grid",gridTemplateColumns:ROW_GRID_TEMPLATE,gap:4,padding:"5px 8px",cursor:"pointer",alignItems:"center" }}
                onClick={()=>{ setExpandedObj(isExp?null:obj.id); onSelect(obj.id); }}>
                <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                  <div style={{ ...ROW_DOT_STYLE, background:col, boxShadow:`0 0 4px ${col}` }}/>
                  <span style={{ fontSize:9,color:isSel?col:C.textB,fontWeight:isSel?"bold":"normal" }}>{obj.label}</span>
                </div>
                <span style={{ fontSize:7,padding:"1px 5px",borderRadius:2,background:col+"18",color:col,border:`1px solid ${col}33` }}>{obj.type}</span>
                <span style={{ fontSize:7,padding:"1px 4px",borderRadius:2,background:markCol+"18",color:markCol }}>{obj.mark}</span>
                <div style={{ display:"flex",alignItems:"center",gap:3 }}>
                  <div style={ROW_CONF_BAR_STYLE}>
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
        <span>JARVIS TIMELINE · {events.length} corpus events</span>
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
  const totals = corpus.totals || {};
  const totalEmails = totals.emails ?? Object.values(tabs).reduce((n,t)=>n+t.data.length,0);

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
        <span style={{ fontSize:7,color:"#2a3d4d",marginLeft:"auto",display:"flex",alignItems:"center" }}>{totalEmails} emails · {totals.timeline ?? 0} events · {facts?.total ?? 0} facts</span>
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
function MarketsPanel({ liveData, loading: _loading }) {
  const markets = Array.isArray(liveData?.markets) && liveData.markets.length > 0 ? liveData.markets : null;
  const displayData = markets || MARKETS_FALLBACK;
  const xrpQ = (markets || []).find(m => (m.display||"").includes("XRP"));
  const xrpHeldStr = xrpQ
    ? `$${(parseFloat(String(xrpQ.price).replace(/,/g,"")) * 9300).toLocaleString("en-AU",{maximumFractionDigits:0})} AUD`
    : "$19,251 AUD";

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",fontFamily:"Courier New" }}>
      <div style={{ padding:"4px 8px",fontSize:7,color:"#2a3d4d",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between" }}>
        <span>LIVE MARKET DATA</span>
        <span style={{ color:markets?C.neon:C.gold }}>{markets?"● LIVE (CoinGecko + FX)":"● FALLBACK"}</span>
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
          {[["XRP 9,300 units",xrpHeldStr,C.neon],["PSG Net/wk","$120,000",C.neon],["PSG Annual Net","~$6.24M",C.neon],["Pangani Ask","$175k USD",C.gold],["Golf Acres","AED TBC",C.blue],["$100M Target","2033–2035",C.red]].map(([k,v,col])=>(
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
function UnusedAnalystPanel() {
  const [msgs, setMsgs] = useState([
    { r:"sys", t:"JARVIS AGENT — TOOL-CALLING (search · ontology · science), governed + audited" },
    { r:"sys", t:`Ontology: ${OBJECTS.length} objects · ${LINKS.length} links · ${RISK_SIGNALS.length} risk signals\nAsk anything — I plan, call real tools, and answer from grounded data. Writes become approval proposals.` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  const send = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setMsgs((m) => [...m, { r: "user", t: q }]);
    setInput("");
    setLoading(true);

    // Append an empty assistant message that the agent result fills in.
    let assistantIdx;
    setMsgs((m) => {
      assistantIdx = m.length;
      return [...m, { r: "jarvis", t: "" }];
    });

    try {
      // Real planner/executor turn: LLM plans → governed tool dispatch (search /
      // ontology / science) → step memory → synthesised, grounded answer.
      const history = msgs.map((m) => ({ role: m.r === "user" ? "sam" : "jarvis", text: m.t }));
      const res = await agentChat(q, { history });
      const tools = res.used_tools || [];
      const trace = tools.length
        ? `\n\n— ${(res.backend || "grounded").toUpperCase()} · ${res.steps || tools.length} step(s) · tools: ${tools.join(", ")}`
        : "";
      setMsgs((m) => {
        const next = [...m];
        next[assistantIdx] = { r: "jarvis", t: (res.answer || "No result.") + trace };
        return next;
      });
    } catch (err) {
      setMsgs((m) => {
        const next = [...m];
        next[assistantIdx] = { r: "sys", t: `// Agent offline: ${err.message}. Start the backend (uvicorn server.main:app --reload) and configure VITE_API_BASE_URL.` };
        return next;
      });
    } finally {
      setLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
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

function UnusedStreamStatusPanel({ title, streamUrlEnv, channels = [] }) {
  const [lastTick, setLastTick] = useState(null);
  const [events, setEvents] = useState(0);
  const [connected, setConnected] = useState(false);
  const streamUrl = import.meta.env[streamUrlEnv];

  useEffect(() => {
    if (!streamUrl) return;
    const es = new EventSource(streamUrl);
    es.onopen = () => setConnected(true);
    es.onmessage = () => {
      setEvents((v) => v + 1);
      setLastTick(new Date());
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [streamUrl]);

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",fontFamily:"Courier New",padding:10,gap:8 }}>
      <div style={{ fontSize:9,color:C.textB }}>{title}</div>
      <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
        <span style={{ fontSize:7,padding:"2px 6px",border:`1px solid ${C.border}`,borderRadius:3,color:connected?C.neon:C.red }}>
          {connected ? "STREAM CONNECTED" : "STREAM OFFLINE"}
        </span>
        <span style={{ fontSize:7,padding:"2px 6px",border:`1px solid ${C.border}`,borderRadius:3,color:C.gold }}>
          EVENTS: {events}
        </span>
      </div>
      <div style={{ fontSize:8,color:C.text }}>
        Endpoint: {streamUrl || `${streamUrlEnv} not set`}
      </div>
      <div style={{ fontSize:8,color:C.text }}>
        Last tick: {lastTick ? lastTick.toISOString() : "No live events yet"}
      </div>
      <div style={{ marginTop:6,fontSize:8,color:C.textB }}>Channels</div>
      <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
        {channels.map((ch) => (
          <span key={ch} style={{ fontSize:7,padding:"1px 6px",border:`1px solid ${C.borderB}`,borderRadius:3,color:C.blue }}>{ch}</span>
        ))}
      </div>
      {!streamUrl && (
        <div style={{ marginTop:6,fontSize:8,color:C.gold }}>
          Configure env and backend streams to enable live Panopticon/Counterstrike simulation rendering.
        </div>
      )}
    </div>
  );
}

function LiveGameRenderPanel({ title, streamUrlEnv, defaultStreamUrl, channels = [], defaultMaps = [], initialState }) {
  const [selectedMap, setSelectedMap] = useState(defaultMaps[0] || "default");
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState(0);
  const [stale, setStale] = useState(false);
  const [viewMode, setViewMode] = useState("3D");
  const [gameState, setGameState] = useState(initialState || { map: defaultMaps[0] || "default", units: [] });
  const canvasRef = useRef(null);
  // Prefer an explicit env override; otherwise stream from the bundled backend.
  const streamUrl = import.meta.env[streamUrlEnv] || defaultStreamUrl;
  const mapList = defaultMaps.length ? defaultMaps : ["de_dust2", "de_inferno", "de_mirage", "city_grid"];
  const mapBounds = {
    de_dust2: { minX: -2500, maxX: 2500, minY: -2000, maxY: 2000 },
    de_mirage: { minX: -3200, maxX: 2100, minY: -3300, maxY: 1600 },
    de_inferno: { minX: -2200, maxX: 2900, minY: -2200, maxY: 2200 },
    de_nuke: { minX: -3450, maxX: 1800, minY: -3400, maxY: 1900 },
    city_grid: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
    industrial_zone: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
    dockyard: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
  };
  const normalizeFrame = (payload = {}) => {
    const rawUnits = payload.units || payload.players || payload.agents || payload.entities || [];
    const units = rawUnits.map((u, idx) => ({
      id: u.id || u.playerId || u.agentId || `u${idx}`,
      team: u.team || u.side || (u.faction === "counter" ? "CT" : undefined),
      worldX: u.worldX ?? u.posX ?? u.position?.x ?? u.x ?? 0,
      worldY: u.worldY ?? u.posY ?? u.position?.y ?? u.y ?? 0,
      hp: u.hp ?? u.health ?? null,
    }));
    return {
      map: payload.map || payload.mapName || payload.level || selectedMap,
      tick: payload.tick ?? payload.frame ?? payload.roundTick ?? null,
      round: payload.round ?? payload.roundNumber ?? null,
      bounds: payload.bounds || null,
      units,
    };
  };

  useEffect(() => {
    setGameState((s) => ({ ...s, ...normalizeFrame(initialState || {}) }));
  }, [initialState]);

  useEffect(() => {
    if (!streamUrl) return;
    let es;
    let reconnectTimer;
    let staleTimer;
    let tries = 0;

    const connect = () => {
      es = new EventSource(streamUrl);
      es.onopen = () => {
        tries = 0;
        setConnected(true);
        setStale(false);
      };
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const frame = normalizeFrame(data);
          setEvents((v) => v + 1);
          if (frame?.map) setSelectedMap(frame.map);
          setGameState(frame);
          setStale(false);
          clearTimeout(staleTimer);
          staleTimer = setTimeout(() => setStale(true), 15000);
        } catch {
          // ignore malformed events
        }
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        clearTimeout(reconnectTimer);
        const delay = Math.min(10000, 1000 * (2 ** Math.min(tries, 4)));
        reconnectTimer = setTimeout(connect, delay);
        tries += 1;
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      clearTimeout(staleTimer);
      es?.close();
    };
  }, [streamUrl]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width, h = c.height;
    ctx.fillStyle = "#060b11";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(0,200,120,0.12)";
    for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = "rgba(0,200,120,0.35)";
    ctx.font = "10px Courier New";
    ctx.fillText(`MAP: ${selectedMap}`, 8, 14);
    ctx.fillStyle = "rgba(150,180,200,0.8)";
    ctx.fillText(`ROUND: ${gameState?.round ?? "-"}`, 180, 14);
    ctx.fillText(`TICK: ${gameState?.tick ?? "-"}`, 280, 14);
    const units = gameState?.units || [];
    const bounds = mapBounds[selectedMap] || mapBounds.city_grid;
    const toCanvas = (u) => {
      const ux = u.worldX ?? u.posX ?? u.x ?? 0;
      const uy = u.worldY ?? u.posY ?? u.y ?? 0;
      const nx = (ux - bounds.minX) / Math.max(1, (bounds.maxX - bounds.minX));
      const ny = (uy - bounds.minY) / Math.max(1, (bounds.maxY - bounds.minY));
      return {
        x: Math.max(6, Math.min(w - 6, Math.round(nx * w))),
        y: Math.max(20, Math.min(h - 6, Math.round((1 - ny) * h))),
      };
    };

    ctx.strokeStyle = "rgba(0,150,212,0.22)";
    ctx.strokeRect(8, 20, w - 16, h - 28);
    ctx.fillStyle = "rgba(0,150,212,0.26)";
    ctx.fillRect(w * 0.5 - 1, 20, 2, h - 28);
    ctx.fillRect(8, h * 0.5, w - 16, 1);

    units.forEach((u, i) => {
      const { x, y } = toCanvas(u);
      const col = u.team === "T" ? "#f07820" : u.team === "CT" ? "#0096d4" : "#00c878";
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(200,220,230,0.85)";
      ctx.fillText(u.id || u.name || `u${i}`, x + 6, y + 3);
    });
  }, [gameState, selectedMap]);

  return (
    <div style={{ height:"100%",display:"flex",flexDirection:"column",fontFamily:"Courier New",padding:8,gap:6 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <span style={{ fontSize:9,color:C.textB }}>{title}</span>
        <span style={{ fontSize:7,color:connected?(stale?C.gold:C.neon):C.red }}>
          {connected?(stale?"STALE":"LIVE"):"OFFLINE"} · EVT {events}
        </span>
      </div>
      <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap" }}>
        <span style={{ fontSize:7,color:C.text }}>MAP</span>
        <select value={selectedMap} onChange={(e)=>setSelectedMap(e.target.value)}
          style={{ background:"rgba(0,0,0,0.5)",border:`1px solid ${C.border}`,color:C.textB,fontFamily:"Courier New",fontSize:8,padding:"2px 6px",borderRadius:3 }}>
          {mapList.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={()=>setViewMode(v=>v==="3D"?"2D":"3D")} style={{ background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,color:C.neon,fontSize:7,padding:"2px 6px",borderRadius:3,cursor:"pointer" }}>
          {viewMode} VIEW
        </button>
        {channels.map((ch)=><span key={ch} style={{ fontSize:6,color:C.blue }}>{ch}</span>)}
      </div>
      {viewMode==="3D" ? (
        <div style={{ width:"100%",height:"100%",border:`1px solid ${C.border}`,borderRadius:4,overflow:"hidden" }}>
          <LiveTactical3D
            gameKey={title.toLowerCase().includes("counterstrike") ? "counterstrike" : "panopticon"}
            mapName={selectedMap}
            mapModelUrl={gameState?.mapModelUrl || gameState?.mapModel?.url}
            units={gameState?.units || []}
            bounds={gameState?.bounds || null}
            manifest={gameState?.assets || gameState?.manifest || {}}
          />
        </div>
      ) : (
        <canvas ref={canvasRef} width={520} height={180} style={{ width:"100%",height:"100%",border:`1px solid ${C.border}`,borderRadius:4 }} />
      )}
      {!streamUrl && <div style={{ fontSize:8,color:C.gold }}>{streamUrlEnv} not set. Rendering simulated frame from available state.</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TERMINAL
// ─────────────────────────────────────────────────────────────────────────────
export default function JarvisTerminal() {
  const [liveData, setLiveData] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedObj, setSelectedObj] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState("AU");
  const [focusId, setFocusId] = useState(null);
  const [time, setTime] = useState(new Date());
  const [topZIndex, setTopZIndex] = useState(10);

  // Panel state: position, size, visible, minimized, z
  const [panels, setPanels] = useState(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1400;
    return buildDefaultPanelState(vw);
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
  const refreshIntel = useCallback(async () => {
    try {
      setLoadingData(true);
      const headers = { "Content-Type":"application/json" };
      if (appParams.apiKey) headers["Authorization"] = `Bearer ${appParams.apiKey}`;
      const r = await fetch(API, { method:"POST", headers, body:JSON.stringify({type:"all"}) });
      if (r.ok) setLiveData(await r.json());
    } catch(e) { console.error(e); }
    finally { setLoadingData(false); }
  }, []);
  useEffect(()=>{
    refreshIntel();
    const t=setInterval(refreshIntel,120000); // refresh every 2min
    return()=>clearInterval(t);
  },[refreshIntel]);


  // Clock
  useEffect(()=>{ const t=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(t); },[]);

  const earthquakes = liveData?.earthquakes || [];
  const corpusTotals = liveData?.corpus?.totals || {};
  const liveMarkets = Array.isArray(liveData?.markets) ? liveData.markets : [];
  const xrpQuote = liveMarkets.find(m => (m.display||"").includes("XRP"));
  const xrpHeld = xrpQuote ? `$${(parseFloat(String(xrpQuote.price).replace(/,/g,"")) * 9300).toLocaleString("en-AU",{maximumFractionDigits:0})}` : "$19.2k";
  // Live ticker: real market quotes + standing portfolio facts (no fabricated prices).
  const marketTicker = liveMarkets.map(m => {
    const ch = Number(m.change_pct) || 0;
    const arrow = ch > 0 ? "▲" : ch < 0 ? "▼" : "·";
    return `${m.display} ${m.price} ${arrow}${ch>=0?"+":""}${ch.toFixed(2)}%`;
  });
  const factTicker = ["PSG NET $120k/wk", `XRP×9,300=${xrpHeld}`, "PANGANI DD ACTIVE", "IFZA FZCO PLANNING", "$100M TARGET 2033", `${earthquakes.length} USGS QUAKES LIVE`];
  const tickerBase = marketTicker.length ? [...marketTicker, ...factTicker] : factTicker;
  const tickerItems = [...tickerBase, ...tickerBase];
  const SIDEBAR_PANELS = PANEL_REGISTRY;

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
          <span style={{ fontSize:8,color:C.gold,background:C.goldD,padding:"2px 7px",borderRadius:3,border:`1px solid ${C.gold}22` }}>XRP {xrpHeld}</span>
          <span style={{ fontSize:8,color:C.blue,background:C.blueD,padding:"2px 7px",borderRadius:3,border:`1px solid ${C.blue}22` }}>{earthquakes.length} EQ LIVE</span>
          <span style={{ fontSize:8,color:"#2a3d4d" }}>{time.toLocaleTimeString("en-AU",{timeZone:"Australia/Sydney",hour:"2-digit",minute:"2-digit",second:"2-digit"})} AEST</span>
        </div>
      </div>

      {/* ── TICKER ────────────────────────────────────────────────────────── */}
      <div style={{ position:"fixed",top:50,left:54,right:0
        ,height:20,background:"rgba(2,5,8,0.99)",borderBottom:`1px solid ${C.border}`,zIndex:9997,display:"flex",alignItems:"center",overflow:"hidden" }}>
        <div style={{ position:"absolute",left:0,top:0,bottom:0,width:60,background:"linear-gradient(to right,#020509,transparent)",zIndex:2,display:"flex",alignItems:"center",paddingLeft:6 }}>
          <span style={{ fontSize:7,color:C.neon,letterSpacing:1 }}>MKT</span>
        </div>
        <div style={{ display:"flex",paddingLeft:70,animation:"scroll 45s linear infinite",whiteSpace:"nowrap",gap:0 }}>
          {tickerItems.map((item,i)=>(
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
            <VertexGraph selectedObj={selectedObj} onSelect={id=>{setSelectedObj(id);setFocusId(null);}} focusId={focusId} isActive={!panels.VERTEX.minimized}/>
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
            <TimelinePanel liveData={liveData}/>
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
            <EmailCorpus liveData={liveData}/>
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
            <MarketsPanel liveData={liveData} loading={loadingData}/>
          </DraggablePanel>
        )}

        {/* IRON MAN CHAT — JARVIS 1:1 Replica */}
        {panels.ANALYST?.visible && (
          <DraggablePanel id="ANALYST" title="◉ J.A.R.V.I.S." state={panels.ANALYST} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("ANALYST")} onMinimize={()=>minimizePanel("ANALYST")} zIndex={panels.ANALYST.z}
            onClick={()=>bringToFront("ANALYST")} minimized={panels.ANALYST.minimized}>
            <IronManChat embedded />
          </DraggablePanel>
        )}

        {panels.PANOPTICON?.visible && (
          <DraggablePanel id="PANOPTICON" title="⌬ PANOPTICON LIVE" state={panels.PANOPTICON} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("PANOPTICON")} onMinimize={()=>minimizePanel("PANOPTICON")} zIndex={panels.PANOPTICON.z}
            onClick={()=>bringToFront("PANOPTICON")} minimized={panels.PANOPTICON.minimized}>
            <LiveGameRenderPanel title="Panopticon stream monitor" streamUrlEnv="VITE_PANOPTICON_STREAM_URL"
              defaultStreamUrl={`${appParams.apiBaseUrl}/streams/panopticon`}
              channels={["agents.position","agents.intent","panopticon.alerts","ml.training.progress"]}
              defaultMaps={liveData?.panopticon?.maps || ["city_grid","dockyard","industrial_zone"]}
              initialState={liveData?.panopticon}/>
          </DraggablePanel>
        )}

        {panels.CS3D?.visible && (
          <DraggablePanel id="CS3D" title="🎯 COUNTERSTRIKE 3D LIVE" state={panels.CS3D} onMove={movePanel} onResize={resizePanel}
            onClose={()=>closePanel("CS3D")} onMinimize={()=>minimizePanel("CS3D")} zIndex={panels.CS3D.z}
            onClick={()=>bringToFront("CS3D")} minimized={panels.CS3D.minimized}>
            <LiveGameRenderPanel title="Counterstrike 3D simulation stream" streamUrlEnv="VITE_COUNTERSTRIKE3D_STREAM_URL"
              defaultStreamUrl={`${appParams.apiBaseUrl}/streams/counterstrike`}
              channels={["sim.tick","players.state","round.events","ml.policy.actions"]}
              defaultMaps={liveData?.counterstrike?.maps || ["de_dust2","de_mirage","de_inferno","de_nuke"]}
              initialState={liveData?.counterstrike}/>
          </DraggablePanel>
        )}

        {/* Spacer for scrolling */}
        <div style={{ height:1250 }}/>
      </div>

      {/* ── STATUS BAR ────────────────────────────────────────────────────── */}
      <div style={{ position:"fixed",bottom:0,left:54,right:0,height:22,display:"flex",alignItems:"center",gap:10,padding:"0 12px",background:"rgba(2,5,8,0.99)",borderTop:`1px solid ${C.border}`,zIndex:9998,fontSize:7,color:"#2a3d4d",fontFamily:"Courier New" }}>
        {[["OBJECTS",OBJECTS.length,C.neon],["LINKS",LINKS.length,C.blue],["RISK",RISK_SIGNALS.length,C.red],["EQ LIVE",earthquakes.length,C.gold],["EMAILS",corpusTotals.emails ?? 0,C.neon],["EVENTS",corpusTotals.timeline ?? 0,C.blue],["FACTS",corpusTotals.facts ?? 0,C.gold],["PANELS",Object.values(panels).filter(p=>p.visible).length+"/11",C.text]].map(([k,v,col],i)=>(
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
