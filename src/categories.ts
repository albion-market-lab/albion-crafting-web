import type { CatalogData, CatalogItem } from "@albion-market-lab/crafting-calculator";

export type MaterialGroup = "cloth" | "leather" | "plate";
export type CategorySelection = "all" | "bag" | "cape" | "other" | `${"helmet" | "armor" | "shoes" | "weapon" | "offhand"}:${MaterialGroup}`;

const armorSlot = { HEAD: "helmet", ARMOR: "armor", SHOES: "shoes" } as const;
const material = { CLOTH: "cloth", LEATHER: "leather", PLATE: "plate" } as const;

export function buildCategoryAssignments(catalog: CatalogData, items: CatalogItem[]): Map<string, Exclude<CategorySelection, "all">> {
  const recipes = new Map(catalog.craftingRecipes.map((recipe) => [recipe.outputItemId, recipe]));
  return new Map(items.map((item) => {
    if (item.category === "Bag") return [item.itemId, "bag"];
    if (item.category === "Cape") return [item.itemId, "cape"];
    const armor = /^T\d+_(HEAD|ARMOR|SHOES)_(CLOTH|LEATHER|PLATE)_/.exec(item.itemId);
    if (armor) return [item.itemId, `${armorSlot[armor[1] as keyof typeof armorSlot]}:${material[armor[2] as keyof typeof material]}` as const];
    const slot = item.category === "Main-hand" || item.category === "Two-hand" ? "weapon" : item.category === "Off-hand" ? "offhand" : undefined;
    if (slot) {
      const groups = new Set<MaterialGroup>();
      for (const { itemId } of recipes.get(item.itemId)?.ingredients ?? []) {
        if (/^T[2-8]_CLOTH(?:_|$)/.test(itemId)) groups.add("cloth");
        if (/^T[2-8]_LEATHER(?:_|$)/.test(itemId)) groups.add("leather");
        if (/^T[2-8]_METALBAR(?:_|$)/.test(itemId)) groups.add("plate");
      }
      if (groups.size === 1) return [item.itemId, `${slot}:${[...groups][0]}` as const];
    }
    return [item.itemId, "other"];
  }));
}

export const categoryBreadcrumb = (selection: CategorySelection): string => {
  if (selection === "all") return "All Supported";
  if (selection === "bag") return "Equipment / Bag";
  if (selection === "cape") return "Equipment / Cape";
  if (selection === "other") return "Equipment / Other Equipment";
  const [slot, group] = selection.split(":") as [string, MaterialGroup];
  const slots: Record<string, string> = { helmet: "Helmet", armor: "Armor", shoes: "Shoes", weapon: "Weapon", offhand: "Off-hand" };
  const groups: Record<MaterialGroup, string> = { cloth: "Cloth", leather: "Leather", plate: "Plate" };
  return `Equipment / ${slots[slot]} / ${groups[group]}`;
};
