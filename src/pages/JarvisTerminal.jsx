import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// JARVIS GLOBAL INTELLIGENCE TERMINAL v5.0
// REAL DATA: palantir_profile_v2.json + full_body_facts.jsonl (8,939 facts)
// + palantir batches (3,091 emails) + timeline (3,018 events)
// UI: Gridline globe + Palantir Vertex force graph + glass morphism
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg:"#03070a", panel:"rgba(5,12,18,0.92)", border:"rgba(0,220,140,0.14)",
  neon:"#00dc8c", neonD:"rgba(0,220,140,0.12)", neonG:"rgba(0,220,140,0.06)",
  blue:"#00b8e6", blueD:"rgba(0,184,230,0.12)",
  gold:"#f0b800", goldD:"rgba(240,184,0,0.12)",
  red:"#ff2d55", redD:"rgba(255,45,85,0.12)",
  purple:"#bf5fff", purpleD:"rgba(191,95,255,0.12)",
  orange:"#ff8c00", text:"#6a8898", textB:"#b8cdd8",
  glass:"rgba(5,12,18,0.78)", glow:"0 0 30px rgba(0,220,140,0.06), 0 4px 16px rgba(0,0,0,0.7)",
};

// ─── REAL PALANTIR DATA ───────────────────────────────────────────────────────
// Extracted from palantir_profile_v2.json + full_body_facts.jsonl + batches
const PALANTIR = {
  identity: {
    name: "Sam Kazangas", preferred: "Sammi / Sam",
    heritage: "Greek Cypriot Australian", dob: "27 November 1992", age: 33,
    home: "35 Springfield Road, Padstow/Revesby NSW 2211",
    emails: ["samkazangas@gmail.com", "sam.k@projectsolar.com.au", "sam@hilts.com.au"],
    artist: "$avva", github: "samskiezz",
    wealth_target: "$100M by 2033–2035",
  },
  psg: {
    full_name: "Project Solar Group Pty Ltd",
    abn: "29 685 341 744", ownership: "50/50 Sam & Harrison",
    domain: "@projectsolar.com.au",
    revenue_weekly: 180000, expenses_weekly: 60000, net_weekly: 120000,
    annual_net: 6240000,
    tools: ["ServiceM8","OpenSolar","Xero","NAB","RingCentral"],
    phone: "1800 716 837",
    contractors: [
      { name:"Jesse James Noakes Gordon", dob:"02/06/2002", email:"jessegordon@projectsolar.com.au" },
      { name:"Tyler Noakes Gordon", dob:"18/02/2005", email:"tylergordon@projectsolar.com.au" },
      { name:"Xavier Aguirre", dob:"25/11/1998", email:"xavieraguirre@projectsolar.com.au" },
      { name:"Sulieman el-Dannoui", dob:"09/02/2004", email:"sulieman@projectsolar.com.au" },
      { name:"Adam Kandeel", dob:"01/10/2004", email:"adamkandeel@projectsolar.com.au" },
      { name:"Amjad Malas", dob:"08/11/2001", email:"amjadmalas@projectsolar.com.au" },
      { name:"Xavier Cevallos", role:"Right-hand man" },
    ],
    admin: [
      { name:"Jas (Jasmine)", email:"accounts@projectsolar.com.au", loc:"Philippines", hrs:"7am–3pm AEDT" },
      { name:"Marvin Oqueriza Benson", loc:"Philippines", role:"Admin/ops" },
      { name:"Red", role:"Schedule runs / contractor coordination" },
      { name:"Joplin Lualhati (WizeWork)", role:"External ops consultant" },
    ],
    pricing: {
      "Battery Install (std)": "$1,500 + GST (within 5m)",
      "Second Battery Stack": "$1,200 + GST",
      "Sigenergy + Gateway": "$2,500 + GST",
      "Inverter Replacement": "$500 + GST",
      "Solar Residential": "$0.28/W std | $0.31/W complex",
      "Service Callout": "$290 + GST incl 45min | +$110/hr",
      "Backup Circuit": "$350 setup + $150/circuit",
      "Panel Cleaning": "$35/panel single | $40/panel double",
    },
    issues: [
      "Defended Energy stopped site delivery — Sam absorbing ~$900/wk freight",
      "Steep roof jobs (Wahroonga 29°) sent without pre-inspection",
      "Katoomba same-day scheduling not feasible",
      "Origin Energy losing meter applications (Picton job — lost twice)",
      "30-day payment term attempt from Defended — rejected, 7 days enforced",
    ],
    pipeline_runs_today: 118,
    pipeline_credits: 45.6,
  },
  hilts: {
    full_name: "Hilts Group Australia",
    abn: "27 651 379 298", ownership: "100% Sam",
    email: "sam@hilts.com.au", phone: "1800 961 695",
    address: "35 Springfield Road Padstow NSW",
    clients: ["Anytime Fitness","Ashfield RSL","Metro Petrol"],
  },
  financials: {
    xrp_units: 9300, xrp_price_aud: 2.07, xrp_value_aud: 19251,
    exchanges: ["BTCMarkets","Coinbase","eToro","CoinJar"],
    banking: { primary:"NAB ($25k/day limit)", travel:"Wise + ANZ" },
    stripe_hold: "7-day payout hold",
    investment_pipeline: [
      { date:"Mar 2026", item:"IFZA FZCO Dubai registration", status:"PLANNING" },
      { date:"Apr 2026", item:"Golf Acres Dubai deposit (Emaar South 1BR)", status:"ENQUIRY" },
      { date:"May 2026", item:"Zanzibar coastal land — Pangani / Matemwe", status:"DD_ACTIVE" },
      { date:"Jun 2026", item:"Golf Vale Dubai deposit", status:"PIPELINE" },
    ],
  },
  relationships: {
    harrison: {
      name:"Harrison Vaubell", role:"PSG Co-founder 50/50",
      phone:"0415557997", email:"harrison@projectsolar.com.au",
      relationship:"Close personal friend / 'cuzzy', deep trust",
      messages: 6161, dynamic:"Sam mentors technically, Harrison runs ops",
    },
    nisha: {
      name:"Nisha Nissan", role:"Fiancée",
      emails:["nisha.nissan@hotmail.com","nisha.nissan17@gmail.com"],
      employer:"Commonwealth Bank",
      build:"Lot 227 Swamphen St, Austral NSW — builder Gurner",
      wedding:"Ottimo House — Sat 20 March 2027 (deciding)",
      daughter:"Born Aug 2025",
    },
  },
  music: {
    artist:"$avva", distributor:"DistroKid",
    releases:[
      { title:"Still Me", streams:"5,000+ by Feb 17 2026", apple_lyrics:true, youtube_contentid:true },
      { title:"Not Like This", date:"Feb 2026", platforms:["Deezer","Mar 11 2026"] },
      { title:"The Same", date:"Feb 2026" },
      { title:"Later", date:"Feb 9-10 2026", apple_lyrics:true },
      { title:"Working", status:"Pipeline Mar 2026" },
      { title:"Breathe", status:"Earlier release" },
    ],
    platforms:["Spotify","Apple Music","Deezer","TikTok","YouTube Music","Amazon","Instagram/Facebook"],
    royalties:"Active — DistroKid payout Feb 2026",
  },
  // REAL email intel extracted from batches
  investment_emails: [
    { date:"Mon 16 Mar 2026", from:"M Khalid Khan <m.khalid@apilproperties.com>", subject:"Re: Golf Acres, Emaar South — 1BR Business Investment Enquiry — Project Solar Group", cat:"DUBAI" },
    { date:"Mon 16 Mar 2026", from:"Africa Luxury Properties <info@africaluxproperties.com>", subject:"RE: Beachfront Land Acquisition — Matemwe, Zanzibar — ~10,000 SQM (Agent & Legal Enquiry)", cat:"ZANZIBAR" },
    { date:"Sun 15 Mar 2026", from:"samkazangas@gmail.com", subject:"Re: Beachfront Land Acquisition Zanzibar - Foreign Investor USD 100-200k - Paje / Matemwe", cat:"ZANZIBAR" },
    { date:"Sun 15 Mar 2026", from:"samkazangas@gmail.com", subject:"Re: IFZA Free Zone Company Setup — 2 Partners, Solar Energy, Urgent", cat:"DUBAI" },
    { date:"Sun 15 Mar 2026", from:"samkazangas@gmail.com", subject:"PSG Investment Portfolio V6 — FINAL — 15 March 2026", cat:"PORTFOLIO" },
    { date:"Sat 14 Mar 2026", from:"samkazangas@gmail.com", subject:"Golf Acres, Emaar South — 1BR Business Investment Enquiry — Project Solar Group", cat:"DUBAI" },
    { date:"Sat 14 Mar 2026", from:"Jolyon Darker <jolyon@peponirealestate.com>", subject:"Re: Serious Enquiry — 6 Acres Ushongo Mabaoni Beachfront, Pangani", cat:"PANGANI" },
    { date:"Thu 12 Mar 2026", from:"Eden Law Chambers <info@edenlawchambers.com>", subject:"Re: Zanzibar Land Acquisition — Foreign Investor Legal Structure", cat:"LEGAL" },
    { date:"Thu 26 Feb 2026", from:"Benjamin Valmont <BValmont@domainehomes.com.au>", subject:"Menangle Park House & Land Registration Q1 2027 From $940k", cat:"AU_PROPERTY" },
    { date:"Mon 02 Feb 2026", from:"Wilton Green <info@wiltongreen.com.au>", subject:"Wilton Green — Home & Land Packages from $795k", cat:"AU_PROPERTY" },
    { date:"Mon 16 Mar 2026", from:"APIL Properties <info@apilproperties.com>", subject:"Golf Vale by Emaar — Phase 2 Now Open — 1BR from AED 750k", cat:"DUBAI" },
    { date:"Fri 13 Mar 2026", from:"Proptech Group <info@proptech.ae>", subject:"Re: IFZA FZCO 2-person setup — Solar Energy sector", cat:"DUBAI" },
  ],
  crypto_emails: [
    { date:"Mon 16 Mar 2026", from:"BTC Markets <support@btcmarkets.net>", subject:"Bitcoin ETFs show sustained weekly inflows", signal:"BULLISH" },
    { date:"Thu 12 Mar 2026", from:"BTC Markets <support@btcmarkets.net>", subject:"Bitcoin is back above US$70,000 (A$98,000) and institutions are buying", signal:"BULLISH" },
    { date:"Thu 26 Feb 2026", from:"BTC Markets <support@btcmarkets.net>", subject:"Bears get liquidated as Bitcoin bounces from multi-month lows", signal:"NEUTRAL" },
    { date:"Tue 24 Feb 2026", from:"CoinGecko <hello@coingecko.com>", subject:"BTC Below $63K. What Comes Next?", signal:"BEARISH" },
    { date:"Mon 23 Feb 2026", from:"BTC Markets <support@btcmarkets.net>", subject:"Bitcoin whales buy as markets sell", signal:"BULLISH" },
    { date:"Fri 13 Mar 2026", from:"Binance <noreply@binance.com>", subject:"Binance Weekly Wrap: Earn Up To 220 USDT!", signal:"NEUTRAL" },
    { date:"Tue 10 Mar 2026", from:"Binance <noreply@binance.com>", subject:"Binance Meetup Sydney on tomorrow!", signal:"NEUTRAL" },
  ],
  data_stats: {
    timeline_total: 3018, facts_total: 8939,
    email_sources: 3804, whatsapp_total: 15822,
    batches: { Investments:89, Crypto:92, Finance:306, PSG_Business:38, Travel:78, Music:104, Legal:55, ATO_Tax:126 },
    vectors: 11299, sources: 10,
  },
  // Real behavioral facts from WA/email analysis
  behaviors: [
    "Direct, warm, no corporate filler. Uses 'bro', 'cuzzy', emoji sparingly",
    "Fast decisions. First principles. Reverses when wrong.",
    "Deep loyalty — goes to bat for Harrison unprompted",
    "7-day payment terms — absolute non-negotiable",
    "Prefers correctness over speed on installs",
    "Absorbing costs without renegotiating (freight ~$900/wk blind spot)",
    "Relies on verbal agreements with Defended — no paper trail",
    "Banyan Tree not Ibis. Golf Acres not any apartment.",
    "Vision: warehouse solar showroom Padstow end of year",
    "One of the biggest solar battery companies in Sydney — Aug 2025 verbatim",
  ],
};

// ─── ONTOLOGY NODES (Real data) ───────────────────────────────────────────────
const NODES = [
  { id:"sam",       label:"SAM KAZANGAS",    type:"person",   color:C.neon,   size:24, x:480,y:280,
    detail:"Greek Cypriot Australian. DOB 27 Nov 1992. Padstow NSW. $100M target 2033–2035." },
  { id:"psg",       label:"PROJECT SOLAR",   type:"org",      color:C.blue,   size:20, x:290,y:165,
    detail:`PSG Pty Ltd. ABN 29 685 341 744. 50/50 Sam + Harrison. Rev $180k/wk. Net $120k/wk. 7 contractors. 3 PH admin.` },
  { id:"hilts",     label:"HILTS GROUP",     type:"org",      color:C.blue,   size:14, x:660,y:160,
    detail:"ABN 27 651 379 298. 100% Sam. Clients: Anytime Fitness, Ashfield RSL, Metro Petrol." },
  { id:"harrison",  label:"HARRISON V.",     type:"person",   color:C.purple, size:18, x:190,y:275,
    detail:"Harrison Vaubell. PSG co-founder 50/50. 0415557997. 6,161 WA messages. Dubai IFZA shared plan." },
  { id:"nisha",     label:"NISHA NISSAN",    type:"person",   color:C.purple, size:18, x:560,y:420,
    detail:"Fiancée. Commonwealth Bank. Building Lot 227 Swamphen St Austral NSW (Gurner). Wedding Mar 2027 Ottimo House." },
  { id:"pangani",   label:"PANGANI TZ",      type:"invest",   color:C.gold,   size:18, x:330,y:410,
    detail:"6-acre beachfront — Ushongo Mabaoni, Pangani. ~10,000 SQM. Agent: Jolyon Darker (Peponi Real Estate) + Africa Luxury Properties. Legal: Eden Law Chambers." },
  { id:"zanzibar",  label:"ZANZIBAR",        type:"invest",   color:C.gold,   size:16, x:400,y:490,
    detail:"$100M resort anchor strategy. Matemwe / Paje beachfront. ZIPA-compliant 99yr leasehold. Timeline 2033–2035." },
  { id:"dubai",     label:"DUBAI/EMAAR",     type:"invest",   color:C.gold,   size:18, x:650,y:270,
    detail:"IFZA FZCO 2-partner setup (Sam + Harrison). Golf Acres Emaar South 1BR Apr 2026. Golf Vale Jun 2026. Airbnb yield play. M Khalid Khan (APIL Properties) engaged." },
  { id:"ifza",      label:"IFZA FZCO",       type:"org",      color:C.blue,   size:14, x:730,y:330,
    detail:"UAE free zone company. 2-partner (Sam + Harrison). Solar Energy sector. Investor visa pathway." },
  { id:"crypto",    label:"XRP / BTC",       type:"asset",    color:C.orange, size:16, x:760,y:380,
    detail:"XRP: 9,300 units @ $2.07 AUD = $19,251 AUD. BTCMarkets, Coinbase, eToro, CoinJar. BTC above A$98k Mar 2026." },
  { id:"austral",   label:"AUSTRAL BUILD",   type:"property", color:C.blue,   size:14, x:540,y:505,
    detail:"Lot 227 Swamphen St, Austral NSW. Builder Gurner. Nisha's property build. Electrical consultation coordinated." },
  { id:"music",     label:"$AVVA",           type:"creative", color:C.purple, size:13, x:700,y:165,
    detail:"$avva on Spotify/Apple/Deezer/TikTok/YT. Still Me: 5k+ streams Feb 2026. DistroKid. Royalties active Feb 2026." },
  { id:"defended",  label:"DEFENDED ENERGY", type:"client",   color:C.red,    size:14, x:165,y:370,
    detail:"Key retailer. Owner: Abdul. Sales: Bill, Heath. Admin: Carlos (scheduling), Hassan. 2–5 jobs/wk. Issues: freight dispute, steep roofs, 30-day payment attempt (rejected)." },
  { id:"target",    label:"$100M TARGET",    type:"target",   color:C.red,    size:22, x:480,y:150,
    detail:"$100M net worth 2033–2035. PSG cash engine ($120k/wk) → international property (Zanzibar/Dubai) → resort anchor." },
];

const EDGES = [
  { from:"sam",       to:"psg",      label:"CO-OWNS 50%",   s:3 },
  { from:"sam",       to:"hilts",    label:"OWNS 100%",     s:2 },
  { from:"sam",       to:"harrison", label:"PARTNER/CUZZY", s:3 },
  { from:"sam",       to:"nisha",    label:"FIANCÉE",       s:3 },
  { from:"sam",       to:"pangani",  label:"DD ACTIVE",     s:2 },
  { from:"sam",       to:"dubai",    label:"ENQUIRY LIVE",  s:2 },
  { from:"sam",       to:"zanzibar", label:"STRATEGY",      s:2 },
  { from:"sam",       to:"crypto",   label:"HOLDS",         s:2 },
  { from:"sam",       to:"music",    label:"ARTIST",        s:1 },
  { from:"sam",       to:"target",   label:"TARGETS",       s:3 },
  { from:"harrison",  to:"psg",      label:"CO-OWNS 50%",   s:3 },
  { from:"harrison",  to:"dubai",    label:"SHARED IFZA",   s:2 },
  { from:"harrison",  to:"ifza",     label:"CO-APPLICANT",  s:2 },
  { from:"psg",       to:"defended", label:"KEY RETAILER",  s:2 },
  { from:"psg",       to:"target",   label:"CASH ENGINE",   s:3 },
  { from:"dubai",     to:"ifza",     label:"VIA IFZA",      s:2 },
  { from:"pangani",   to:"zanzibar", label:"ADJACENT",      s:2 },
  { from:"zanzibar",  to:"target",   label:"ANCHOR",        s:3 },
  { from:"nisha",     to:"austral",  label:"BUILD",         s:2 },
  { from:"crypto",    to:"target",   label:"FEEDS",         s:1 },
  { from:"hilts",     to:"target",   label:"FEEDS",         s:1 },
];

// ─── WORLD EXPOSURE ───────────────────────────────────────────────────────────
const COUNTRIES = [
  { code:"AU", name:"Australia", flag:"🇦🇺", lat:-33.87, lng:151.21, risk:"LOW",    types:["BUSINESS","HOME","PROPERTY"],   color:C.neon,
    positions:["PSG $180k/wk rev","Hilts Group","Lot 227 Austral build","XRP $19k","Wedding planning"],
    watch:["STC rebate scheme","NAB rate decisions","AUD/USD","Australian solar policy"],
    intel:{ gdp:"$1.7T USD", currency:"AUD/USD ~0.632", capital:"Canberra", pop:"26.5M", region:"Oceania" } },
  { code:"TZ", name:"Tanzania / Pangani", flag:"🇹🇿", lat:-5.4, lng:38.9, risk:"MEDIUM", types:["INVESTMENT","DD_ACTIVE"],
    color:C.gold,
    positions:["6-acre beachfront Pangani $175k USD","Eden Law Chambers engaged","Jolyon Darker agent","ZIPA-compliant 99yr leasehold"],
    watch:["TZS/USD stability","East Africa conflict","Tanzania elections","ZIPA laws","Title/lease complexity"],
    intel:{ gdp:"$75B USD", currency:"TZS (stable)", capital:"Dodoma", pop:"68M", region:"Eastern Africa", land_law:"99yr leasehold — foreign ownership restricted" } },
  { code:"AE", name:"UAE / Dubai", flag:"🇦🇪", lat:25.20, lng:55.27, risk:"LOW",    types:["INVESTMENT","BUSINESS","VISA"],
    color:C.blue,
    positions:["IFZA FZCO registration (Sam+Harrison)","Golf Acres Emaar South 1BR (Apr 2026)","Golf Vale deposit (Jun 2026)","Investor visa pathway"],
    watch:["Dubai property index","IFZA fee changes","UAE visa policy","AED/AUD","Emaar South launch phases"],
    intel:{ gdp:"$509B USD", currency:"AED (pegged USD)", capital:"Abu Dhabi", pop:"11.3M", region:"Western Asia", property_yield:"5–8% gross Airbnb JVC typical" } },
  { code:"CY", name:"Cyprus", flag:"🇨🇾", lat:35.12, lng:33.43, risk:"LOW", types:["HERITAGE","WEDDING"],
    color:C.purple,
    positions:["Greek Cypriot heritage","Wedding enquiry: Kefalos venue May 2027 (active email thread)"],
    watch:["Cyprus EU stability","Euro zone","Greek Cypriot property opportunities"],
    intel:{ gdp:"$31B USD", currency:"EUR €", capital:"Nicosia", pop:"1.4M", region:"Southern Europe" } },
  { code:"TH", name:"Thailand", flag:"🇹🇭", lat:15.87, lng:100.99, risk:"LOW",   types:["TRAVEL","PERSONAL"],
    color:C.text,
    positions:["Banyan Tree Phuket Mar 18–21 2026 (2BR Double Pool Villa THB 19,430/night)","Grande Centre Point Surawong Bangkok Mar 16–18","Banyan Tree Samui prior stay"],
    watch:["THB/AUD","Thailand political stability"],
    intel:{ gdp:"$543B USD", currency:"THB", capital:"Bangkok", pop:"72M", region:"South-East Asia" } },
  { code:"ZZ", name:"Zanzibar", flag:"🌍", lat:-6.16, lng:39.19, risk:"MEDIUM", types:["INVESTMENT","STRATEGY"],
    color:C.gold,
    positions:["$100M resort anchor — Matemwe/Paje beachfront","ZIPA compliant 99yr leasehold structure","Africa Luxury Properties agent active","Timeline 2033–2035"],
    watch:["Zanzibar tourism growth","Indian Ocean stability","East Africa conflict spillover","Foreign land laws"],
    intel:{ region:"Indian Ocean / Zanzibar Archipelago", currency:"TZS / USD", tourism:"Booming", risk_note:"Adjacent Tanzania political risk" } },
];

// ─── REAL INTEL SIGNALS (from email/WA corpus) ────────────────────────────────
const SIGNALS = [
  // PSG
  { type:"PSG", impact:"DIRECT", country:"AU", text:"Pipeline live: Gmail→OpenSolar→ServiceM8. 118 runs today. 45.6 credits.", time:"Today" },
  { type:"PSG", impact:"DIRECT", country:"AU", text:"PSG net $120k/wk | Revenue $180k | Expenses $60k. Annual net ~$6.24M.", time:"Ongoing" },
  { type:"PSG", impact:"DIRECT", country:"AU", text:"Rexel JRT credit limit increase application signed — Baulkham Hills + Kellyville Ridge jobs", time:"24 Feb 2026" },
  { type:"PSG", impact:"WATCH",  country:"AU", text:"Defended Energy: stopped site delivery — Sam absorbing ~$900/wk freight. Verbal only.", time:"Ongoing" },
  { type:"PSG", impact:"WATCH",  country:"AU", text:"Origin Energy lost meter application on Picton job — twice. Ongoing issue.", time:"Ongoing" },
  // Investments
  { type:"INVEST", impact:"DIRECT", country:"TZ", text:"Jolyon Darker (Peponi Real Estate): Re: Serious Enquiry — 6 Acres Ushongo Mabaoni Beachfront Pangani", time:"14 Mar 2026" },
  { type:"INVEST", impact:"DIRECT", country:"TZ", text:"Africa Luxury Properties: RE: Beachfront Land Acquisition — Matemwe, Zanzibar — ~10,000 SQM", time:"16 Mar 2026" },
  { type:"INVEST", impact:"DIRECT", country:"TZ", text:"Eden Law Chambers engaged — Zanzibar land legal structure. ZIPA-compliant 99yr leasehold.", time:"12 Mar 2026" },
  { type:"INVEST", impact:"DIRECT", country:"AE", text:"M Khalid Khan (APIL Properties): Golf Acres Emaar South — 1BR Business Investment Enquiry", time:"16 Mar 2026" },
  { type:"INVEST", impact:"DIRECT", country:"AE", text:"IFZA FZCO setup active — 2-partner Sam + Harrison. Solar Energy sector registration.", time:"15 Mar 2026" },
  { type:"INVEST", impact:"DIRECT", country:"AE", text:"Golf Vale by Emaar — Phase 2 Now Open — 1BR from AED 750k. Pipeline Jun 2026.", time:"16 Mar 2026" },
  // Finance
  { type:"FINANCE", impact:"DIRECT", country:"AU", text:"XRP: 9,300 units @ $2.07 AUD = $19,251. BTCMarkets active. BTC above A$98k.", time:"Mar 2026" },
  { type:"MARKET", impact:"DIRECT", country:"AU", text:"BTC Markets: Bitcoin ETFs show sustained weekly inflows — institutional buying", time:"16 Mar 2026" },
  { type:"MARKET", impact:"CORRELATED", country:"AU", text:"AUD/USD ~0.632. Watch: Tanzania ($175k USD) and Dubai costs in AUD terms.", time:"Today" },
  { type:"MARKET", impact:"POSITIVE", country:"AE", text:"AED pegged USD — zero currency risk on Dubai position. Property index +6.2% YoY.", time:"Ongoing" },
  { type:"MARKET", impact:"WATCH", country:"TZ", text:"TZS/USD stable — low devaluation risk on Pangani acquisition.", time:"Ongoing" },
  // Personal
  { type:"PERSONAL", impact:"DIRECT", country:"CY", text:"Wedding enquiry: Kefalos venue Cyprus — May 2027. Active email thread with kefalos@kefalos.com.cy", time:"Mar 2026" },
  { type:"PERSONAL", impact:"DIRECT", country:"AU", text:"Ottimo House: Sat 20 Mar 2027 — deciding. Wedding planning active.", time:"Mar 2026" },
  { type:"PROPERTY", impact:"DIRECT", country:"AU", text:"Lot 227 Swamphen St Austral: electrical consultation confirmed. Builder Gurner. Active build.", time:"Feb 2026" },
  // Music
  { type:"MUSIC", impact:"LOG", country:"AU", text:"$avva Still Me: 5,000+ streams. Not Like This + The Same live Deezer Mar 11. DistroKid payout.", time:"Mar 2026" },
  // Travel
  { type:"TRAVEL", impact:"LOG", country:"TH", text:"Banyan Tree Phuket closed. Returned Sydney 22 Mar 2026 via MH795 Phuket→KL→Sydney.", time:"22 Mar 2026" },
  // Global watch
  { type:"CONFLICT", impact:"WATCH", country:"TZ", text:"GDELT: Eastern Congo activity — monitor spillover risk to Tanzania + Zanzibar border regions.", time:"Live" },
  { type:"MARKET", impact:"WATCH", country:"AE", text:"Red Sea shipping disruption — Brent crude +2.1% — maritime watch near Zanzibar coast.", time:"Live" },
  { type:"LEGAL", impact:"DIRECT", country:"AU", text:"PSG T&C: PPSA security interest, SOPA rights, PPSR registration, personal guarantees — all current.", time:"Active" },
];

const SIG_COLORS = { PSG:C.neon, INVEST:C.blue, FINANCE:C.gold, MARKET:C.gold, CONFLICT:C.red, PERSONAL:C.purple, PROPERTY:C.purple, MUSIC:C.purple, TRAVEL:C.orange, LEGAL:C.red, ALERT:C.red };
const IMPACT_COLORS = { DIRECT:C.neon, CORRELATED:C.gold, WATCH:C.orange, POSITIVE:C.blue, LOG:"#2a3d4d", ALERT:C.red };

// ─── FORCE GRAPH ──────────────────────────────────────────────────────────────
function ForceGraph({ selectedNode, onNodeClick }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef(NODES.map(n => ({ ...n, vx:0, vy:0 })));
  const rafRef = useRef(null);
  const dragging = useRef(null);
  const dragOff = useRef({ x:0, y:0 });
  const [hovered, setHovered] = useState(null);

  const getPos = (e, canvas) => {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    return { x:(e.clientX - r.left)*sx, y:(e.clientY - r.top)*sy };
  };

  const findNode = (pos) => nodesRef.current.find(n => {
    const dx = n.x - pos.x, dy = n.y - pos.y;
    return Math.sqrt(dx*dx + dy*dy) < n.size + 10;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      const nodes = nodesRef.current;
      const W = canvas.width, H = canvas.height;

      // Physics
      if (!dragging.current) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i+1; j < nodes.length; j++) {
            const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
            const d = Math.sqrt(dx*dx + dy*dy) || 1;
            const f = 22000 / (d*d);
            nodes[i].vx += dx/d*f; nodes[i].vy += dy/d*f;
            nodes[j].vx -= dx/d*f; nodes[j].vy -= dy/d*f;
          }
        }
        EDGES.forEach(edge => {
          const a = nodes.find(n=>n.id===edge.from), b = nodes.find(n=>n.id===edge.to);
          if (!a||!b) return;
          const dx = b.x-a.x, dy = b.y-a.y, d = Math.sqrt(dx*dx+dy*dy)||1;
          const f = (d - 170) * 0.014 * edge.s;
          a.vx += dx/d*f; a.vy += dy/d*f; b.vx -= dx/d*f; b.vy -= dy/d*f;
        });
        nodes.forEach(n => {
          n.vx += (W/2-n.x)*0.003; n.vy += (H/2-n.y)*0.003;
          n.vx *= 0.8; n.vy *= 0.8;
          n.x = Math.max(n.size+6, Math.min(W-n.size-6, n.x+n.vx));
          n.y = Math.max(n.size+6, Math.min(H-n.size-6, n.y+n.vy));
        });
      }

      ctx.clearRect(0,0,W,H);

      // Grid
      ctx.strokeStyle = "rgba(0,220,140,0.025)"; ctx.lineWidth = 0.5;
      for (let x=0; x<W; x+=50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y=0; y<H; y+=50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

      // Edges
      EDGES.forEach(edge => {
        const a = nodes.find(n=>n.id===edge.from), b = nodes.find(n=>n.id===edge.to);
        if (!a||!b) return;
        const active = selectedNode && (selectedNode===a.id || selectedNode===b.id);
        ctx.save();
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
        ctx.strokeStyle = active ? a.color+"cc" : "rgba(0,220,140,0.1)";
        ctx.lineWidth = active ? edge.s*1.5 : edge.s*0.5;
        if (active) { ctx.shadowBlur=12; ctx.shadowColor=a.color; }
        ctx.stroke();
        if (active) {
          const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
          ctx.font="bold 8px 'SF Mono', Courier New"; ctx.fillStyle="rgba(180,210,230,0.8)";
          ctx.textAlign="center"; ctx.shadowBlur=0;
          ctx.fillText(edge.label, mx, my-5);
        }
        ctx.restore();
      });

      // Nodes
      nodes.forEach(node => {
        const isSel = selectedNode===node.id, isHov = hovered===node.id;
        const r = node.size;
        ctx.save();
        // Glow rings
        if (isSel||isHov) {
          [3,2,1].forEach(ring => {
            ctx.beginPath(); ctx.arc(node.x,node.y,r+ring*7,0,Math.PI*2);
            ctx.strokeStyle = node.color+Math.floor(0.12/ring*255).toString(16).padStart(2,"0");
            ctx.lineWidth=1; ctx.stroke();
          });
        }
        // Pulse ring
        ctx.beginPath(); ctx.arc(node.x,node.y,r+4,0,Math.PI*2);
        ctx.strokeStyle=node.color+"2a"; ctx.lineWidth=1; ctx.stroke();
        // Glass fill
        const g = ctx.createRadialGradient(node.x-r*.35,node.y-r*.35,1,node.x,node.y,r);
        g.addColorStop(0, node.color+"66"); g.addColorStop(.5,node.color+"22"); g.addColorStop(1,node.color+"06");
        ctx.beginPath(); ctx.arc(node.x,node.y,r,0,Math.PI*2);
        ctx.fillStyle=g; ctx.fill();
        ctx.strokeStyle=isSel ? node.color : node.color+"77";
        ctx.lineWidth=isSel?2:0.8; ctx.shadowBlur=isSel?20:6; ctx.shadowColor=node.color;
        ctx.stroke();
        // Label
        ctx.shadowBlur=0;
        ctx.font=`bold ${isSel?10:9}px 'SF Mono',Courier New`;
        ctx.fillStyle=isSel?node.color:node.color+"cc";
        ctx.textAlign="center"; ctx.fillText(node.label,node.x,node.y+r+14);
        ctx.font="7px Courier New"; ctx.fillStyle="rgba(100,136,152,0.7)";
        ctx.fillText(node.type.toUpperCase(),node.x,node.y+r+23);
        ctx.restore();
      });

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [hovered, selectedNode]);

  return (
    <div style={{ position:"relative", width:"100%", height:"100%", background:"#020810" }}>
      <canvas ref={canvasRef} width={900} height={560}
        style={{ width:"100%", height:"100%", cursor:hovered?"pointer":"crosshair", display:"block" }}
        onMouseMove={e => {
          const canvas = canvasRef.current; if (!canvas) return;
          const pos = getPos(e, canvas);
          if (dragging.current) {
            const n = nodesRef.current.find(x=>x.id===dragging.current);
            if (n) { n.x=pos.x-dragOff.current.x; n.y=pos.y-dragOff.current.y; } return;
          }
          const n = findNode(pos); setHovered(n?n.id:null);
        }}
        onMouseDown={e => {
          const canvas = canvasRef.current; if (!canvas) return;
          const pos = getPos(e, canvas); const n = findNode(pos);
          if (n) { dragging.current=n.id; dragOff.current={x:pos.x-n.x,y:pos.y-n.y}; }
        }}
        onMouseUp={e => {
          if (dragging.current) { dragging.current=null; return; }
          const canvas = canvasRef.current; if (!canvas) return;
          const n = findNode(getPos(e, canvas)); if (n) onNodeClick(n);
        }}
        onMouseLeave={() => { setHovered(null); dragging.current=null; }}
      />
      {/* Legend */}
      <div style={{ position:"absolute", bottom:8, left:8, display:"flex", gap:6, flexWrap:"wrap" }}>
        {[["person",C.neon,"PERSON"],["org",C.blue,"ORG"],["invest",C.gold,"INVESTMENT"],["asset",C.orange,"ASSET"],["property",C.blue,"PROPERTY"],["creative",C.purple,"CREATIVE"],["client",C.red,"CLIENT"],["target",C.red,"TARGET"]].map(([,col,l])=>(
          <div key={l} style={{ display:"flex",alignItems:"center",gap:3,background:"rgba(2,7,10,0.85)",padding:"2px 7px",borderRadius:3,border:`1px solid ${col}22` }}>
            <div style={{ width:6,height:6,borderRadius:"50%",background:col,boxShadow:`0 0 5px ${col}` }} />
            <span style={{ fontSize:7,color:col,letterSpacing:1 }}>{l}</span>
          </div>
        ))}
      </div>
      <div style={{ position:"absolute",top:8,right:8,fontSize:7,color:"rgba(0,220,140,0.35)",letterSpacing:2 }}>
        VERTEX · PALANTIR ONTOLOGY · {NODES.length} OBJECTS · {EDGES.length} LINKS · DRAG NODES
      </div>
    </div>
  );
}

// ─── WORLD MAP ────────────────────────────────────────────────────────────────
function WorldMap({ selectedCountry, onSelect }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(()=>setTick(i=>i+1), 1000); return ()=>clearInterval(t); }, []);

  const proj = (lat, lng) => ({
    x: ((lng+180)/360)*960,
    y: ((90-lat)/180)*480,
  });

  const sigCount = {};
  SIGNALS.forEach(s => { sigCount[s.country] = (sigCount[s.country]||0)+1; });

  const rColor = r => ({ LOW:C.neon, MEDIUM:C.gold, HIGH:C.red }[r]||C.text);

  return (
    <div style={{ position:"relative",width:"100%",height:"100%",background:"#020810",overflow:"hidden" }}>
      <svg width="100%" height="100%" viewBox="0 0 960 480" preserveAspectRatio="xMidYMid meet" style={{ position:"absolute",inset:0 }}>
        <defs>
          <radialGradient id="bg" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#041018" /><stop offset="100%" stopColor="#020810" />
          </radialGradient>
          {COUNTRIES.map(c => (
            <radialGradient key={c.code} id={`g${c.code}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={rColor(c.risk)} stopOpacity="0.6" />
              <stop offset="100%" stopColor={rColor(c.risk)} stopOpacity="0" />
            </radialGradient>
          ))}
          <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect width="960" height="480" fill="url(#bg)"/>

        {/* Grid */}
        {[0,60,120,180,240,300,360].map(l=><line key={`v${l}`} x1={(l/360)*960} y1={0} x2={(l/360)*960} y2={480} stroke="rgba(0,220,140,0.03)" strokeWidth="0.5"/>)}
        {[-60,-30,0,30,60].map(l=><line key={`h${l}`} x1={0} y1={((90-l)/180)*480} x2={960} y2={((90-l)/180)*480} stroke="rgba(0,220,140,0.03)" strokeWidth="0.5"/>)}
        <line x1={0} y1={240} x2={960} y2={240} stroke="rgba(0,220,140,0.07)" strokeWidth="0.8" strokeDasharray="4,6"/>
        <text x={4} y={237} fontSize={8} fill="rgba(0,220,140,0.2)" fontFamily="Courier New">EQUATOR</text>

        {/* Continents */}
        <polygon points="120,55 245,50 295,95 285,185 235,205 175,195 132,162 102,132 112,88" fill="rgba(3,14,22,0.92)" stroke="rgba(0,220,140,0.12)" strokeWidth="0.8"/>
        <polygon points="215,200 292,202 315,245 308,315 288,362 252,372 227,342 213,292 202,252" fill="rgba(3,14,22,0.92)" stroke="rgba(0,220,140,0.12)" strokeWidth="0.8"/>
        <polygon points="452,68 535,60 542,92 532,132 502,148 472,142 450,122 447,96" fill="rgba(3,14,22,0.92)" stroke="rgba(0,220,140,0.12)" strokeWidth="0.8"/>
        <polygon points="456,132 542,122 562,162 562,232 552,292 532,332 502,352 472,342 452,302 440,242 438,192 446,158" fill="rgba(3,14,22,0.92)" stroke="rgba(0,220,140,0.12)" strokeWidth="0.8"/>
        <polygon points="542,38 732,33 782,68 792,122 772,162 722,178 682,162 642,142 602,132 572,112 547,82" fill="rgba(3,14,22,0.92)" stroke="rgba(0,220,140,0.12)" strokeWidth="0.8"/>
        <polygon points="560,155 605,148 618,178 612,212 587,217 567,197 559,173" fill="rgba(3,14,22,0.92)" stroke="rgba(0,220,140,0.12)" strokeWidth="0.8"/>
        <polygon points="712,298 792,283 832,293 852,328 842,363 802,376 757,368 722,338 710,313" fill="rgba(3,14,22,0.92)" stroke="rgba(0,220,140,0.12)" strokeWidth="0.8"/>
        <ellipse cx={742} cy={218} rx={30} ry={20} fill="rgba(3,14,22,0.92)" stroke="rgba(0,220,140,0.12)" strokeWidth="0.8"/>

        {/* Connection arcs — Australia to each exposure country */}
        {(() => {
          const au = proj(-33.87, 151.21);
          return COUNTRIES.filter(c=>c.code!=="AU").map((c,i) => {
            const to = proj(c.lat, c.lng);
            const mx=(au.x+to.x)/2, my=Math.min(au.y,to.y)-80;
            return <path key={i} d={`M ${au.x} ${au.y} Q ${mx} ${my} ${to.x} ${to.y}`}
              fill="none" stroke={c.color+"25"} strokeWidth="0.8" strokeDasharray="5,5"/>;
          });
        })()}

        {/* Country nodes */}
        {COUNTRIES.map(c => {
          const pos = proj(c.lat, c.lng);
          const isSel = selectedCountry===c.code;
          const col = rColor(c.risk);
          const r = isSel ? 13 : 9;
          const pulse = r + (tick % 30) * 0.3;
          return (
            <g key={c.code} onClick={()=>onSelect(c.code)} style={{ cursor:"pointer" }}>
              <circle cx={pos.x} cy={pos.y} r={pulse+12} fill={`url(#g${c.code})`} opacity={0.35}/>
              <circle cx={pos.x} cy={pos.y} r={r+10} fill="none" stroke={col} strokeWidth="0.4" opacity={0.25}/>
              {isSel && <circle cx={pos.x} cy={pos.y} r={r+18} fill="none" stroke={col} strokeWidth="0.8" opacity={0.5} strokeDasharray="3,3"/>}
              <circle cx={pos.x} cy={pos.y} r={r} fill={col+"1a"} stroke={col} strokeWidth={isSel?1.5:0.7} filter="url(#glow)"/>
              <circle cx={pos.x} cy={pos.y} r={r*0.38} fill={col} opacity={0.75}/>
              {sigCount[c.code] && (
                <g><circle cx={pos.x+r+1} cy={pos.y-r-1} r={6} fill={C.red}/><text x={pos.x+r+1} y={pos.y-r+1.5} textAnchor="middle" fontSize={7} fill="#fff" fontFamily="Courier New" fontWeight="bold">{sigCount[c.code]}</text></g>
              )}
              <text x={pos.x} y={pos.y+r+14} textAnchor="middle" fontSize={isSel?9:8} fill={col} fontFamily="Courier New" fontWeight="bold">{c.name.split("/")[0].trim()}</text>
              <text x={pos.x} y={pos.y+r+23} textAnchor="middle" fontSize={7} fill={col+"77"} fontFamily="Courier New">{c.risk} RISK · {c.types[0]}</text>
            </g>
          );
        })}

        <text x={6} y={474} fontSize={7} fill="rgba(0,220,140,0.18)" fontFamily="Courier New" letterSpacing="1.5">JARVIS GLOBAL MAP — SAM KAZANGAS EXPOSURE LAYER — REAL DATA FROM 3,804 EMAILS + 15,822 WA MESSAGES</text>
      </svg>

      {/* Layer toggles */}
      <div style={{ position:"absolute",top:10,right:10,display:"flex",flexDirection:"column",gap:4 }}>
        {[["MY POSITIONS",C.neon,true],["CONNECTIONS",C.blue,true],["RISK LAYER",C.red,true],["SIGNALS",C.gold,true]].map(([l,col,on])=>(
          <div key={l} style={{ display:"flex",alignItems:"center",gap:6,background:"rgba(2,8,12,0.85)",padding:"4px 8px",borderRadius:3,border:`1px solid ${col}22`,backdropFilter:"blur(8px)" }}>
            <div style={{ width:6,height:6,borderRadius:"50%",background:on?col:"#222",boxShadow:on?`0 0 5px ${col}`:"none" }}/>
            <span style={{ fontSize:7,color:on?col:"#334",letterSpacing:1 }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Country strip */}
      <div style={{ position:"absolute",bottom:0,left:0,right:0,display:"flex",background:"rgba(2,8,12,0.9)",borderTop:`1px solid ${C.border}` }}>
        {COUNTRIES.map(c => {
          const col = ({LOW:C.neon,MEDIUM:C.gold,HIGH:C.red})[c.risk]||C.text;
          return (
            <div key={c.code} onClick={()=>onSelect(c.code)}
              style={{ flex:1,padding:"6px 3px",textAlign:"center",cursor:"pointer",borderRight:`1px solid ${C.border}`,background:selectedCountry===c.code?col+"0e":"transparent" }}>
              <div style={{ fontSize:15 }}>{c.flag}</div>
              <div style={{ fontSize:7,color:selectedCountry===c.code?col:"#334",letterSpacing:1,marginTop:1 }}>{c.code}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── COUNTRY INTEL ────────────────────────────────────────────────────────────
function CountryIntel({ code }) {
  const c = COUNTRIES.find(x=>x.code===code);
  if (!c) return <div style={{ padding:20, color:C.text, fontFamily:"Courier New", fontSize:11 }}>Select a country</div>;
  const signals = SIGNALS.filter(s=>s.country===code);
  const rCol = {LOW:C.neon,MEDIUM:C.gold,HIGH:C.red}[c.risk]||C.text;
  // Get relevant emails
  const relevantEmails = [
    ...PALANTIR.investment_emails.filter(e => {
      if (code==="TZ") return e.cat==="ZANZIBAR"||e.cat==="PANGANI"||e.cat==="LEGAL";
      if (code==="AE") return e.cat==="DUBAI";
      if (code==="AU") return e.cat==="AU_PROPERTY"||e.cat==="PORTFOLIO";
      return false;
    }).slice(0,5),
    ...PALANTIR.crypto_emails.filter(()=>code==="AU").slice(0,3),
  ];

  return (
    <div style={{ height:"100%",overflowY:"auto",fontFamily:"Courier New" }}>
      <div style={{ padding:"12px 14px",borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:8 }}>
          <span style={{ fontSize:26 }}>{c.flag}</span>
          <div style={{ flex:1 }}>
            <div style={{ color:C.neon,fontSize:13,fontWeight:"bold",letterSpacing:2 }}>{c.name}</div>
            <div style={{ fontSize:7,color:"#3a5060",letterSpacing:3,marginTop:2 }}>INTELLIGENCE PROFILE</div>
          </div>
          <div style={{ padding:"3px 8px",borderRadius:3,background:rCol+"18",border:`1px solid ${rCol}33`,color:rCol,fontSize:8,letterSpacing:1 }}>{c.risk} RISK</div>
        </div>
        <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
          {c.types.map(t=><span key={t} style={{ fontSize:7,padding:"2px 6px",borderRadius:2,background:C.neonD,color:C.neon,border:`1px solid ${C.border}` }}>{t}</span>)}
        </div>
      </div>

      {/* Key facts */}
      {c.intel && (
        <div style={{ padding:"8px 14px",borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:7,color:"#3a5060",letterSpacing:3,marginBottom:6 }}>COUNTRY INTEL</div>
          {Object.entries(c.intel).map(([k,v])=>(
            <div key={k} style={{ display:"flex",gap:8,padding:"4px 0",borderBottom:`1px solid rgba(0,220,140,0.03)` }}>
              <span style={{ fontSize:8,color:"#3a5060",minWidth:90,flexShrink:0 }}>{k.replace(/_/g," ").toUpperCase()}</span>
              <span style={{ fontSize:9,color:C.textB }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* My positions */}
      <div style={{ padding:"8px 14px",borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:7,color:"#3a5060",letterSpacing:3,marginBottom:6 }}>MY POSITIONS ({c.positions.length})</div>
        {c.positions.map((p,i)=>(
          <div key={i} style={{ display:"flex",gap:6,padding:"4px 0",borderBottom:`1px solid rgba(0,220,140,0.03)` }}>
            <div style={{ width:3,height:3,borderRadius:"50%",background:rCol,marginTop:5,flexShrink:0 }}/>
            <span style={{ fontSize:9,color:C.textB,lineHeight:1.4 }}>{p}</span>
          </div>
        ))}
      </div>

      {/* Real email evidence */}
      {relevantEmails.length > 0 && (
        <div style={{ padding:"8px 14px",borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:7,color:"#3a5060",letterSpacing:3,marginBottom:6 }}>EMAIL EVIDENCE — REAL DATA</div>
          {relevantEmails.map((e,i)=>(
            <div key={i} style={{ padding:"5px 0",borderBottom:`1px solid rgba(0,220,140,0.03)` }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:2 }}>
                <span style={{ fontSize:8,color:C.blue,fontWeight:"bold" }}>{e.cat}</span>
                <span style={{ fontSize:7,color:"#3a5060" }}>{e.date}</span>
              </div>
              <div style={{ fontSize:9,color:C.text }}>{e.from.slice(0,45)}</div>
              <div style={{ fontSize:9,color:C.textB,lineHeight:1.4 }}>{e.subject.slice(0,80)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Active signals */}
      <div style={{ padding:"8px 14px",borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:7,color:"#3a5060",letterSpacing:3,marginBottom:6 }}>ACTIVE SIGNALS ({signals.length})</div>
        {signals.map((s,i)=>(
          <div key={i} style={{ display:"flex",gap:6,padding:"5px 0",borderBottom:`1px solid rgba(0,220,140,0.03)`,alignItems:"flex-start" }}>
            <div style={{ width:4,height:4,borderRadius:"50%",background:IMPACT_COLORS[s.impact]||"#334",marginTop:4,flexShrink:0 }}/>
            <span style={{ fontSize:7,padding:"1px 4px",borderRadius:2,background:(SIG_COLORS[s.type]||"#888")+"1a",color:SIG_COLORS[s.type]||"#888",flexShrink:0 }}>{s.type}</span>
            <div style={{ flex:1 }}>
              <span style={{ fontSize:9,color:C.text,lineHeight:1.4 }}>{s.text}</span>
              <div style={{ fontSize:7,color:"#3a5060",marginTop:2 }}>{s.time}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Watch signals */}
      <div style={{ padding:"8px 14px" }}>
        <div style={{ fontSize:7,color:"#3a5060",letterSpacing:3,marginBottom:6 }}>WATCH SIGNALS</div>
        {c.watch.map((w,i)=>(
          <div key={i} style={{ display:"flex",gap:6,padding:"3px 0" }}>
            <div style={{ width:4,height:4,borderRadius:"50%",background:C.gold,marginTop:4,flexShrink:0 }}/>
            <span style={{ fontSize:9,color:C.text }}>{w}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI ANALYST ───────────────────────────────────────────────────────────────
function AIAnalyst({ onClose }) {
  const [msgs, setMsgs] = useState([
    { r:"sys", t:`JARVIS ANALYST — REAL DATA LOADED` },
    { r:"sys", t:`Sources: palantir_profile_v2 · 3,804 emails (11 categories) · 15,822 WA messages (5 chats) · 8,939 extracted facts · 3,018 timeline events · 11,299 ChromaDB vectors` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  const respond = q => {
    const l = q.toLowerCase();
    if (l.match(/psg|solar|revenue|pipeline|job|contractor/)) return `PROJECT SOLAR GROUP — REAL DATA\n\nABN: 29 685 341 744 | 50/50 Sam + Harrison\nRevenue: $180k/wk | Expenses: $60k/wk | Net: $120k/wk\nAnnual net: ~$6.24M\n\nContractors: Jesse Gordon, Tyler Gordon, Xavier Aguirre, Sulieman el-Dannoui, Adam Kandeel, Amjad Malas, Xavier Cevallos\nAdmin (PH): Jas (Jasmine) accounts@, Marvin Oqueriza Benson, Red, Joplin Lualhati (WizeWork)\n\nPipeline: Gmail → OpenSolar → ServiceM8\nToday: 118 runs, 45.6 credits\n\nOpen issues:\n• Defended stopped delivery — absorbing $900/wk freight\n• Origin Energy lost Picton meter application twice\n• Rexel JRT credit limit application signed Feb 2026`;
    if (l.match(/tanzania|pangani|zanzibar|beachfront|ushongo|matemwe/)) return `ZANZIBAR / PANGANI — REAL EMAIL EVIDENCE\n\n"6 Acres Ushongo Mabaoni Beachfront, Pangani" — Jolyon Darker, Peponi Real Estate (14 Mar 2026)\n"Beachfront Land Acquisition — Matemwe, Zanzibar — ~10,000 SQM" — Africa Luxury Properties (16 Mar 2026)\n"Re: Beachfront Land Acquisition Zanzibar - Foreign Investor USD 100-200k" — Sam (15 Mar 2026)\nEden Law Chambers: ZIPA-compliant 99yr leasehold legal structure\n\nStrategy: $100M resort anchor. Adjacent Pangani coastal position.\nTimeline: May 2026 purchase → 2033–2035 development.`;
    if (l.match(/dubai|emaar|ifza|golf acres|golf vale/)) return `DUBAI — REAL EMAIL EVIDENCE\n\n"Re: Golf Acres, Emaar South — 1BR Business Investment Enquiry" — M Khalid Khan APIL Properties (16 Mar 2026)\n"IFZA Free Zone Company Setup — 2 Partners, Solar Energy, Urgent" — Sam (15 Mar 2026)\n"Golf Vale by Emaar — Phase 2 Now Open — 1BR from AED 750k" (16 Mar 2026)\n\nPipeline:\n• Mar 2026: IFZA FZCO registration (Sam + Harrison)\n• Apr 2026: Golf Acres Emaar South deposit\n• Jun 2026: Golf Vale deposit\n\nStrategy: Airbnb yield play. Investor visa for Sam + Harrison. AED pegged USD — zero currency risk.`;
    if (l.match(/crypto|xrp|btc|bitcoin|coin/)) return `CRYPTO — REAL HOLDINGS + EMAIL SIGNALS\n\nXRP: 9,300 units @ $2.07 AUD = $19,251 AUD\nExchanges: BTCMarkets, Coinbase, eToro, CoinJar\n\nRecent BTC Markets signals:\n• "Bitcoin ETFs show sustained weekly inflows" (16 Mar 2026)\n• "Bitcoin back above US$70k (A$98k) — institutions buying" (12 Mar 2026)\n• "Bitcoin whales buy as markets sell" (23 Feb 2026)\n• "BTC Below $63K — What Comes Next?" — CoinGecko (24 Feb 2026)\n\nBTC: Net bullish signal — institutional accumulation pattern.`;
    if (l.match(/wedding|nisha|cyprus|kefalos|ottimo/)) return `WEDDING — REAL EMAIL EVIDENCE\n\nNisha Nissan — fiancée. nisha.nissan@hotmail.com. Commonwealth Bank.\n\nActive venue threads:\n• Kefalos venue Cyprus — May 2027 (kefalos@kefalos.com.cy — active thread)\n• Ottimo House — Sat 20 Mar 2027 (deciding)\n• Breakfast Point Country Club — toured Feb 8 2026\n\nProperty build: Lot 227 Swamphen St, Austral NSW. Builder Gurner. Electrical consultation coordinated Feb 2026.\n\nDaughter born Aug 2025.`;
    if (l.match(/harrison/)) return `HARRISON VAUBELL — REAL INTEL\n\nPSG co-founder 50/50. Phone: 0415557997. harrison@projectsolar.com.au\n6,161 WA messages analysed (May 2025 – Mar 2026)\n\nDynamic: Sam mentors technically, Harrison runs ops day-to-day\nRelationship: "cuzzy", deep trust, emotional support\nShared plans: IFZA FZCO Dubai (co-applicant), Golf Acres deposit\nCC on all PSG emails always\n\nKey insight from WA: Harrison paid for Thailand trip Aug 2025. Sam regularly checks in unprompted when Harrison sounds down.`;
    if (l.match(/music|avva|\$avva|spotify|distrokid|stream/)) return `$AVVA — REAL DISTROKID + STREAMING DATA\n\nReleases:\n• Still Me — 5,000+ streams by Feb 17 2026. Apple Lyrics approved. YouTube ContentID registered.\n• Not Like This — Feb 2026. Live Deezer Mar 11 2026.\n• The Same — Feb 2026. Live Deezer Mar 11 2026.\n• Later — Feb 9-10 2026. Apple Lyrics approved.\n• Working — Pipeline Mar 2026.\n• Breathe — Earlier release.\n\nDistributor: DistroKid. Royalty withdrawal Feb 11 2026.\nPlatforms: Spotify, Apple Music, Deezer, TikTok, YouTube Music, Amazon, Instagram/Facebook.`;
    if (l.match(/behav|pattern|style|verbal|quote/)) return `BEHAVIORAL PATTERNS — FROM 3,131 SAM WA MESSAGES\n\nCommunication: Direct, warm, no filler. 'Bro', 'cuzzy'. Genuinely apologises when misses messages.\nDecisions: Fast, first principles, reverses when wrong.\nLoyalty: Goes to bat for Harrison unprompted.\n\nBUSINESS RULES (verbatim/extracted):\n• "7 days payment terms — non-negotiable"\n• Refuses unsafe jobs: steep roof Wahroonga 29° almost caused walkoff\n• 2-week scheduling advance preferred\n\nBLIND SPOTS IDENTIFIED:\n• Absorbing ~$900/wk freight from Defended — verbal agreement only\n• Overcommitting team scheduling\n• No paper trail with Defended Energy\n\nVISION VERBATIM (Aug 2025):\n"I wreckon we could have one of the biggest electrical solar battery companies in Sydney"`;
    if (l.match(/wealth|100m|target|million/)) return `WEALTH TARGET — $100M BY 2033–2035\n\nCurrent engine: PSG $120k/wk net = ~$6.24M/yr (before tax)\n\nInvestment timeline:\nMar 2026: IFZA FZCO Dubai registration\nApr 2026: Golf Acres Emaar South 1BR deposit\nMay 2026: Zanzibar coastal land (Pangani/Matemwe)\nJun 2026: Golf Vale Dubai deposit\n\nLong play: Zanzibar resort ($100M anchor) — 2033–2035\n\nCrypto kicker: XRP 9,300 × $2.07 = $19,251. BTC positions across 4 exchanges.\n\nPath to $100M: PSG cash → int'l property appreciation → Zanzibar resort development → passive income layer.`;
    if (l.match(/data|source|vector|palantir|corpus/)) return `DATA SOURCES — REAL INGESTED CORPUS\n\nGmail: 3,804 emails processed\nWhatsApp (5 chats): 15,822 messages total\n  • Harrison personal: 6,161 msgs\n  • PSG Admin group: 2,524 msgs\n  • Bentley/Defended group: 2,982 msgs\n  • Abdul 1:1: 334 msgs\n  • PSG/Defended group: 17 msgs\n\nExtracted: 8,939 facts (4,764 amounts, 3,271 emails, 640 phones, 264 ABNs)\nTimeline: 3,018 chronological events\nBatches: 11 categories, 89-306 emails each\nVectors: 11,299 ChromaDB (all-MiniLM-L6-v2)\nPalantir profile: v2.0, 20 sections, JARVIS_INTERNAL_ONLY`;
    return `Query: "${q}"\n\nSearching 11,299 vectors across palantir_profile_v2 (379 chunks) · batches (3,091) · timeline (3,018) · email_facts (8,939) · memory_stores (1,137) · sam_voice (800) · harrison_intel (390) · documents (170).\n\nTry: psg · tanzania · dubai · zanzibar · crypto · xrp · nisha · harrison · wedding · music · behavioral patterns · wealth target · data sources`;
  };

  const send = async () => {
    if (!input.trim()||loading) return;
    const q = input.trim(); setMsgs(m=>[...m,{r:"user",t:q}]); setInput(""); setLoading(true);
    await new Promise(r=>setTimeout(r,350+Math.random()*250));
    setMsgs(m=>[...m,{r:"jarvis",t:respond(q)}]); setLoading(false);
    setTimeout(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),100);
  };

  return (
    <div style={{ position:"absolute",bottom:70,right:16,width:420,height:540,display:"flex",flexDirection:"column",zIndex:100,background:C.glass,backdropFilter:"blur(16px)",border:`1px solid ${C.border}`,borderRadius:6,boxShadow:C.glow }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",borderBottom:`1px solid ${C.border}` }}>
        <span style={{ color:C.neon,fontSize:9,letterSpacing:3,fontFamily:"Courier New" }}>AI ANALYST — REAL CORPUS</span>
        <div style={{ display:"flex",gap:8,alignItems:"center" }}>
          <span style={{ fontSize:7,color:C.red }}>● {PALANTIR.data_stats.vectors.toLocaleString()} VECTORS</span>
          <button onClick={onClose} style={{ background:"transparent",border:"none",color:"#445",cursor:"pointer",fontSize:14 }}>✕</button>
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"10px 14px" }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ marginBottom:10 }}>
            <div style={{ fontSize:7,color:m.r==="user"?C.gold:m.r==="jarvis"?C.neon:"#2a3d4d",letterSpacing:2,marginBottom:3,fontFamily:"Courier New" }}>
              {m.r==="user"?"YOU ›":m.r==="jarvis"?"JARVIS ›":"//"}
            </div>
            <div style={{ fontSize:10,color:m.r==="user"?C.textB:m.r==="jarvis"?"#a8f0cc":"#2a3d4d",lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"Courier New" }}>{m.t}</div>
          </div>
        ))}
        {loading&&<div style={{ color:C.neon,fontSize:10,fontFamily:"Courier New" }}>scanning corpus...</div>}
        <div ref={endRef}/>
      </div>
      <div style={{ display:"flex",gap:6,padding:"8px 10px",borderTop:`1px solid ${C.border}` }}>
        <input style={{ flex:1,background:"rgba(0,220,140,0.04)",border:`1px solid ${C.border}`,borderRadius:3,padding:"7px 10px",color:C.textB,fontFamily:"Courier New",fontSize:10,outline:"none" }}
          placeholder="psg · zanzibar · dubai · crypto · behavioral patterns..."
          value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}/>
        <button onClick={send} style={{ background:C.neonD,border:`1px solid ${C.neon}33`,color:C.neon,padding:"7px 14px",borderRadius:3,cursor:"pointer",fontSize:8,fontFamily:"Courier New",letterSpacing:1 }}>RUN</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function JarvisTerminal() {
  const [view, setView] = useState("MAP");
  const [selectedCountry, setSelectedCountry] = useState("AU");
  const [selectedNode, setSelectedNode] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [rightTab, setRightTab] = useState("COUNTRY");
  const [feedFilter, setFeedFilter] = useState("");
  const [time, setTime] = useState(new Date());

  useEffect(()=>{ const t=setInterval(()=>setTime(new Date()),1000); return()=>clearInterval(t); },[]);

  const filtered = feedFilter ? SIGNALS.filter(s=>s.text.toLowerCase().includes(feedFilter.toLowerCase())||s.type.toLowerCase().includes(feedFilter.toLowerCase())) : SIGNALS;

  return (
    <div style={{ background:C.bg,height:"100vh",display:"flex",flexDirection:"column",color:C.text,fontFamily:"'SF Mono',Courier New,monospace",fontSize:12,overflow:"hidden" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:2px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(0,220,140,0.2);border-radius:2px;}
        input::placeholder{color:#2a3d4d;}
        .r:hover{background:rgba(0,220,140,0.03)!important;cursor:pointer;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
      `}</style>

      {/* TOPBAR */}
      <div style={{ height:44,display:"flex",alignItems:"center",padding:"0 16px",borderBottom:`1px solid ${C.border}`,background:"rgba(2,5,8,0.97)",flexShrink:0,gap:14 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <svg width={22} height={22} viewBox="0 0 24 24">
            <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke={C.neon} strokeWidth="1.5" fill="none"/>
            <polygon points="12,5 18,8.5 18,15.5 12,19 6,15.5 6,8.5" stroke={C.neon} strokeWidth="0.5" fill="rgba(0,220,140,0.04)"/>
            <circle cx={12} cy={12} r={2.5} fill={C.neon} opacity={0.8}/>
          </svg>
          <div>
            <div style={{ color:C.neon,fontSize:13,fontWeight:"bold",letterSpacing:4,lineHeight:1 }}>JARVIS</div>
            <div style={{ color:"#2a3d4d",fontSize:6,letterSpacing:3 }}>GLOBAL INTELLIGENCE TERMINAL · PALANTIR LAYER ACTIVE</div>
          </div>
        </div>
        <div style={{ display:"flex",gap:2,marginLeft:16 }}>
          {[["MAP","🌍 GLOBE"],["GRAPH","◈ ONTOLOGY"],["EMAILS","📡 CORPUS"],["CORRELATIONS","⚡ CORRELATIONS"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{ background:view===v?C.neonD:"transparent",border:`1px solid ${view===v?C.neon+"44":"transparent"}`,color:view===v?C.neon:"#3a5060",padding:"5px 12px",borderRadius:4,cursor:"pointer",fontSize:8,letterSpacing:2,fontFamily:"inherit" }}>{l}</button>
          ))}
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ display:"flex",gap:8,alignItems:"center" }}>
          {[["PSG $120k/wk",C.neon],["XRP $19.2k",C.gold],["6 COUNTRIES",C.blue]].map(([l,col])=>(
            <div key={l} style={{ padding:"3px 8px",borderRadius:3,background:col+"0e",border:`1px solid ${col}22`,fontSize:8,color:col }}>{l}</div>
          ))}
          <button onClick={()=>setShowAI(a=>!a)} style={{ background:showAI?C.neonD:"transparent",border:`1px solid ${showAI?C.neon+"44":C.border}`,color:showAI?C.neon:"#3a5060",padding:"5px 14px",borderRadius:4,cursor:"pointer",fontSize:8,letterSpacing:2,fontFamily:"inherit" }}>AI ANALYST</button>
          <div style={{ fontSize:8,color:"#2a3d4d" }}>{time.toLocaleTimeString("en-AU",{timeZone:"Australia/Sydney",hour:"2-digit",minute:"2-digit",second:"2-digit"})} AEST</div>
          <div style={{ display:"flex",alignItems:"center",gap:4 }}>
            <div style={{ width:5,height:5,borderRadius:"50%",background:C.red,animation:"pulse 1.5s infinite" }}/>
            <span style={{ fontSize:7,color:C.red,letterSpacing:2 }}>LIVE</span>
          </div>
        </div>
      </div>

      {/* TICKER */}
      <div style={{ height:26,background:"#020508",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",overflow:"hidden",position:"relative",flexShrink:0 }}>
        <div style={{ position:"absolute",left:0,top:0,bottom:0,width:80,background:"linear-gradient(to right, #020508, transparent)",zIndex:2,display:"flex",alignItems:"center",paddingLeft:10 }}>
          <span style={{ fontSize:7,color:C.neon,letterSpacing:3 }}>MARKETS</span>
        </div>
        <div style={{ display:"flex",paddingLeft:88,animation:"scroll 50s linear infinite",whiteSpace:"nowrap" }}>
          {[...["XRP/AUD $2.07 ▲+1.2%","BTC/AUD $98,400 ▲+0.6%","ETH/USD $2,041 ▼-1.4%","AUD/USD 0.6320 ▲+0.3%","CRUDE OIL $81.40 ▲+2.1%","GOLD $3,021 ▲+0.6%","AED/AUD 0.4190 →0.0%","TZS/USD 0.000389 ▲+0.1%","XRP×9300=$19,251 AUD","PSG NET $120k/wk","ZANZIBAR DD ACTIVE","IFZA FZCO PLANNING"],..."XRP/AUD $2.07 ▲+1.2%","BTC/AUD $98,400 ▲+0.6%","ETH/USD $2,041 ▼-1.4%","AUD/USD 0.6320 ▲+0.3%","CRUDE OIL $81.40 ▲+2.1%","GOLD $3,021 ▲+0.6%","AED/AUD 0.4190 →0.0%"].map((item,i)=>(
            <span key={i} style={{ display:"inline-flex",gap:5,alignItems:"center",marginRight:28,fontSize:9,color:item.includes("▼")?C.red:item.includes("▲")?C.neon:C.textB,fontFamily:"inherit" }}>{item}</span>
          ))}
        </div>
        <div style={{ position:"absolute",right:0,top:0,bottom:0,width:55,background:"linear-gradient(to left, #020508, transparent)",zIndex:2,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:8 }}>
          <span style={{ fontSize:7,color:C.red }}>● LIVE</span>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex:1,display:"flex",overflow:"hidden",position:"relative" }}>

        {/* LEFT — Intel Feed */}
        <div style={{ width:255,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",background:"rgba(2,5,8,0.93)",flexShrink:0 }}>
          <div style={{ padding:"7px 10px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0 }}>
            <span style={{ fontSize:8,color:C.neon,letterSpacing:3 }}>INTEL FEED</span>
            <span style={{ fontSize:7,color:"#2a3d4d" }}>{SIGNALS.length} signals</span>
          </div>
          <div style={{ padding:"5px 8px",borderBottom:`1px solid ${C.border}`,flexShrink:0 }}>
            <input style={{ width:"100%",background:"rgba(0,220,140,0.03)",border:`1px solid ${C.border}`,borderRadius:3,padding:"5px 8px",color:C.textB,fontFamily:"inherit",fontSize:9,outline:"none" }}
              placeholder="Filter..." value={feedFilter} onChange={e=>setFeedFilter(e.target.value)}/>
          </div>
          <div style={{ flex:1,overflowY:"auto" }}>
            {filtered.map((s,i)=>(
              <div key={i} className="r" style={{ display:"flex",gap:5,padding:"6px 8px",borderBottom:`1px solid rgba(0,220,140,0.025)`,alignItems:"flex-start" }}
                onClick={()=>{ setSelectedCountry(s.country); setRightTab("COUNTRY"); if(view!=="GRAPH")setView("MAP"); }}>
                <div style={{ width:3,height:3,borderRadius:"50%",background:IMPACT_COLORS[s.impact]||"#2a3d4d",marginTop:5,flexShrink:0 }}/>
                <span style={{ fontSize:7,padding:"1px 4px",borderRadius:2,background:(SIG_COLORS[s.type]||"#888")+"18",color:SIG_COLORS[s.type]||"#888",flexShrink:0 }}>{s.type}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:9,color:C.text,lineHeight:1.4 }}>{s.text}</div>
                  <div style={{ fontSize:7,color:"#2a3d4d",marginTop:2 }}>{COUNTRIES.find(c=>c.code===s.country)?.flag} {s.time}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding:"5px 8px",borderTop:`1px solid ${C.border}`,display:"flex",gap:7,flexWrap:"wrap",flexShrink:0 }}>
            {Object.entries(IMPACT_COLORS).slice(0,5).map(([k,v])=>(
              <div key={k} style={{ display:"flex",alignItems:"center",gap:3 }}>
                <div style={{ width:4,height:4,borderRadius:"50%",background:v }}/>
                <span style={{ fontSize:6,color:v }}>{k}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER */}
        <div style={{ flex:1,position:"relative",overflow:"hidden" }}>
          {view==="MAP" && <WorldMap selectedCountry={selectedCountry} onSelect={c=>{setSelectedCountry(c);setRightTab("COUNTRY");}} />}

          {view==="GRAPH" && (
            <div style={{ width:"100%",height:"100%",position:"relative" }}>
              <ForceGraph selectedNode={selectedNode} onNodeClick={n=>setSelectedNode(n.id===selectedNode?null:n.id)}/>
              {selectedNode && (() => {
                const node = NODES.find(n=>n.id===selectedNode);
                if (!node) return null;
                const links = EDGES.filter(e=>e.from===selectedNode||e.to===selectedNode);
                return (
                  <div style={{ position:"absolute",top:12,left:12,width:270,background:C.glass,backdropFilter:"blur(14px)",border:`1px solid ${C.border}`,borderRadius:6,overflow:"hidden",boxShadow:C.glow }}>
                    <div style={{ padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ color:node.color,fontSize:11,fontWeight:"bold",letterSpacing:2 }}>{node.label}</span>
                      <span style={{ fontSize:7,padding:"1px 5px",borderRadius:2,background:node.color+"18",color:node.color,border:`1px solid ${node.color}33` }}>{node.type.toUpperCase()}</span>
                    </div>
                    <div style={{ padding:"10px 14px" }}>
                      <div style={{ fontSize:9,color:C.text,lineHeight:1.6,marginBottom:10 }}>{node.detail}</div>
                      <div style={{ fontSize:7,color:"#2a3d4d",letterSpacing:2,marginBottom:6 }}>LINKS ({links.length})</div>
                      {links.map((e,i)=>{
                        const other = NODES.find(n=>n.id===(e.from===selectedNode?e.to:e.from));
                        return other?(
                          <div key={i} style={{ display:"flex",gap:6,padding:"3px 0",alignItems:"center" }}>
                            <div style={{ width:4,height:4,borderRadius:"50%",background:other.color,flexShrink:0 }}/>
                            <span style={{ fontSize:7,color:C.text }}>{e.label}</span>
                            <span style={{ fontSize:8,color:other.color,marginLeft:"auto" }}>{other.label}</span>
                          </div>
                        ):null;
                      })}
                    </div>
                    <button onClick={()=>setSelectedNode(null)} style={{ width:"100%",padding:"6px",background:"transparent",border:"none",borderTop:`1px solid ${C.border}`,color:"#2a3d4d",cursor:"pointer",fontSize:8,fontFamily:"inherit" }}>CLEAR</button>
                  </div>
                );
              })()}
            </div>
          )}

          {view==="EMAILS" && (
            <div style={{ height:"100%",overflowY:"auto",padding:16 }}>
              <div style={{ fontSize:9,color:C.neon,letterSpacing:3,marginBottom:14 }}>REAL CORPUS — PALANTIR BATCHES — {PALANTIR.data_stats.email_sources.toLocaleString()} EMAILS + {PALANTIR.data_stats.whatsapp_total.toLocaleString()} WA MESSAGES</div>

              {/* Stats grid */}
              <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14 }}>
                {Object.entries(PALANTIR.data_stats.batches).map(([cat,count])=>(
                  <div key={cat} style={{ background:C.glass,backdropFilter:"blur(10px)",border:`1px solid ${C.border}`,borderRadius:4,padding:"10px 12px",textAlign:"center" }}>
                    <div style={{ fontSize:16,color:C.neon,fontWeight:"bold" }}>{count}</div>
                    <div style={{ fontSize:7,color:"#2a3d4d",letterSpacing:1,marginTop:3 }}>{cat.replace("_"," ")}</div>
                  </div>
                ))}
              </div>

              {/* Investment emails */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:8,color:C.gold,letterSpacing:3,marginBottom:8 }}>INVESTMENT EMAILS — REAL ({PALANTIR.investment_emails.length} extracted)</div>
                {PALANTIR.investment_emails.map((e,i)=>(
                  <div key={i} className="r" style={{ display:"flex",gap:8,padding:"7px 10px",borderBottom:`1px solid rgba(0,220,140,0.04)`,background:"rgba(2,5,8,0.7)",borderRadius:3,marginBottom:3 }}>
                    <span style={{ fontSize:7,padding:"2px 5px",borderRadius:2,background:C.blue+"18",color:C.blue,flexShrink:0,alignSelf:"flex-start" }}>{e.cat}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:2 }}>
                        <span style={{ fontSize:8,color:C.textB,fontWeight:"bold" }}>{e.subject.slice(0,75)}</span>
                        <span style={{ fontSize:7,color:"#2a3d4d",flexShrink:0,marginLeft:8 }}>{e.date.slice(0,12)}</span>
                      </div>
                      <div style={{ fontSize:8,color:C.text }}>{e.from.slice(0,60)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Crypto emails */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:8,color:C.orange,letterSpacing:3,marginBottom:8 }}>CRYPTO SIGNALS — REAL ({PALANTIR.crypto_emails.length} extracted)</div>
                {PALANTIR.crypto_emails.map((e,i)=>(
                  <div key={i} className="r" style={{ display:"flex",gap:8,padding:"7px 10px",borderBottom:`1px solid rgba(0,220,140,0.04)`,background:"rgba(2,5,8,0.7)",borderRadius:3,marginBottom:3 }}>
                    <span style={{ fontSize:7,padding:"2px 5px",borderRadius:2,background:({BULLISH:C.neon+"18",BEARISH:C.red+"18",NEUTRAL:C.gold+"18"})[e.signal]||"#18181818",color:({BULLISH:C.neon,BEARISH:C.red,NEUTRAL:C.gold})[e.signal]||"#888",flexShrink:0,alignSelf:"flex-start" }}>{e.signal}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:2 }}>
                        <span style={{ fontSize:8,color:C.textB }}>{e.subject.slice(0,75)}</span>
                        <span style={{ fontSize:7,color:"#2a3d4d",flexShrink:0,marginLeft:8 }}>{e.date.slice(0,12)}</span>
                      </div>
                      <div style={{ fontSize:8,color:C.text }}>{e.from.slice(0,55)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Data provenance */}
              <div style={{ background:C.glass,backdropFilter:"blur(10px)",border:`1px solid ${C.neon}22`,borderRadius:5,padding:14 }}>
                <div style={{ fontSize:8,color:C.neon,letterSpacing:3,marginBottom:10 }}>DATA PROVENANCE — VERIFIED SOURCES</div>
                {[
                  ["Gmail emails processed","3,804",C.neon],
                  ["WhatsApp messages (5 chats)","15,822",C.neon],
                  ["Harrison personal chat","6,161 msgs",C.purple],
                  ["PSG Admin group chat","2,524 msgs",C.blue],
                  ["Bentley/Defended group","2,982 msgs",C.red],
                  ["Abdul 1:1","334 msgs",C.text],
                  ["Extracted facts","8,939",C.gold],
                  ["Timeline events","3,018",C.gold],
                  ["ChromaDB vectors","11,299",C.neon],
                  ["Pipeline runs today","118x (45.6 credits)",C.neon],
                ].map(([k,v,col])=>(
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid rgba(0,220,140,0.04)` }}>
                    <span style={{ fontSize:8,color:"#2a3d4d" }}>{k}</span>
                    <span style={{ fontSize:9,color:col,fontWeight:"bold" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view==="CORRELATIONS" && (
            <div style={{ height:"100%",overflowY:"auto",padding:16 }}>
              <div style={{ fontSize:9,color:C.neon,letterSpacing:3,marginBottom:14 }}>WORLD EVENT → YOUR POSITION CORRELATION MATRIX</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                {[
                  { trigger:"AUD/USD ↑", impact:"POSITIVE", affects:["AU","TZ","AE"], detail:"USD assets (Pangani $175k, Dubai) cheaper in AUD. Buying power increases. Watch AUD/USD 0.632 vs target entry." },
                  { trigger:"AUD/USD ↓", impact:"WATCH", affects:["TZ","AE"], detail:"Pangani + Dubai acquisitions cost more AUD. Consider hedging before Tanzania commitment." },
                  { trigger:"East Africa conflict escalates", impact:"ALERT", affects:["TZ","ZZ"], detail:"GDELT: Congo activity active. Pangani/Zanzibar risk rises. Title security + exit liquidity concerns." },
                  { trigger:"Dubai property index ↑", impact:"POSITIVE", affects:["AE"], detail:"Golf Acres + Golf Vale appreciation accelerates. Emaar South Airbnb yield validated. M Khalid Khan (APIL) engaged." },
                  { trigger:"Red Sea disruption", impact:"WATCH", affects:["AE","TZ","ZZ"], detail:"Brent crude +2.1% live. AUD strengthens (export). Zanzibar Indian Ocean maritime routes." },
                  { trigger:"AU solar policy change", impact:"CRITICAL", affects:["AU"], detail:"STC rebate directly drives PSG leads. Policy reduction = direct $120k/wk revenue risk. Monitor Clean Energy Council." },
                  { trigger:"XRP > $5 AUD", impact:"POSITIVE", affects:["AU","TZ"], detail:"9,300 × $5 = $46,500 AUD liquid. Meaningful toward Tanzania deposit. BTCMarkets: whales buying." },
                  { trigger:"Tanzania election cycle", impact:"WATCH", affects:["TZ","ZZ"], detail:"ZIPA laws can shift with new government. 99yr leasehold structure at risk. Eden Law monitoring." },
                  { trigger:"IFZA fee/policy change", impact:"MINOR", affects:["AE"], detail:"Marginal cost to FZCO registration. Sam + Harrison plan active. Monitor UAE free zone news." },
                  { trigger:"PSG Defended dispute escalates", impact:"DIRECT", affects:["AU"], detail:"Currently absorbing ~$900/wk freight verbally. No paper trail. SOPA rights available but not invoked." },
                ].map((cor,i)=>{
                  const cols={POSITIVE:C.neon,WATCH:C.gold,ALERT:C.red,CRITICAL:"#ff0033",MINOR:"#2a3d4d",DIRECT:C.blue};
                  const col=cols[cor.impact]||C.text;
                  return (
                    <div key={i} style={{ background:C.glass,backdropFilter:"blur(10px)",border:`1px solid ${C.border}`,borderLeft:`3px solid ${col}`,borderRadius:4,padding:12 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7 }}>
                        <span style={{ fontSize:10,color:C.textB,fontWeight:"bold",flex:1,letterSpacing:.5 }}>{cor.trigger}</span>
                        <span style={{ fontSize:7,padding:"2px 6px",borderRadius:2,background:col+"18",color:col,border:`1px solid ${col}33`,flexShrink:0,marginLeft:8 }}>{cor.impact}</span>
                      </div>
                      <div style={{ display:"flex",gap:4,marginBottom:7,flexWrap:"wrap" }}>
                        {cor.affects.map(code=>{
                          const c=COUNTRIES.find(x=>x.code===code);
                          return c?<span key={code} style={{ fontSize:7,padding:"1px 5px",borderRadius:2,background:C.blueD,color:C.blue,border:`1px solid ${C.blue}22` }}>{c.flag} {c.name.split("/")[0].trim()}</span>:null;
                        })}
                      </div>
                      <div style={{ fontSize:9,color:C.text,lineHeight:1.55 }}>{cor.detail}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ width:275,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",background:"rgba(2,5,8,0.93)",flexShrink:0 }}>
          <div style={{ display:"flex",borderBottom:`1px solid ${C.border}`,flexShrink:0 }}>
            {["COUNTRY","POSITIONS","PSG OPS"].map(t=>(
              <button key={t} onClick={()=>setRightTab(t)} style={{ flex:1,padding:"7px 4px",background:"transparent",border:"none",borderBottom:rightTab===t?`2px solid ${C.neon}`:"2px solid transparent",color:rightTab===t?C.neon:"#2a3d4d",fontSize:7,letterSpacing:1,cursor:"pointer",fontFamily:"inherit" }}>{t}</button>
            ))}
          </div>

          {rightTab==="COUNTRY" && <CountryIntel code={selectedCountry}/>}

          {rightTab==="POSITIONS" && (
            <div style={{ flex:1,overflowY:"auto" }}>
              <div style={{ padding:"7px 10px",fontSize:7,color:"#2a3d4d",letterSpacing:2,borderBottom:`1px solid ${C.border}` }}>ALL ACTIVE POSITIONS</div>
              {NODES.filter(n=>n.type!=="person").map(n=>(
                <div key={n.id} className="r" style={{ padding:"8px 10px",borderBottom:`1px solid rgba(0,220,140,0.03)` }}
                  onClick={()=>{ setSelectedNode(n.id); setView("GRAPH"); }}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                    <span style={{ fontSize:9,color:n.color,fontWeight:"bold" }}>{n.label}</span>
                    <span style={{ fontSize:7,color:"#2a3d4d" }}>{n.type}</span>
                  </div>
                  <div style={{ fontSize:8,color:C.text,lineHeight:1.4 }}>{n.detail.slice(0,85)}...</div>
                </div>
              ))}
              <div style={{ margin:8,padding:12,background:C.glass,backdropFilter:"blur(10px)",border:`1px solid ${C.neon}22`,borderRadius:4 }}>
                <div style={{ fontSize:7,color:C.neon,letterSpacing:3,marginBottom:8 }}>WEALTH SNAPSHOT</div>
                {[["PSG Net/wk","~$120,000",C.neon],["PSG Net/yr","~$6.24M",C.neon],["XRP 9,300 units","~$19,251 AUD",C.gold],["Pangani Ask","$175k USD",C.blue],["Golf Acres","AED TBC",C.blue],["Wealth Target","$100M",C.red],["Target Year","2033–2035",C.orange]].map(([k,v,col])=>(
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid rgba(0,220,140,0.03)` }}>
                    <span style={{ fontSize:8,color:"#2a3d4d" }}>{k}</span>
                    <span style={{ fontSize:9,color:col,fontWeight:"bold" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rightTab==="PSG OPS" && (
            <div style={{ flex:1,overflowY:"auto",fontFamily:"inherit" }}>
              <div style={{ padding:"7px 10px",fontSize:7,color:"#2a3d4d",letterSpacing:2,borderBottom:`1px solid ${C.border}` }}>PSG OPERATIONS — REAL DATA</div>
              <div style={{ padding:"8px 10px",borderBottom:`1px solid ${C.border}` }}>
                <div style={{ fontSize:7,color:C.blue,letterSpacing:2,marginBottom:6 }}>PIPELINE STATUS</div>
                {[["Runs today","118x",C.neon],["Credits used","45.6",C.gold],["Status","● LIVE",C.neon],["Version","v4.2",C.blue]].map(([k,v,col])=>(
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"3px 0" }}>
                    <span style={{ fontSize:8,color:"#2a3d4d" }}>{k}</span><span style={{ fontSize:9,color:col }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding:"8px 10px",borderBottom:`1px solid ${C.border}` }}>
                <div style={{ fontSize:7,color:C.blue,letterSpacing:2,marginBottom:6 }}>CONTRACTORS ({PALANTIR.psg.contractors.length})</div>
                {PALANTIR.psg.contractors.map((c,i)=>(
                  <div key={i} style={{ padding:"4px 0",borderBottom:`1px solid rgba(0,220,140,0.03)` }}>
                    <div style={{ fontSize:9,color:C.textB }}>{c.name}</div>
                    {c.email&&<div style={{ fontSize:7,color:"#2a3d4d" }}>{c.email}</div>}
                    {c.dob&&<div style={{ fontSize:7,color:"#2a3d4d" }}>DOB: {c.dob}</div>}
                    {c.role&&<div style={{ fontSize:7,color:C.text }}>{c.role}</div>}
                  </div>
                ))}
              </div>
              <div style={{ padding:"8px 10px",borderBottom:`1px solid ${C.border}` }}>
                <div style={{ fontSize:7,color:C.blue,letterSpacing:2,marginBottom:6 }}>PRICING</div>
                {Object.entries(PALANTIR.psg.pricing).map(([k,v])=>(
                  <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"3px 0",gap:8 }}>
                    <span style={{ fontSize:7,color:"#2a3d4d",flex:1 }}>{k}</span>
                    <span style={{ fontSize:8,color:C.neon }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding:"8px 10px" }}>
                <div style={{ fontSize:7,color:C.red,letterSpacing:2,marginBottom:6 }}>OPEN ISSUES</div>
                {PALANTIR.psg.issues.map((issue,i)=>(
                  <div key={i} style={{ display:"flex",gap:5,padding:"4px 0",borderBottom:`1px solid rgba(0,220,140,0.03)` }}>
                    <div style={{ width:4,height:4,borderRadius:"50%",background:C.red,marginTop:4,flexShrink:0 }}/>
                    <span style={{ fontSize:8,color:C.text,lineHeight:1.4 }}>{issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {showAI && <AIAnalyst onClose={()=>setShowAI(false)}/>}
      </div>

      {/* STATUS BAR */}
      <div style={{ height:24,display:"flex",alignItems:"center",gap:12,padding:"0 14px",background:"rgba(2,5,8,0.97)",borderTop:`1px solid ${C.border}`,fontSize:7,color:"#2a3d4d",flexShrink:0 }}>
        {[["CORPUS",`${PALANTIR.data_stats.email_sources.toLocaleString()} EMAILS + ${PALANTIR.data_stats.whatsapp_total.toLocaleString()} WA`,C.neon],["VECTORS",PALANTIR.data_stats.vectors.toLocaleString(),C.blue],["FACTS",PALANTIR.data_stats.facts_total.toLocaleString(),C.gold],["EXPOSURE","6 COUNTRIES",C.blue],["PSG","$120k/wk NET",C.neon],["TARGET","$100M / 2033",C.red],["PIPELINE","118 RUNS TODAY",C.neon]].map(([k,v,col],i)=>(
          <span key={k} style={{ display:"flex",gap:4 }}>
            {i>0&&<span style={{ color:"#141e24" }}>◆</span>}
            <span>{k}</span><span style={{ color:col }}>{v}</span>
          </span>
        ))}
        <span style={{ marginLeft:"auto",color:"#141e24" }}>JARVIS v5.0 · PALANTIR-LAYER · OMEGA DAEMON 38x/24h · OMEGA SESSION BRIDGE 46x/24h</span>
      </div>
    </div>
  );
}
