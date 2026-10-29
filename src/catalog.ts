import type { CatalogData } from "@albion-market-lab/crafting-calculator";

export async function loadCatalog(): Promise<CatalogData> {
  const response = await fetch("/catalog-v3.json");
  if (!response.ok) throw new Error(`Catalog gagal dimuat (${response.status}).`);
  return response.json() as Promise<CatalogData>;
}
