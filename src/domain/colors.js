export const COLORS = {
  bg: "#020509",
  panel: "rgba(4,10,16,0.95)",
  border: "rgba(0,200,120,0.14)",
  borderB: "rgba(0,200,120,0.06)",
  neon: "#00c878",
  neonD: "rgba(0,200,120,0.1)",
  blue: "#0096d4",
  blueD: "rgba(0,150,212,0.12)",
  gold: "#e8a800",
  goldD: "rgba(232,168,0,0.12)",
  red: "#e8203c",
  redD: "rgba(232,32,60,0.12)",
  purple: "#a855f7",
  purpleD: "rgba(168,85,247,0.12)",
  orange: "#f07820",
  text: "#566878",
  textB: "#a8bcc8",
  glass: "rgba(4,10,18,0.82)",
  mark: {
    INTERNAL: "#00c878",
    FINANCIAL: "#e8a800",
    PII: "#e8203c",
    LEGAL: "#a855f7",
    RESTRICTED: "#f07820",
  },
  type: {
    person: "#00c878",
    org: "#0096d4",
    invest: "#e8a800",
    asset: "#f07820",
    property: "#0096d4",
    creative: "#a855f7",
    client: "#e8203c",
    target: "#e8203c",
  },
};

export const riskColor = (risk) =>
  ({ LOW: COLORS.neon, MEDIUM: COLORS.gold, HIGH: COLORS.red }[risk] || COLORS.text);

export const earthquakeColor = (mag) =>
  mag >= 6 ? "#ff2200" : mag >= 5 ? "#ff8800" : mag >= 4.5 ? "#ffcc00" : "#88ff88";
