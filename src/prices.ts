import type { MarketPrice } from "@albion-market-lab/crafting-calculator";

export interface PriceSnapshot {
  server: "East/Asia";
  items: MarketPrice[];
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
    const response = await fetch(url);
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
