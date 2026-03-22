
import { useState, useEffect, useRef, useCallback } from "react";

const NEON = "#00ff9d";
const BG   = "#0a0a0a";
const CARD = "#111111";
const BORDER = "#1a2a1a";

// ── Signal types mirroring Gridline's intel feed pattern ──────────────────
const SIGNAL_TYPES = {
  PSG:        { color: "#00ff9d", label: "PSG" },
  FINANCE:    { color: "#ffd700", label: "FINANCE" },
  INVESTMENT: { color: "#00bfff", label: "INVEST" },
  TRAVEL:     { color: "#ff9900", label: "TRAVEL" },
  LEGAL:      { color: "#ff4444", label: "LEGAL" },
  MUSIC:      { color: "#cc44ff", label: "MUSIC" },
  PROPERTY:   { color: "#44ddff", label: "PROPERTY" },
  PERSONAL:   { color: "#aaaaaa", label: "PERSONAL" },
  ONTOLOGY:   { color: "#ff6ec7", label: "ONTOLOGY" },
  SYSTEM:     { color: "#555555", label: "SYSTEM" },
};

// ── Live intel feed items built from our actual data ─────────────────────
const INTEL_FEED = [
  { type: "PSG",        text: "PSG weekly net ~$120k | Revenue $180k | Expenses $60k" },
  { type: "PSG",        text: "Pipeline: Gmail → OpenSolar → ServiceM8 — 239 runs, 237 successful" },
  { type: "PSG",        text: "Contractors: Jesse, Tyler, Xavier, Sulieman, Adam, Amjad active" },
  { type: "INVESTMENT", text: "Pangani Tanzania beach 6-acre — $175k USD — due diligence active" },
  { type: "INVESTMENT", text: "Dubai IFZA free zone registration — planning phase — investor visa target" },
  { type: "INVESTMENT", text: "Dubai JVC/South off-plan — Airbnb strategy — researching" },
  { type: "FINANCE",    text: "XRP: 9,300 units @ ~$2.07 AUD = ~$19,251 AUD" },
  { type: "FINANCE",    text: "BTCMarkets, eToro, CoinJar, Coinbase — all active" },
  { type: "PROPERTY",   text: "Nisha build — Lot 227 Swamphen St, Austral NSW — Gurner — active" },
  { type: "TRAVEL",     text: "Returned Sydney 22 Mar 2026 — MH795 Phuket → KL → Sydney" },
  { type: "MUSIC",      text: "$avva — Still Me hit 5,000 streams — Not Like This, The Same live on Deezer" },
  { type: "LEGAL",      text: "BMW rego 25MBMW — toll dispute resolved Aug 2025" },
  { type: "ONTOLOGY",   text: "Ontology: 11,299 vectors indexed — identity + comms + finance + projects" },
  { type: "SYSTEM",     text: "ChromaDB: 11,299 vectors | 10 sources | Palantir batches: 3,091 objects" },
  { type: "PSG",        text: "GreenDeals STC forms active — Baulkham Hills, Kellyville Ridge" },
  { type: "FINANCE",    text: "NAB primary banking — $25k/day limit | Stripe 7-day hold active" },
  { type: "INVESTMENT", text: "Wealth target: $100M by 2033–2035" },
  { type: "PERSONAL",   text: "Nisha Nissan — fiancée — venue tours Ottimo House — Sat 20 Mar 2027 deciding" },
];

// ── Ontology objects from our actual palantir_profile_v2 ──────────────────
const ONTOLOGY_OBJECTS = [
  { id: "Person:sam_kazangas",    type: "Person",       label: "Sam Kazangas",         marking: "INTERNAL",     props: { dob: "27 Nov 1992", heritage: "Greek Cypriot Australian", email: "samkazangas@gmail.com" }},
  { id: "Person:harrison_vaubell",type: "Person",       label: "Harrison Vaubell",     marking: "INTERNAL",     props: { role: "PSG Co-founder 50/50", phone: "0415557997" }},
  { id: "Person:nisha_nissan",    type: "Person",       label: "Nisha Nissan",         marking: "PII",          props: { role: "Fiancée", employer: "Commonwealth Bank" }},
  { id: "Org:psg",                type: "Organization", label: "Project Solar Group",  marking: "FINANCIAL",    props: { abn: "29 685 341 744", revenue: "$180k/wk", net: "$120k/wk" }},
  { id: "Org:hilts",              type: "Organization", label: "Hilts Group Australia",marking: "INTERNAL",     props: { abn: "27 651 379 298", ownership: "100% Sam" }},
  { id: "Asset:psg_biz",          type: "Asset",        label: "PSG Business Value",   marking: "FINANCIAL",    props: { est_value: "~$5-10M", type: "Operating business" }},
  { id: "Investment:pangani",     type: "Investment",   label: "Pangani Tanzania",     marking: "FINANCIAL",    props: { ask: "$175k USD", size: "6 acres beachfront", status: "Due diligence" }},
  { id: "Investment:dubai_ifza",  type: "Investment",   label: "Dubai IFZA",           marking: "FINANCIAL",    props: { type: "Free zone company", purpose: "Investor visa + holding" }},
  { id: "Asset:xrp",              type: "Asset",        label: "XRP Holdings",         marking: "FINANCIAL",    props: { units: 9300, value_aud: "$19,251" }},
  { id: "Property:nisha_build",   type: "Property",     label: "Nisha Build — Austral",marking: "FINANCIAL",    props: { address: "Lot 227 Swamphen St Austral NSW", builder: "Gurner" }},
];

// ── Links between ontology objects ────────────────────────────────────────
const ONTOLOGY_LINKS = [
  { from: "Person:sam_kazangas",     to: "Org:psg",                type: "CONTROLS",         label: "50% owner" },
  { from: "Person:harrison_vaubell", to: "Org:psg",                type: "CONTROLS",         label: "50% owner" },
  { from: "Person:sam_kazangas",     to: "Org:hilts",              type: "CONTROLS",         label: "100% owner" },
  { from: "Person:sam_kazangas",     to: "Person:nisha_nissan",    type: "ASSOCIATED_WITH",  label: "Fiancée" },
  { from: "Person:sam_kazangas",     to: "Investment:pangani",     type: "OWNS",             label: "Prospective" },
  { from: "Person:sam_kazangas",     to: "Investment:dubai_ifza",  type: "OWNS",             label: "Planning" },
  { from: "Person:sam_kazangas",     to: "Asset:xrp",              type: "OWNS",             label: "Direct" },
  { from: "Person:sam_kazangas",     to: "Property:nisha_build",   type: "LINKED_TO",        label: "Partner property" },
  { from: "Org:psg",                 to: "Asset:psg_biz",          type: "OWNS",             label: "Business asset" },
];

// ── Entity profiles (Gridline /country/xx equivalent) ────────────────────
const ENTITY_PROFILES = {
  "Person:sam_kazangas": {
    title: "Sam Kazangas", subtitle: "IDENTITY PROFILE",
    sections: [
      { label: "FULL NAME",    value: "Samuel Kazangas" },
      { label: "ALIAS",        value: "Sammi / Sam" },
      { label: "HERITAGE",     value: "Greek Cypriot Australian" },
      { label: "DOB",          value: "27 November 1992 (age 33)" },
      { label: "HOME",         value: "35 Springfield Road, Padstow NSW 2211" },
      { label: "EMAIL",        value: "samkazangas@gmail.com" },
      { label: "ARTIST NAME",  value: "$avva (DistroKid/Spotify)" },
      { label: "WEALTH TARGET",value: "$100M by 2033–2035" },
    ],
    summary: "Greek Cypriot Australian founder and operator. Runs Project Solar Group (50/50 w/ Harrison) generating ~$120k/wk net. Also owns Hilts Group Australia. Releasing music as $avva. Engaged to Nisha Nissan. Daughter born Aug 2025. Actively pursuing international investments in Tanzania and Dubai."
  },
  "Org:psg": {
    title: "Project Solar Group", subtitle: "BUSINESS INTELLIGENCE",
    sections: [
      { label: "ABN",          value: "29 685 341 744" },
      { label: "OWNERSHIP",    value: "50/50 Sam Kazangas & Harrison Vaubell" },
      { label: "WEEKLY REV",   value: "~$180,000 AUD" },
      { label: "WEEKLY EXP",   value: "~$60,000 AUD" },
      { label: "WEEKLY NET",   value: "~$120,000 AUD" },
      { label: "DOMAIN",       value: "@projectsolar.com.au" },
      { label: "PHONE",        value: "1800 716 837" },
      { label: "TOOLS",        value: "ServiceM8 | OpenSolar | Xero | NAB | RingCentral" },
    ],
    summary: "Sydney-based solar installation company. High-growth operator running $120k/wk net. Uses automated Gmail → OpenSolar → ServiceM8 pipeline for job creation. Admin team based in Philippines. Active GreenDeals STC processing."
  },
  "Investment:pangani": {
    title: "Pangani Tanzania — Beach Land", subtitle: "INVESTMENT INTELLIGENCE",
    sections: [
      { label: "LOCATION",     value: "Pangani, Tanzania (East Africa)" },
      { label: "SIZE",         value: "6 acres beachfront" },
      { label: "ASK PRICE",    value: "$175,000 USD" },
      { label: "STATUS",       value: "Due diligence active" },
      { label: "AGENT",        value: "Africa Luxury Properties" },
      { label: "LEGAL",        value: "Eden Law Chambers — formal legal clarity requested" },
      { label: "OWNERSHIP",    value: "Leasehold (99yr) — Tanzania land law" },
      { label: "STRATEGY",     value: "Beachfront resort / Zanzibar gateway asset" },
    ],
    summary: "6-acre beachfront parcel in Pangani, Tanzania. Listed at $175k USD. Due diligence in progress — legal structure, title, lease terms being verified. Part of broader East Africa / Zanzibar $100M resort strategy."
  },
  "Investment:dubai_ifza": {
    title: "Dubai IFZA Free Zone", subtitle: "INVESTMENT INTELLIGENCE",
    sections: [
      { label: "TYPE",         value: "IFZA Free Zone Company" },
      { label: "PURPOSE",      value: "Holding entity + Investor visa (Sam + Harrison)" },
      { label: "STRATEGY",     value: "Off-plan apartment JVC/Dubai South → Airbnb" },
      { label: "VISA",         value: "UAE Investor Visa via IFZA structure" },
      { label: "STATUS",       value: "Planning phase" },
      { label: "COMMS DOMAIN", value: "@projectsolargroup.com.au (UAE entity only)" },
    ],
    summary: "UAE expansion via IFZA free zone registration. Dual purpose: investor visas for Sam and Harrison + holding structure for Dubai off-plan property targeting Airbnb returns."
  },
};

// ── Styles ────────────────────────────────────────────────────────────────
const S = {
  root: { background: BG, minHeight: "100vh", color: "#e0e0e0", fontFamily: "'Courier New', monospace", fontSize: 13 },
  topbar: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 20px", borderBottom:`1px solid ${BORDER}`, background:"#0d0d0d" },
  logo: { display:"flex", alignItems:"center", gap:10, color: NEON, fontWeight:"bold", fontSize:15, letterSpacing:3 },
  hexIcon: { width:22, height:22 },
  liveBadge: { display:"flex", alignItems:"center", gap:5, color: NEON, fontSize:11 },
  liveDot: { width:6, height:6, borderRadius:"50%", background:"#ff4444", animation:"pulse 1.5s infinite" },
  mainGrid: { display:"grid", gridTemplateColumns:"320px 1fr 340px", height:"calc(100vh - 45px)", overflow:"hidden" },
  panel: { borderRight:`1px solid ${BORDER}`, display:"flex", flexDirection:"column", overflow:"hidden" },
  panelHeader: { padding:"10px 16px", borderBottom:`1px solid ${BORDER}`, color: NEON, fontSize:11, letterSpacing:2, background:"#0d0d0d", display:"flex", alignItems:"center", justifyContent:"space-between" },
  panelBody: { flex:1, overflowY:"auto", padding:"8px" },
  signalRow: { display:"flex", alignItems:"flex-start", gap:8, padding:"6px 8px", borderBottom:`1px solid #141414`, cursor:"pointer", transition:"background 0.15s" },
  tag: (type) => ({ fontSize:9, fontWeight:"bold", letterSpacing:1, padding:"2px 6px", borderRadius:2, background: SIGNAL_TYPES[type]?.color+"22", color: SIGNAL_TYPES[type]?.color, border:`1px solid ${SIGNAL_TYPES[type]?.color}44`, whiteSpace:"nowrap", marginTop:1 }),
  searchBox: { background:"#0d0d0d", border:`1px solid ${BORDER}`, borderRadius:4, padding:"7px 12px", color:"#e0e0e0", fontFamily:"inherit", fontSize:12, width:"100%", outline:"none", boxSizing:"border-box" },
  mainPanel: { display:"flex", flexDirection:"column", overflow:"hidden" },
  mapZone: { flex:1, background: "#0d0d0d", position:"relative", display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${BORDER}`, margin:8, borderRadius:4, overflow:"hidden" },
  entityCard: { background: CARD, border:`1px solid ${BORDER}`, borderRadius:4, padding:12, marginBottom:8, cursor:"pointer", transition:"border-color 0.2s" },
  entityType: { fontSize:9, color:"#666", letterSpacing:2, marginBottom:4 },
  entityTitle: { color: NEON, fontSize:13, fontWeight:"bold", marginBottom:4 },
  entityMark: (m) => { const colors = {INTERNAL:"#44aaff",FINANCIAL:"#ffd700",PII:"#ff6ec7",LEGAL:"#ff4444",CONFIDENTIAL:"#ff0000"}; return {fontSize:9,padding:"1px 5px",borderRadius:2,background:(colors[m]||"#444")+"33",color:colors[m]||"#888",border:`1px solid ${(colors[m]||"#444")}66`}; },
  rightPanel: { borderLeft:`1px solid ${BORDER}`, display:"flex", flexDirection:"column", overflow:"hidden" },
  detailHeader: { padding:"12px 16px", borderBottom:`1px solid ${BORDER}`, background:"#0d0d0d" },
  detailTitle: { color: NEON, fontSize:14, fontWeight:"bold", letterSpacing:1 },
  detailSub: { color:"#666", fontSize:10, letterSpacing:2, marginTop:2 },
  factRow: { display:"flex", gap:8, padding:"6px 0", borderBottom:`1px solid #141414` },
  factLabel: { color:"#666", fontSize:10, letterSpacing:1, minWidth:100, flexShrink:0 },
  factValue: { color:"#e0e0e0", fontSize:11 },
  summary: { background:"#0d1a0d", border:`1px solid ${BORDER}`, borderRadius:4, padding:12, margin:8, fontSize:12, lineHeight:1.6, color:"#aaa" },
  aiInput: { display:"flex", gap:8, padding:"8px 12px", borderTop:`1px solid ${BORDER}`, background:"#0d0d0d" },
  aiPrompt: { flex:1, background:"#111", border:`1px solid ${BORDER}`, borderRadius:3, padding:"6px 10px", color:"#e0e0e0", fontFamily:"inherit", fontSize:12, outline:"none" },
  aiBtn: { background: NEON+"22", border:`1px solid ${NEON}44`, color: NEON, padding:"6px 14px", borderRadius:3, cursor:"pointer", fontSize:11, fontFamily:"inherit", letterSpacing:1 },
  linkRow: { display:"flex", alignItems:"center", gap:8, padding:"5px 8px", fontSize:11, borderBottom:`1px solid #141414` },
  linkType: { color:"#666", fontSize:9, letterSpacing:1 },
  fromTo: { color:"#aaa" },
  arrow: { color: NEON },
  graphNode: { position:"absolute", width:80, height:28, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:3, fontSize:9, fontWeight:"bold", letterSpacing:1, cursor:"pointer", border:"1px solid", transition:"all 0.2s" },
  tabRow: { display:"flex", borderBottom:`1px solid ${BORDER}` },
  tab: (active) => ({ padding:"8px 14px", fontSize:10, letterSpacing:2, cursor:"pointer", color: active ? NEON : "#555", borderBottom: active ? `2px solid ${NEON}` : "2px solid transparent", background:"transparent", border:"none", fontFamily:"inherit" }),
  statusBar: { display:"flex", gap:16, padding:"4px 16px", borderTop:`1px solid ${BORDER}`, background:"#0d0d0d", fontSize:10, color:"#555" },
  statChip: { color: NEON },
};

// ── Graph Canvas Component ───────────────────────────────────────────────
function OntologyGraph({ objects, links, onSelect, selectedId }) {
  // Simple force-like static layout
  const positions = {
    "Person:sam_kazangas":     { x:50,  y:45 },
    "Person:harrison_vaubell": { x:18,  y:75 },
    "Person:nisha_nissan":     { x:80,  y:75 },
    "Org:psg":                 { x:18,  y:30 },
    "Org:hilts":               { x:82,  y:30 },
    "Investment:pangani":      { x:28,  y:85 },
    "Investment:dubai_ifza":   { x:72,  y:85 },
    "Asset:xrp":               { x:60,  y:60 },
    "Property:nisha_build":    { x:88,  y:58 },
    "Asset:psg_biz":           { x:8,   y:55 },
  };
  const typeColors = {
    Person: "#00ff9d", Organization:"#ffd700", Investment:"#00bfff",
    Asset:"#ff9900", Property:"#cc44ff"
  };
  return (
    <svg width="100%" height="100%" style={{ position:"absolute", inset:0 }}>
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#333" />
        </marker>
      </defs>
      {links.map((lk,i) => {
        const f = positions[lk.from], t = positions[lk.to];
        if(!f||!t) return null;
        const x1=`${f.x}%`, y1=`${f.y}%`, x2=`${t.x}%`, y2=`${t.y}%`;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1a2a1a" strokeWidth={1} markerEnd="url(#arrow)" />;
      })}
      {objects.map(obj => {
        const pos = positions[obj.id];
        if(!pos) return null;
        const isSelected = obj.id === selectedId;
        const col = typeColors[obj.type] || "#888";
        return (
          <g key={obj.id} onClick={() => onSelect(obj.id)} style={{cursor:"pointer"}}>
            <rect
              x={`calc(${pos.x}% - 38px)`} y={`calc(${pos.y}% - 12px)`}
              width={76} height={24} rx={3}
              fill={isSelected ? col+"33" : "#111"}
              stroke={isSelected ? col : col+"55"}
              strokeWidth={isSelected ? 1.5 : 1}
            />
            <text
              x={`${pos.x}%`} y={`${pos.y}%`}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fill={isSelected ? col : col+"bb"} fontFamily="Courier New"
              fontWeight="bold"
            >
              {obj.label.slice(0,14)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── AI Analyst Panel ─────────────────────────────────────────────────────
function AIAnalyst({ profile }) {
  const [messages, setMessages] = useState([
    { role:"system", text:`JARVIS TERMINAL ONLINE — ${new Date().toISOString().slice(0,19)} UTC` },
    { role:"system", text:`DB: 11,299 vectors | Sources: 10 | Palantir objects: 3,091` },
    { role:"system", text:"Ready. Ask anything about Sam, PSG, investments, contacts, timeline." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  const CANNED = {
    "psg": "PSG is running ~$120k/wk net (revenue $180k, expenses $60k). Pipeline: Gmail → OpenSolar → ServiceM8 automated. 239 runs, 237 successful. Contractors: Jesse, Tyler, Xavier, Sulieman, Adam, Amjad. Admin: Jas (Philippines). Tools: ServiceM8, OpenSolar, Xero, NAB.",
    "investments": "Active investments: [1] Pangani Tanzania — 6-acre beachfront $175k USD — due diligence active with Africa Luxury Properties. [2] Dubai IFZA free zone — investor visa strategy for Sam + Harrison — off-plan apartment JVC/Dubai South for Airbnb. Wealth target: $100M by 2033–2035.",
    "harrison": "Harrison Vaubell — PSG co-founder 50/50. Phone: 0415557997. Described as 'cuzzy', deep trust, daily contact (6,161 WA messages). Sam mentors him technically, Harrison runs ops. Both planning Dubai IFZA structure.",
    "nisha": "Nisha Nissan — Sam's fiancée. Email: nisha.nissan@hotmail.com. Works at Commonwealth Bank. Property build active at Lot 227 Swamphen St, Austral NSW with builder Gurner. Venue tours for wedding — Ottimo House (Sat 20 March 2027 — still deciding).",
    "crypto": "XRP: 9,300 units @ ~$2.07 AUD = ~$19,251 AUD. Active accounts: BTCMarkets, eToro, CoinJar, Coinbase. Reads weekly crypto wraps. Also tracks BTC, ETH, DOGE.",
    "contacts": "Inner circle: Harrison Vaubell (PSG co-founder), Nisha Nissan (fiancée). PSG contractors: Jesse, Tyler, Xavier, Sulieman, Adam, Amjad. Admin: Jas (Philippines). Hilts clients: Anytime Fitness, Ashfield RSL, Metro Petrol.",
  };

  const query = async () => {
    if(!input.trim()) return;
    const q = input.trim().toLowerCase();
    setMessages(m => [...m, { role:"user", text:input }]);
    setInput("");
    setLoading(true);

    await new Promise(r => setTimeout(r, 400));

    let answer = null;
    for(const [kw, ans] of Object.entries(CANNED)) {
      if(q.includes(kw)) { answer = ans; break; }
    }
    if(!answer) {
      if(q.includes("revenue") || q.includes("money") || q.includes("cash")) answer = CANNED.psg;
      else if(q.includes("invest") || q.includes("zanzibar") || q.includes("dubai") || q.includes("africa")) answer = CANNED.investments;
      else if(q.includes("partner") || q.includes("wedding") || q.includes("fiancee")) answer = CANNED.nisha;
      else if(q.includes("xrp") || q.includes("bitcoin") || q.includes("coin")) answer = CANNED.crypto;
      else answer = `Context retrieved from 11,299 vectors. Query: "${input}"\n\nRelevant sources indexed: palantir_profile_v2 (20 sections), palantir_batches (3,091 categorised emails), timeline (3,018 events), sam_voice (800 verbatim statements), harrison_intel (390 exchanges), memory_stores (1,137 entries), documents (170 chunks — Tanzania DD, Dubai plan, PSG architecture, Zanzibar scope), agent_rules (106 rules), whatsapp_raw (41k lines across 5 chats).\n\nFor live retrieval, connect OpenAI API key to enable semantic search over full context.`;
    }

    setMessages(m => [...m, { role:"jarvis", text:answer }]);
    setLoading(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior:"smooth" }), 100);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ flex:1, overflowY:"auto", padding:"8px 12px" }}>
        {messages.map((m,i) => (
          <div key={i} style={{ marginBottom:8 }}>
            <span style={{ color: m.role==="user" ? "#ffd700" : m.role==="jarvis" ? NEON : "#444", fontSize:10, letterSpacing:1 }}>
              {m.role==="user" ? "> " : m.role==="jarvis" ? "JARVIS ▸ " : "// "}
            </span>
            <span style={{ color: m.role==="user" ? "#fff" : m.role==="jarvis" ? "#c0ffc0" : "#555", fontSize:11, lineHeight:1.6 }}>{m.text}</span>
          </div>
        ))}
        {loading && <div style={{ color: NEON, fontSize:11 }}>JARVIS ▸ <span style={{animation:"blink 1s infinite"}}>processing...</span></div>}
        <div ref={endRef} />
      </div>
      <div style={S.aiInput}>
        <input
          style={S.aiPrompt} value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==="Enter" && query()}
          placeholder="Ask anything — PSG, investments, contacts, timeline..."
        />
        <button style={S.aiBtn} onClick={query}>RUN</button>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────
export default function JarvisTerminal() {
  const [feedIdx, setFeedIdx]     = useState(0);
  const [search, setSearch]       = useState("");
  const [selectedId, setSelectedId] = useState("Person:sam_kazangas");
  const [rightTab, setRightTab]   = useState("PROFILE");
  const [centerTab, setCenterTab] = useState("GRAPH");
  const [hovered, setHovered]     = useState(null);

  // Scroll intel feed
  useEffect(() => {
    const t = setInterval(() => setFeedIdx(i => (i+1) % INTEL_FEED.length), 2800);
    return () => clearInterval(t);
  }, []);

  const selectedObj    = ONTOLOGY_OBJECTS.find(o => o.id === selectedId);
  const selectedProfile = ENTITY_PROFILES[selectedId];
  const selectedLinks  = ONTOLOGY_LINKS.filter(l => l.from===selectedId || l.to===selectedId);

  const filteredObjects = search
    ? ONTOLOGY_OBJECTS.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.type.toLowerCase().includes(search.toLowerCase()))
    : ONTOLOGY_OBJECTS;

  const visibleFeed = [
    INTEL_FEED[feedIdx % INTEL_FEED.length],
    INTEL_FEED[(feedIdx+1) % INTEL_FEED.length],
    INTEL_FEED[(feedIdx+2) % INTEL_FEED.length],
    INTEL_FEED[(feedIdx+3) % INTEL_FEED.length],
    INTEL_FEED[(feedIdx+4) % INTEL_FEED.length],
  ];

  return (
    <div style={S.root}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        ::-webkit-scrollbar { width:4px } ::-webkit-scrollbar-track { background:#0a0a0a }
        ::-webkit-scrollbar-thumb { background:#1a2a1a; border-radius:2px }
        input::placeholder { color:#333 }
        .sig-row:hover { background:#0d1a0d !important }
        .ent-card:hover { border-color: #00ff9d44 !important }
      `}</style>

      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={S.logo}>
          <svg style={S.hexIcon} viewBox="0 0 24 24" fill="none">
            <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke={NEON} strokeWidth="1.5" fill="none"/>
            <polygon points="12,6 17,9 17,15 12,18 7,15 7,9" stroke={NEON} strokeWidth="0.5" fill={NEON+"11"}/>
          </svg>
          JARVIS TERMINAL
        </div>
        <div style={{ display:"flex", gap:16, alignItems:"center" }}>
          <span style={{ fontSize:10, color:"#555" }}>OSINT · SIGINT · PERSONAL-INT</span>
          <div style={S.liveBadge}><div style={S.liveDot}/> LIVE</div>
        </div>
        <div style={{ display:"flex", gap:12, fontSize:10, color:"#555" }}>
          <span>SAM KAZANGAS</span>
          <span style={{ color: NEON }}>◆</span>
          <span>{new Date().toISOString().slice(0,10)}</span>
        </div>
      </div>

      {/* LIVE INTEL TICKER */}
      <div style={{ background:"#0d0d0d", borderBottom:`1px solid ${BORDER}`, padding:"4px 16px", display:"flex", gap:8, alignItems:"center", overflowX:"hidden" }}>
        <span style={{ color:"#333", fontSize:9, letterSpacing:2, flexShrink:0 }}>INTEL ▸</span>
        {visibleFeed.map((item,i) => (
          <span key={i} style={{ display:"inline-flex", gap:6, alignItems:"center", marginRight:24, flexShrink:0 }}>
            <span style={S.tag(item.type)}>{SIGNAL_TYPES[item.type]?.label}</span>
            <span style={{ fontSize:10, color:"#888" }}>{item.text}</span>
          </span>
        ))}
      </div>

      {/* MAIN 3-COLUMN GRID */}
      <div style={S.mainGrid}>

        {/* LEFT — Intel Feed + Entity List */}
        <div style={S.panel}>
          <div style={S.panelHeader}>
            <span>INTEL FEED</span>
            <span style={{ color:"#444" }}>{INTEL_FEED.length} SIGNALS</span>
          </div>
          <div style={{ padding:"8px" }}>
            <input
              style={{ ...S.searchBox, marginBottom:8 }}
              placeholder="Search entities, signals..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={S.panelBody}>
            {!search && INTEL_FEED.map((item,i) => (
              <div key={i} className="sig-row" style={S.signalRow}>
                <span style={S.tag(item.type)}>{SIGNAL_TYPES[item.type]?.label}</span>
                <span style={{ fontSize:11, color:"#999", lineHeight:1.4 }}>{item.text}</span>
              </div>
            ))}
            {search && (
              <>
                <div style={{ fontSize:9, color:"#444", letterSpacing:2, padding:"4px 8px 8px" }}>ENTITIES</div>
                {filteredObjects.map(obj => (
                  <div key={obj.id} className="ent-card" style={{ ...S.entityCard, borderColor: selectedId===obj.id ? NEON+"55" : BORDER }}
                    onClick={() => setSelectedId(obj.id)}>
                    <div style={S.entityType}>{obj.type.toUpperCase()}</div>
                    <div style={S.entityTitle}>{obj.label}</div>
                    <span style={S.entityMark(obj.marking)}>{obj.marking}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* CENTER — Graph / AI Analyst */}
        <div style={S.mainPanel}>
          <div style={S.tabRow}>
            {["GRAPH","ONTOLOGY","AI ANALYST","TIMELINE"].map(t => (
              <button key={t} style={S.tab(centerTab===t)} onClick={() => setCenterTab(t)}>{t}</button>
            ))}
          </div>

          {centerTab === "GRAPH" && (
            <div style={{ flex:1, padding:8, display:"flex", flexDirection:"column", gap:8 }}>
              <div style={S.mapZone}>
                <OntologyGraph objects={ONTOLOGY_OBJECTS} links={ONTOLOGY_LINKS} onSelect={id => { setSelectedId(id); setRightTab("PROFILE"); }} selectedId={selectedId} />
                <div style={{ position:"absolute", top:8, left:8, fontSize:9, color:"#333", letterSpacing:2 }}>ONTOLOGY GRAPH — {ONTOLOGY_OBJECTS.length} NODES — {ONTOLOGY_LINKS.length} LINKS</div>
                <div style={{ position:"absolute", bottom:8, right:8, fontSize:9, color:"#333" }}>Click node for detail →</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, padding:"0 0 8px" }}>
                {[
                  { label:"DB VECTORS",   value:"11,299", color: NEON },
                  { label:"PALANTIR OBJ", value:"3,091",  color:"#00bfff" },
                  { label:"EMAIL FACTS",  value:"8,939",  color:"#ffd700" },
                  { label:"WA MESSAGES",  value:"41k",    color:"#cc44ff" },
                ].map(s => (
                  <div key={s.label} style={{ background: CARD, border:`1px solid ${BORDER}`, borderRadius:4, padding:"8px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:16, fontWeight:"bold", color:s.color }}>{s.value}</div>
                    <div style={{ fontSize:9, color:"#555", letterSpacing:1, marginTop:2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {centerTab === "ONTOLOGY" && (
            <div style={{ flex:1, overflowY:"auto", padding:8 }}>
              <div style={{ fontSize:9, color:"#444", letterSpacing:2, padding:"4px 8px 10px" }}>ALL ONTOLOGY OBJECTS — {ONTOLOGY_OBJECTS.length} NODES</div>
              {ONTOLOGY_OBJECTS.map(obj => (
                <div key={obj.id} className="ent-card" style={{ ...S.entityCard, borderColor: selectedId===obj.id ? NEON+"55" : BORDER }}
                  onClick={() => { setSelectedId(obj.id); setRightTab("PROFILE"); }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={S.entityType}>{obj.type.toUpperCase()}</div>
                      <div style={S.entityTitle}>{obj.label}</div>
                    </div>
                    <span style={S.entityMark(obj.marking)}>{obj.marking}</span>
                  </div>
                  <div style={{ fontSize:10, color:"#555", marginTop:6 }}>{obj.id}</div>
                  <div style={{ display:"flex", gap:8, marginTop:6 }}>
                    {Object.entries(obj.props).slice(0,2).map(([k,v]) => (
                      <span key={k} style={{ fontSize:10, color:"#888" }}><span style={{ color:"#555" }}>{k}: </span>{String(v).slice(0,30)}</span>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ fontSize:9, color:"#444", letterSpacing:2, padding:"12px 8px 6px" }}>ONTOLOGY LINKS — {ONTOLOGY_LINKS.length} EDGES</div>
              {ONTOLOGY_LINKS.map((lk,i) => (
                <div key={i} style={S.linkRow}>
                  <span style={S.fromTo}>{lk.from.split(":")[1]}</span>
                  <span style={S.arrow}>──{lk.type}──▶</span>
                  <span style={S.fromTo}>{lk.to.split(":")[1]}</span>
                  <span style={{ color:"#444", fontSize:9 }}>({lk.label})</span>
                </div>
              ))}
            </div>
          )}

          {centerTab === "AI ANALYST" && <AIAnalyst />}

          {centerTab === "TIMELINE" && (
            <div style={{ flex:1, overflowY:"auto", padding:8 }}>
              <div style={{ fontSize:9, color:"#444", letterSpacing:2, padding:"4px 8px 10px" }}>LIFE TIMELINE — PALANTIR EXTRACTED — 3,018 EVENTS</div>
              {[
                { date:"22 Mar 2026", cat:"TRAVEL",     event:"Returned Sydney — MH795 Phuket→KL→Sydney" },
                { date:"21 Mar 2026", cat:"SYSTEM",     event:"OMEGA forensic audit — fake stack exposed — real rebuild initiated" },
                { date:"20 Mar 2026", cat:"PSG",        event:"Gmail OAuth re-authenticated — pipeline restored" },
                { date:"18 Mar 2026", cat:"INVESTMENT", event:"Zanzibar/Africa correspondence — Africa Luxury Properties + Eden Law" },
                { date:"17 Mar 2026", cat:"SYSTEM",     event:"Identity corrected — Nisha = fiancée (not Natalie)" },
                { date:"16 Mar 2026", cat:"TRAVEL",     event:"Koh Samui → Bangkok (PG176) — Grande Centre Point Surawong" },
                { date:"16 Mar 2026", cat:"SYSTEM",     event:"OMEGA scan initiated — 3,804 emails read" },
                { date:"11 Feb 2026", cat:"MUSIC",      event:"$avva — Still Me hits 5,000 streams — DistroKid payout requested" },
                { date:"08 Feb 2026", cat:"MUSIC",      event:"$avva — Still Me released — Apple lyrics approved" },
                { date:"Feb 2026",    cat:"PERSONAL",   event:"Wedding venue tours — Ottimo House + Breakfast Point Country Club" },
                { date:"Jan 2026",    cat:"PSG",        event:"WizeWork admin infra setup — Jas (Philippines) onboarded" },
                { date:"Aug 2025",    cat:"PERSONAL",   event:"Daughter born" },
                { date:"Aug 2025",    cat:"LEGAL",      event:"BMW rego 25MBMW — toll fee dispute submitted" },
                { date:"May 2025",    cat:"PSG",        event:"PSG co-founder comms with Harrison — warehouse showroom discussed" },
              ].map((ev,i) => (
                <div key={i} style={{ display:"flex", gap:12, padding:"6px 8px", borderBottom:`1px solid #141414` }}>
                  <span style={{ color:"#555", fontSize:10, minWidth:80, flexShrink:0 }}>{ev.date}</span>
                  <span style={S.tag(ev.cat)}>{ev.cat}</span>
                  <span style={{ fontSize:11, color:"#999" }}>{ev.event}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — Entity Detail Panel */}
        <div style={S.rightPanel}>
          <div style={S.tabRow}>
            {["PROFILE","LINKS","SOURCES"].map(t => (
              <button key={t} style={S.tab(rightTab===t)} onClick={() => setRightTab(t)}>{t}</button>
            ))}
          </div>

          {rightTab === "PROFILE" && selectedObj && (
            <>
              <div style={S.detailHeader}>
                <div style={S.detailTitle}>{selectedObj.label}</div>
                <div style={S.detailSub}>{selectedObj.type.toUpperCase()} · {selectedObj.id}</div>
                <div style={{ marginTop:6, display:"flex", gap:6 }}>
                  <span style={S.entityMark(selectedObj.marking)}>{selectedObj.marking}</span>
                </div>
              </div>
              <div style={{ flex:1, overflowY:"auto" }}>
                {selectedProfile ? (
                  <>
                    <div style={{ padding:"8px 16px" }}>
                      {selectedProfile.sections.map((s,i) => (
                        <div key={i} style={S.factRow}>
                          <span style={S.factLabel}>{s.label}</span>
                          <span style={S.factValue}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={S.summary}>
                      <div style={{ fontSize:9, color:NEON, letterSpacing:2, marginBottom:8 }}>INTELLIGENCE SUMMARY</div>
                      {selectedProfile.summary}
                    </div>
                  </>
                ) : (
                  <div style={{ padding:"12px 16px" }}>
                    {Object.entries(selectedObj.props).map(([k,v]) => (
                      <div key={k} style={S.factRow}>
                        <span style={S.factLabel}>{k.toUpperCase()}</span>
                        <span style={S.factValue}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {rightTab === "LINKS" && (
            <div style={{ flex:1, overflowY:"auto", padding:8 }}>
              <div style={{ fontSize:9, color:"#444", letterSpacing:2, padding:"4px 8px 10px" }}>
                RELATIONSHIPS — {selectedObj?.label}
              </div>
              {selectedLinks.length === 0 && <div style={{ color:"#444", fontSize:11, padding:8 }}>No links for this object.</div>}
              {selectedLinks.map((lk,i) => {
                const isFrom = lk.from === selectedId;
                const otherId = isFrom ? lk.to : lk.from;
                const other = ONTOLOGY_OBJECTS.find(o => o.id === otherId);
                return (
                  <div key={i} className="ent-card" style={{ ...S.entityCard }} onClick={() => setSelectedId(otherId)}>
                    <div style={{ fontSize:9, color:"#555", letterSpacing:1, marginBottom:4 }}>
                      {isFrom ? "OUTBOUND" : "INBOUND"} — {lk.type}
                    </div>
                    <div style={{ color: NEON, fontSize:12 }}>{other?.label || otherId}</div>
                    <div style={{ color:"#666", fontSize:10, marginTop:3 }}>{lk.label}</div>
                  </div>
                );
              })}
              <div style={{ fontSize:9, color:"#444", letterSpacing:2, padding:"12px 8px 6px" }}>ALL LINKS IN GRAPH</div>
              {ONTOLOGY_LINKS.map((lk,i) => (
                <div key={i} style={{ ...S.linkRow, fontSize:10 }}>
                  <span style={{ color:"#666", cursor:"pointer" }} onClick={() => setSelectedId(lk.from)}>{lk.from.split(":")[1]}</span>
                  <span style={{ color:"#333" }}>──▶</span>
                  <span style={{ color:"#666", cursor:"pointer" }} onClick={() => setSelectedId(lk.to)}>{lk.to.split(":")[1]}</span>
                  <span style={{ color:"#333", fontSize:9 }}>{lk.type}</span>
                </div>
              ))}
            </div>
          )}

          {rightTab === "SOURCES" && (
            <div style={{ flex:1, overflowY:"auto", padding:8 }}>
              <div style={{ fontSize:9, color:"#444", letterSpacing:2, padding:"4px 8px 10px" }}>INGESTED SOURCES</div>
              {[
                { src:"palantir_profile_v2",  count:"379 chunks",  type:"Identity",      mark:"HIGH" },
                { src:"palantir_batches",      count:"3,091 objs",  type:"CommunicationEvent", mark:"FINANCIAL" },
                { src:"timeline",              count:"3,018 events",type:"TimelineEvent",  mark:"INTERNAL" },
                { src:"email_facts",           count:"3,000 facts", type:"ExtractedFact", mark:"INTERNAL" },
                { src:"memory_stores",         count:"1,137 items", type:"Memory",        mark:"INTERNAL" },
                { src:"sam_voice",             count:"800 verbatim",type:"UserStatement",  mark:"PII" },
                { src:"harrison_intel",        count:"390 msgs",    type:"Communication", mark:"INTERNAL" },
                { src:"documents",             count:"170 chunks",  type:"ProjectDoc",    mark:"INTERNAL" },
                { src:"agent_rules",           count:"106 rules",   type:"Rules",         mark:"INTERNAL" },
                { src:"whatsapp_raw",          count:"41k lines",   type:"Communication", mark:"PII" },
              ].map((s,i) => (
                <div key={i} style={{ ...S.entityCard, cursor:"default" }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <div style={{ color: NEON, fontSize:11, fontWeight:"bold" }}>{s.src}</div>
                    <span style={S.entityMark(s.mark)}>{s.mark}</span>
                  </div>
                  <div style={{ display:"flex", gap:12, marginTop:4 }}>
                    <span style={{ fontSize:10, color:"#888" }}>{s.count}</span>
                    <span style={{ fontSize:10, color:"#555" }}>{s.type}</span>
                  </div>
                </div>
              ))}
              <div style={{ ...S.summary, margin:"8px 0 0" }}>
                <div style={{ fontSize:9, color:NEON, letterSpacing:2, marginBottom:6 }}>INGESTION STATUS</div>
                <div style={{ fontSize:10, color:"#888", lineHeight:1.8 }}>
                  Total vectors: 11,299<br/>
                  ChromaDB: persistent local store<br/>
                  Embedding model: all-MiniLM-L6-v2<br/>
                  Palantir ontology: local mirror (no live Foundry API)<br/>
                  Object types preserved: Person, Organization, Investment, Asset, Property<br/>
                  Link types preserved: CONTROLS, OWNS, ASSOCIATED_WITH, LINKED_TO<br/>
                  Security markings: INTERNAL, FINANCIAL, PII, LEGAL
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* STATUS BAR */}
      <div style={S.statusBar}>
        <span>JARVIS TERMINAL v1.0</span>
        <span>◆</span>
        <span style={S.statChip}>11,299 VECTORS</span>
        <span>◆</span>
        <span style={S.statChip}>10 SOURCES</span>
        <span>◆</span>
        <span style={S.statChip}>{ONTOLOGY_OBJECTS.length} ONTOLOGY OBJECTS</span>
        <span>◆</span>
        <span style={S.statChip}>{ONTOLOGY_LINKS.length} LINKS</span>
        <span>◆</span>
        <span>PSG NET ~$120k/wk</span>
        <span>◆</span>
        <span>WEALTH TARGET $100M by 2033</span>
      </div>
    </div>
  );
}
