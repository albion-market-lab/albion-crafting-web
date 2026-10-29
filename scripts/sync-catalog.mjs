import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, process.env.CATALOG_JSON ?? "../albion-crafting-calculator/test/fixtures/catalog-v3.json");
const target = resolve(root, "public/catalog-v3.json");
await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`Catalog copied from ${source}`);
