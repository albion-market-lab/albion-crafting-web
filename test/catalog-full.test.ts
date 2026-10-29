import { describe, expect, it } from "vitest";
import { calculateMaterials, type CatalogData } from "@albion-market-lab/crafting-calculator";
import catalogJson from "../public/catalog-v3.json";
import supportJson from "../public/catalog-support-v3.json";
import coverageJson from "../public/coverage-v3.json";

describe("full catalog snapshot", () => {
  it("loads the real v3 export and calculates supported armor across T4/T5/T6", () => {
    const catalog = catalogJson as CatalogData;
    const support = supportJson as { supportedCraftableIds: string[]; rejectedCraftableItems: number; rejectionReasons: Record<string, { count: number }> };
    const coverage = coverageJson as { totalItems: number; unsupportedItems: number; danglingReferences: number };
    expect(coverage).toMatchObject({ totalItems: 11_223, unsupportedItems: 123, danglingReferences: 0 });
    expect(support.supportedCraftableIds).toHaveLength(6_066);
    expect(support).toMatchObject({ rejectedCraftableItems: 781, rejectionReasons: { UNKNOWN_MATERIAL: { count: 206 }, REFINING_RECIPE_NOT_FOUND: { count: 575 } } });
    const targets = ["T4_HEAD_PLATE_SET1", "T5_ARMOR_LEATHER_SET1", "T6_SHOES_CLOTH_SET1"].map((itemId, index) => ({ itemId, quantity: index + 1 }));
    expect(targets.every(({ itemId }) => support.supportedCraftableIds.includes(itemId))).toBe(true);
    const result = calculateMaterials({ catalog, targets });
    expect(result.craftOutputs.map(({ itemId }) => itemId)).toEqual(targets.map(({ itemId }) => itemId));
    expect(result.shoppingList.length).toBeGreaterThan(0);
    expect(support.supportedCraftableIds).not.toContain("T4_CAPEITEM_FW_BRIDGEWATCH");
  });
});
