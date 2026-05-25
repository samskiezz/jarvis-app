import { describe, expect, it, beforeEach, vi } from "vitest";

import { api, ApiError } from "./api";

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.setItem("underworld_api_key", "test-key");
});

describe("api client", () => {
  it("sends the bearer header", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await api.me();
    expect(result.authenticated).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const headers = fetchMock.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-key");
  });

  it("throws ApiError on non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("nope", { status: 401 }),
    );
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
  });

  it("serialises POST bodies as JSON", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await api.searchPatents("solar", 5, true);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ query: "solar", limit: 5, only_expired: true }));
  });
});
