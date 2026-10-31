import type { MarketActivity, MarketPrice } from "@albion-market-lab/crafting-calculator";

export interface PriceSnapshot {
  server: "East/Asia";
  items: MarketPrice[];
}

export interface ActivitySnapshot {
  server: "East/Asia";
  items: MarketActivity[];
}

const itemIdPattern = /^[A-Z0-9_]+(?:@[1-4])?$/;

export async function loadPrices(itemIds: string[]): Promise<PriceSnapshot | null> {
  const baseUrl = import.meta.env.VITE_PRICE_API_URL?.trim();
  if (!baseUrl) return null;
  const chunks = [];
  const uniqueItemIds = [...new Set(itemIds)];
  for (let index = 0; index < uniqueItemIds.length; index += 100) chunks.push(uniqueItemIds.slice(index, index + 100));
  const snapshots = await Promise.all(chunks.map(async (chunk) => {
    const url = new URL("prices", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    url.searchParams.set("server", "East/Asia");
    url.searchParams.set("itemIds", chunk.join(","));
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Price API returned HTTP ${response.status}.`);
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || (value as PriceSnapshot).server !== "East/Asia" || !Array.isArray((value as PriceSnapshot).items)) throw new Error("Price API returned an invalid snapshot.");
    return (value as PriceSnapshot).items;
  }));
  const items = snapshots.flat();
  for (const item of items) {
    const validTime = (time: unknown) => time === null || (typeof time === "string" && Number.isFinite(Date.parse(time)));
    if (item.server !== "East/Asia" || typeof item.itemId !== "string" || !itemIdPattern.test(item.itemId) || typeof item.city !== "string" || !item.city || !Number.isInteger(item.quality) || item.quality < 1 || item.quality > 5 || (item.highestBuyPrice !== null && (!Number.isSafeInteger(item.highestBuyPrice) || item.highestBuyPrice! <= 0)) || (item.lowestSellPrice !== null && (!Number.isSafeInteger(item.lowestSellPrice) || item.lowestSellPrice! <= 0)) || !validTime(item.highestBuyObservedAt) || !validTime(item.lowestSellObservedAt)) throw new Error("Price API returned an invalid price row.");
  }
  return { server: "East/Asia", items };
}

export async function loadActivity(itemIds: string[]): Promise<ActivitySnapshot | null> {
  const baseUrl = import.meta.env.VITE_PRICE_API_URL?.trim();
  if (!baseUrl) return null;
  const chunks = [];
  const uniqueItemIds = [...new Set(itemIds)];
  for (let index = 0; index < uniqueItemIds.length; index += 100) chunks.push(uniqueItemIds.slice(index, index + 100));
  const snapshots = await Promise.all(chunks.map(async (chunk) => {
    const url = new URL("activity", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    url.searchParams.set("server", "East/Asia");
    url.searchParams.set("itemIds", chunk.join(","));
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Activity API returned HTTP ${response.status}.`);
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || (value as ActivitySnapshot).server !== "East/Asia" || !Array.isArray((value as ActivitySnapshot).items)) throw new Error("Activity API returned an invalid snapshot.");
    return (value as ActivitySnapshot).items;
  }));
  const items = snapshots.flat();
  for (const item of items) {
    if (item.server !== "East/Asia" || typeof item.itemId !== "string" || !itemIdPattern.test(item.itemId) || typeof item.city !== "string" || !item.city
      || !Number.isInteger(item.quality) || item.quality < 1 || item.quality > 5 || !Number.isFinite(item.averageDailyUnits) || item.averageDailyUnits < 0
      || !Number.isInteger(item.coverageDays) || item.coverageDays < 0 || typeof item.observedAt !== "string" || !Number.isFinite(Date.parse(item.observedAt))) throw new Error("Activity API returned an invalid row.");
  }
  return { server: "East/Asia", items };
}
