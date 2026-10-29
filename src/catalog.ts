import type { CatalogData } from "@albion-market-lab/crafting-calculator";

export interface WebCatalogData extends CatalogData {
  supportedCraftableIds?: string[];
  rejectedCraftableItems?: number;
}

export async function loadCatalog(): Promise<WebCatalogData> {
  const [catalogResponse, supportResponse, manifestResponse] = await Promise.all([fetch("/catalog-v3.json"), fetch("/catalog-support-v3.json"), fetch("/manifest-v3.json")]);
  if (!catalogResponse.ok || !supportResponse.ok || !manifestResponse.ok) throw new Error("Catalog atau metadata validasinya gagal dimuat.");
  const [catalog, support, manifest] = await Promise.all([catalogResponse.json(), supportResponse.json(), manifestResponse.json()]) as [CatalogData, { schemaVersion?: unknown; supportedCraftableIds?: unknown; rejectedCraftableItems?: unknown }, { schemaVersion?: unknown }];
  if (manifest.schemaVersion !== "3" || support.schemaVersion !== "3" || !Array.isArray(support.supportedCraftableIds) || support.supportedCraftableIds.some((id) => typeof id !== "string") || !Number.isSafeInteger(support.rejectedCraftableItems) || Number(support.rejectedCraftableItems) < 0) throw new Error("Catalog schema/version tidak didukung.");
  return { ...catalog, supportedCraftableIds: support.supportedCraftableIds as string[], rejectedCraftableItems: Number(support.rejectedCraftableItems) };
}
