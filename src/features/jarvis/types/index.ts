export interface ObjectNode {
  id: string;
  label: string;
  type: string;
  mark: string;
  conf: number;
  x: number;
  y: number;
  props: Record<string, string>;
  linked: string[];
}

export interface ObjectLink {
  a: string;
  b: string;
  label: string;
  strength: number;
}

export interface CountryIntel {
  code: string;
  name: string;
  flag: string;
  lat: number;
  lng: number;
  risk: string;
  riskScore: number;
  positions: string[];
  watch: string[];
}

export interface RiskSignal {
  id: string;
  title: string;
  severity: number;
  type: string;
  country: string;
  impact: string;
  detail: string;
  linked: string;
  trend: string;
}

export interface JarvisApiResponse {
  earthquakes?: Array<{ lat: number; lng: number; mag: number }>;
  corpus?: Record<string, unknown>;
  markets?: Record<string, unknown>;
}
