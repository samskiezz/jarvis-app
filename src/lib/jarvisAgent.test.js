import { describe, it, expect } from "vitest";
import { interpret, PANEL_ALIASES } from "./jarvisAgent";

const ENTITIES = [
  { id: "psg", label: "Project Solar Group" },
  { id: "pangani", label: "Pangani TZ" },
  { id: "dubai", label: "Dubai / Emaar" },
  { id: "crypto", label: "XRP / BTC Portfolio" },
];
const ctx = { entities: ENTITIES };

describe("jarvisAgent.interpret", () => {
  it("strips the wake word before routing", () => {
    expect(interpret("Jarvis, open markets", ctx)).toMatchObject({ intent: "open_panel", panel: "MARKETS" });
    expect(interpret("hey jarvis show me the globe", ctx)).toMatchObject({ intent: "open_panel", panel: "MAP" });
  });

  it("opens panels by alias", () => {
    expect(interpret("open the risk panel", ctx)).toMatchObject({ intent: "open_panel", panel: "RISK" });
    expect(interpret("bring up the timeline", ctx)).toMatchObject({ intent: "open_panel", panel: "TIMELINE" });
    expect(interpret("pull up counterstrike", ctx)).toMatchObject({ intent: "open_panel", panel: "CS3D" });
  });

  it("closes panels when asked to hide/close", () => {
    expect(interpret("close the markets", ctx)).toMatchObject({ intent: "close_panel", panel: "MARKETS" });
    expect(interpret("hide the globe", ctx)).toMatchObject({ intent: "close_panel", panel: "MAP" });
  });

  it("focuses entities", () => {
    expect(interpret("focus on PSG", ctx)).toMatchObject({ intent: "focus_entity" });
    expect(interpret("focus on PSG", ctx).entity.id).toBe("psg");
    expect(interpret("select Pangani", ctx).entity.id).toBe("pangani");
  });

  it("routes briefings, refresh, help, stop", () => {
    expect(interpret("brief me", ctx)).toMatchObject({ intent: "briefing" });
    expect(interpret("give me a sitrep", ctx)).toMatchObject({ intent: "briefing" });
    expect(interpret("refresh", ctx)).toMatchObject({ intent: "refresh" });
    expect(interpret("what can you do", ctx)).toMatchObject({ intent: "help" });
    expect(interpret("stop", ctx)).toMatchObject({ intent: "stop" });
  });

  it("greets, with a warm Daddy's-home easter egg", () => {
    expect(interpret("jarvis", ctx)).toMatchObject({ intent: "greeting" });
    expect(interpret("hello jarvis", ctx)).toMatchObject({ intent: "greeting" });
    expect(interpret("daddy's home", ctx)).toMatchObject({ intent: "greeting", warm: true });
  });

  it("falls through to an LLM query, flagging any mentioned entity", () => {
    const r = interpret("what's the latest on Dubai", ctx);
    expect(r.intent).toBe("query");
    expect(r.entity.id).toBe("dubai");
    expect(interpret("explain the hundred million dollar plan", ctx)).toMatchObject({ intent: "query" });
  });

  it("every panel id has at least one alias", () => {
    for (const id of Object.keys(PANEL_ALIASES)) {
      expect(PANEL_ALIASES[id].length).toBeGreaterThan(0);
    }
  });
});
