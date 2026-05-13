import { useEffect, useMemo, useState } from "react";
import MapPanel from "../features/jarvis/components/MapPanel";
import VertexGraph from "../features/jarvis/components/VertexGraph";
import ObjectExplorer from "../features/jarvis/components/ObjectExplorer";
import TimelinePanel from "../features/jarvis/components/TimelinePanel";
import RiskPanel from "../features/jarvis/components/RiskPanel";
import AnalystPanel from "../features/jarvis/components/AnalystPanel";
import MarketsPanel from "../features/jarvis/components/MarketsPanel";
import EmailsPanel from "../features/jarvis/components/EmailsPanel";
import WatchlistPanel from "../features/jarvis/components/WatchlistPanel";
import WindowManager from "../features/jarvis/components/WindowManager";
import { API, C } from "../features/jarvis/data/constants";

const LIVE_REFRESH_MS = 30000;

export default function JarvisTerminal() {
  const [liveData, setLiveData] = useState(null);
  const [selectedObj, setSelectedObj] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState("AU");
  const [focusId, setFocusId] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "all" }) });
        if (mounted && response.ok) setLiveData(await response.json());
      } catch {
        // Keep the last successful payload and rely on periodic retries.
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, LIVE_REFRESH_MS);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const earthquakes = liveData?.earthquakes || [];

  const panels = useMemo(
    () => [
      { id: "MAP", title: "MapPanel" },
      { id: "VERTEX", title: "VertexGraph" },
      { id: "EXPLORER", title: "ObjectExplorer" },
      { id: "TIMELINE", title: "TimelinePanel" },
      { id: "RISK", title: "RiskPanel" },
      { id: "EMAILS", title: "EmailsPanel" },
      { id: "WATCHLIST", title: "WatchlistPanel" },
      { id: "MARKETS", title: "MarketsPanel" },
      { id: "ANALYST", title: "AnalystPanel" },
    ],
    []
  );

  const renderers = {
    MAP: () => <MapPanel selectedCountry={selectedCountry} onSelect={setSelectedCountry} earthquakes={earthquakes} />,
    VERTEX: () => <VertexGraph selectedObj={selectedObj} focusId={focusId} onSelect={(id) => { setSelectedObj(id); setFocusId(id); }} />,
    EXPLORER: () => <ObjectExplorer selectedObj={selectedObj} onSelect={(id) => { setSelectedObj(id); setFocusId(null); }} />,
    TIMELINE: () => <TimelinePanel liveData={liveData} />,
    RISK: () => <RiskPanel onFocus={(id) => { setSelectedObj(id); setFocusId(id); }} />,
    EMAILS: () => <EmailsPanel liveData={liveData} />,
    WATCHLIST: () => <WatchlistPanel selectedObj={selectedObj} onFocus={(id) => { setSelectedObj(id); setFocusId(id); }} />,
    MARKETS: () => <MarketsPanel liveData={liveData} />,
    ANALYST: () => <AnalystPanel />,
  };

  return <div style={{ minHeight: "100vh", background: C.bg }}><WindowManager panels={panels} renderers={renderers} /></div>;
}
