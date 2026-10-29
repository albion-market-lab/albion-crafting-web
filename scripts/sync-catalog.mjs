import { calculateMaterials } from "@albion-market-lab/crafting-calculator";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.CATALOG_JSON) throw new Error("CATALOG_JSON must point to an importer v3 catalog.json with sibling manifest.json and coverage.json.");
const source = resolve(root, process.env.CATALOG_JSON);
const sourceDirectory = dirname(source);
const publicDirectory = resolve(root, "public");
const catalog = JSON.parse(await readFile(source, "utf8"));
const supportedCraftableIds = [];
const rejected = {};

for (const item of catalog.items.filter((value) => value.hasCraftingRecipe)) {
  try {
    calculateMaterials({ targets: [{ itemId: item.itemId, quantity: 1 }], catalog });
    supportedCraftableIds.push(item.itemId);
  } catch (error) {
    const code = error?.code ?? "UNKNOWN_ERROR";
    const entry = rejected[code] ??= { count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < 10) entry.examples.push(item.itemId);
  }
}

await mkdir(publicDirectory, { recursive: true });
await copyFile(source, resolve(publicDirectory, "catalog-v3.json"));
for (const name of ["manifest.json", "coverage.json"]) {
  await copyFile(resolve(sourceDirectory, name), resolve(publicDirectory, name.replace(".json", "-v3.json")));
}
await writeFile(resolve(publicDirectory, "catalog-support-v3.json"), JSON.stringify({
  schemaVersion: "3",
  supportedCraftableIds,
  rejectedCraftableItems: catalog.craftingRecipes.length - supportedCraftableIds.length,
  rejectionReasons: rejected,
}, null, 2) + "\n");
console.log(`Catalog synchronized: ${catalog.items.length} items, ${supportedCraftableIds.length} supported craftables, ${catalog.craftingRecipes.length - supportedCraftableIds.length} rejected.`);
