import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPrices } from "../src/prices.js";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("private price adapter", () => {
  it("requests only the configured read endpoint and validates a successful snapshot", async () => {
    vi.stubEnv("VITE_PRICE_API_URL", "https://receiver.example");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => Response.json({ server: "East/Asia", items: [{ server: "East/Asia", itemId: "T5_FIBER", city: "Martlock", quality: 1, highestBuyPrice: 372, highestBuyObservedAt: "2026-10-29T05:00:00Z", lowestSellPrice: null, lowestSellObservedAt: null }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadPrices(["T5_FIBER"])).resolves.toMatchObject({ items: [{ highestBuyPrice: 372 }] });
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://receiver.example/prices?server=East%2FAsia&itemIds=T5_FIBER");
  });

  it("uses offline mode without configuration and rejects malformed payloads", async () => {
    vi.stubEnv("VITE_PRICE_API_URL", "");
    await expect(loadPrices(["T5_FIBER"])).resolves.toBeNull();
    vi.stubEnv("VITE_PRICE_API_URL", "https://receiver.example");
    vi.stubGlobal("fetch", async () => Response.json({ server: "East/Asia", items: [{ itemId: "bad-id" }] }));
    await expect(loadPrices(["T5_FIBER"])).rejects.toThrow("invalid price row");
  });

  it("chunks more than 100 item IDs without sending an invalid receiver request", async () => {
    vi.stubEnv("VITE_PRICE_API_URL", "https://receiver.example");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => Response.json({ server: "East/Asia", items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await loadPrices(Array.from({ length: 205 }, (_, index) => `T4_ITEM_${index}`));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("itemIds")!.split(",").length)).toEqual([100, 100, 5]);
  });
});
