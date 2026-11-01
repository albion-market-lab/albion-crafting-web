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
    expect(result.recipeWarnings).toEqual([]);
    expect(support.supportedCraftableIds).not.toContain("T4_CAPEITEM_FW_BRIDGEWATCH");
  });

  it("projects direct real-recipe ingredients for robe, hammer, and holy staff", () => {
    const catalog = catalogJson as CatalogData;
    const result = calculateMaterials({ catalog, targets: [
      { itemId: "T4_ARMOR_CLOTH_SET1", quantity: 30 },
      { itemId: "T5_MAIN_HOLYSTAFF", quantity: 20 },
      { itemId: "T6_2H_HAMMER", quantity: 10 },
    ] });
    expect(result.craftingMaterialBreakdown).toEqual([
      { itemId: "T4_ARMOR_CLOTH_SET1", requiredQuantity: 30, processCount: 30, outputQuantity: 30, surplusQuantity: 0, ingredients: [{ itemId: "T4_CLOTH", quantity: 480 }] },
      { itemId: "T5_MAIN_HOLYSTAFF", requiredQuantity: 20, processCount: 20, outputQuantity: 20, surplusQuantity: 0, ingredients: [{ itemId: "T5_PLANKS", quantity: 320 }, { itemId: "T5_CLOTH", quantity: 160 }] },
      { itemId: "T6_2H_HAMMER", requiredQuantity: 10, processCount: 10, outputQuantity: 10, surplusQuantity: 0, ingredients: [{ itemId: "T6_METALBAR", quantity: 200 }, { itemId: "T6_CLOTH", quantity: 120 }] },
    ]);
    expect(result.refiningMaterialBreakdown.find(({ itemId }) => itemId === "T6_METALBAR")).toMatchObject({
      requiredQuantity: 200, processCount: 200, ingredients: [{ itemId: "T6_ORE", quantity: 800 }, { itemId: "T5_METALBAR", quantity: 200 }],
    });
  });

  it("keeps a 45-item crafting breakdown independently addressable", () => {
    const catalog = catalogJson as CatalogData;
    const supported = (supportJson as { supportedCraftableIds: string[] }).supportedCraftableIds.slice(0, 45);
    const result = calculateMaterials({ catalog, targets: supported.map((itemId) => ({ itemId, quantity: 1 })) });
    expect(result.craftingMaterialBreakdown).toHaveLength(45);
    expect(new Set(result.craftingMaterialBreakdown.map(({ itemId }) => itemId)).size).toBe(45);
  });
});
