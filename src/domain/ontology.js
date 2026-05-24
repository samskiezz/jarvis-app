export const OBJECTS = [
  { id:"sam",       label:"Sam Kazangas",       type:"person",   mark:"PII",        conf:1.0, x:460,y:260,
    props:{ DOB:"27 Nov 1992", Heritage:"Greek Cypriot Australian", Home:"35 Springfield Rd Padstow NSW", Email:"samkazangas@gmail.com", Artist:"$avva", GitHub:"samskiezz" },
    linked:["psg","hilts","harrison","nisha","pangani","dubai","crypto","music","target"] },
  { id:"harrison",  label:"Harrison Vaubell",   type:"person",   mark:"INTERNAL",   conf:0.98, x:260,y:220,
    props:{ Phone:"0415557997", Email:"harrison@projectsolar.com.au", Role:"PSG Co-founder 50/50", WA_Messages:"6,161", Dynamic:"Sam mentors tech, Harrison runs ops" },
    linked:["psg","sam","dubai","ifza"] },
  { id:"nisha",     label:"Nisha Nissan",        type:"person",   mark:"PII",        conf:0.97, x:580,y:380,
    props:{ Emails:"nisha.nissan@hotmail.com", Employer:"Commonwealth Bank", Wedding:"Sat 20 Mar 2027 (deciding)", Venues:"Ottimo House · Kefalos CY · Breakfast Point" },
    linked:["sam","austral"] },
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
  { id:"pangani",   label:"Pangani TZ",         type:"invest",   mark:"FINANCIAL",  conf:0.88, x:340,y:400,
    props:{ Size:"6 acres / ~10,000 SQM", Location:"Ushongo Mabaoni Beachfront, Pangani, Tanzania", Ask:"$175k USD", Agent:"Jolyon Darker · Peponi Real Estate", Legal:"Eden Law Chambers", Structure:"ZIPA-compliant 99yr leasehold" },
    linked:["sam","zanzibar","target"] },
  { id:"zanzibar",  label:"Zanzibar Resort",    type:"invest",   mark:"FINANCIAL",  conf:0.85, x:390,y:475,
    props:{ Strategy:"$100M resort anchor", Location:"Matemwe / Paje beachfront", Agent:"Africa Luxury Properties", Timeline:"2033–2035", Structure:"ZIPA 99yr leasehold" },
    linked:["sam","pangani","target"] },
  { id:"dubai",     label:"Dubai / Emaar",       type:"invest",   mark:"FINANCIAL",  conf:0.92, x:660,y:250,
    props:{ Plans:"Golf Acres Emaar South 1BR (Apr 2026) + Golf Vale (Jun 2026)", Agent:"M Khalid Khan · APIL Properties", Strategy:"Airbnb yield + investor visa", Currency:"AED pegged USD — zero FX risk" },
    linked:["sam","harrison","ifza","target"] },
  { id:"crypto",    label:"XRP / BTC Portfolio", type:"asset",   mark:"FINANCIAL",  conf:0.99, x:740,y:360,
    props:{ XRP:"9,300 units @ $2.07 AUD = $19,251 AUD", Exchanges:"BTCMarkets · Coinbase · eToro · CoinJar", BTC:"Above A$98,000 — institutional buying Mar 2026" },
    linked:["sam","target"] },
  { id:"austral",   label:"Lot 227 Austral NSW", type:"property", mark:"PII",       conf:0.96, x:560,y:470,
    props:{ Address:"Lot 227 Swamphen St, Austral NSW", Builder:"Gurner", Owner:"Nisha Nissan", Electrical:"Consultation confirmed Feb 2026" },
    linked:["nisha"] },
  { id:"music",     label:"$avva Music",         type:"creative", mark:"INTERNAL",  conf:0.99, x:690,y:160,
    props:{ Artist:"$avva", Distributor:"DistroKid", Releases:"Still Me (5k+ streams) · Not Like This · The Same · Later · Working · Breathe", Platforms:"Spotify · Apple Music · Deezer · TikTok · YouTube", Royalties:"Active — payout Feb 2026" },
    linked:["sam"] },
  { id:"target",    label:"$100M Target",        type:"target",  mark:"RESTRICTED", conf:1.0, x:460,y:155,
    props:{ Goal:"$100M net worth", Timeline:"2033–2035", Engine:"PSG $120k/wk → property → Zanzibar resort", Status:"ON TRACK — PSG $6.24M/yr base" },
    linked:["sam","psg","pangani","zanzibar","dubai","crypto","hilts"] },
];

export const LINKS = [
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

export const findObjectById = (id) => OBJECTS.find((o) => o.id === id) || null;

export const getNeighborIds = (id) => {
  const out = new Set([id]);
  LINKS.forEach((l) => {
    if (l.a === id) out.add(l.b);
    if (l.b === id) out.add(l.a);
  });
  return out;
};

export const getLinkCount = (id) =>
  LINKS.reduce((n, l) => n + (l.a === id || l.b === id ? 1 : 0), 0);
