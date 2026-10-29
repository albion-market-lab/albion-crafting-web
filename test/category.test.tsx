import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import type { CatalogData } from "@albion-market-lab/crafting-calculator";
import catalogJson from "../public/catalog-v3.json";
import supportJson from "../public/catalog-support-v3.json";
import { App } from "../src/App.js";
import { CategoryTree } from "../src/CategoryTree.js";
import { buildCategoryAssignments, type CategorySelection } from "../src/categories.js";

const catalog = { ...(catalogJson as CatalogData), supportedCraftableIds: supportJson.supportedCraftableIds };
const supported = catalog.items.filter((item) => supportJson.supportedCraftableIds.includes(item.itemId));

describe("category classification coverage", () => {
  it("assigns every supported craftable to one reachable leaf or fallback", () => {
    const assignments = buildCategoryAssignments(catalog, supported);
    expect(assignments.size).toBe(supportJson.supportedCraftableIds.length);
    expect([...assignments.values()].every((value) => value === "bag" || value === "cape" || value === "other" || /^(helmet|armor|shoes|weapon|offhand):(cloth|leather|plate)$/.test(value))).toBe(true);
    expect([...assignments.values()].filter((value) => value === "other").length).toBeGreaterThan(0);
  });
});

describe("CategoryTree", () => {
  it("expands, selects, resets, closes with Escape/outside, and disables coming-soon nodes", async () => {
    const user = userEvent.setup();
    const TestTree = () => { const [value, setValue] = useState<CategorySelection>("all"); return <CategoryTree value={value} onChange={setValue} />; };
    render(<TestTree />);
    const trigger = screen.getByRole("button", { name: /All Supported/ });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Category options")).toBeVisible();
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(screen.queryByRole("treeitem")).not.toBeInTheDocument();
    await user.tab(); expect(screen.getByRole("button", { name: "All Supported" })).toHaveFocus();
    await user.tab({ shift: true }); expect(trigger).toHaveFocus();
    screen.getByText("Equipment").focus(); expect(screen.getByText("Equipment")).toHaveFocus();
    expect(screen.getByText("Equipment").tagName).toBe("SUMMARY");
    await user.click(screen.getByText("Equipment"));
    const equipment = screen.getByText("Equipment").closest("details")!;
    expect(equipment).toHaveAttribute("open");
    await user.click(screen.getByText("Helmet"));
    screen.getByRole("button", { name: "Equipment / Helmet / Cloth" }).focus();
    expect(screen.getByRole("button", { name: "Equipment / Helmet / Cloth" })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: /Equipment \/ Helmet \/ Cloth/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Equipment \/ Helmet \/ Cloth/ })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: /Equipment \/ Helmet \/ Cloth/ }));
    expect(screen.getByRole("button", { name: /Consumables/ })).toBeDisabled();
    const reopenedEquipment = screen.getByText("Equipment").closest("details")!;
    await user.click(screen.getByText("Equipment")); expect(reopenedEquipment).toHaveAttribute("open");
    await user.click(screen.getByText("Equipment")); expect(reopenedEquipment).not.toHaveAttribute("open");
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Category options")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Equipment \/ Helmet \/ Cloth/ })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /Equipment \/ Helmet \/ Cloth/ }));
    await user.click(document.body);
    expect(screen.queryByLabelText("Category options")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Equipment \/ Helmet \/ Cloth/ }));
    await user.click(screen.getByRole("button", { name: "Reset filter" }));
    expect(screen.getByRole("button", { name: /All Supported/ })).toBeVisible();
  });
});

describe("category filtering with the production catalog", () => {
  it("filters verified slots/materials, direct categories, combined controls, reset, and empty results", async () => {
    const user = userEvent.setup();
    render(<App catalogLoader={async () => catalog} priceLoader={async () => null} />);
    const search = await screen.findByLabelText("Cari equipment");
    const choose = async (branch: string, leaf: string) => {
      await user.clear(search);
      await user.click(screen.getByRole("button", { name: /All Supported|Equipment \// }));
      await user.click(screen.getByText("Equipment"));
      if (["Bag", "Cape", "Other Equipment"].includes(branch)) await user.click(screen.getByRole("button", { name: `Equipment / ${branch}` }));
      else { await user.click(screen.getByText(branch)); await user.click(screen.getByRole("button", { name: `Equipment / ${branch} / ${leaf.replace(/ \(.+\)/, "")}` })); }
    };
    const expectItem = async (itemId: string) => { await user.type(search, itemId); expect(screen.getByLabelText("Item crafting")).toHaveValue(itemId); };

    await choose("Helmet", "Cloth (Kain)");
    await user.type(search, "T4_HEAD_CLOTH_SET1");
    await user.selectOptions(screen.getByLabelText("Filter tier"), "4");
    await user.selectOptions(screen.getByLabelText("Filter enchantment"), "1");
    expect(screen.getByLabelText("Item crafting")).toHaveValue("T4_HEAD_CLOTH_SET1@1");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText(/6.066 equipment cocok/)).toBeVisible();
    expect(screen.getByLabelText("Item crafting").querySelectorAll("option")).toHaveLength(100);

    await choose("Armor", "Leather (Kulit)"); await expectItem("T4_ARMOR_LEATHER_SET1");
    await choose("Shoes", "Plate (Baja)"); await expectItem("T4_SHOES_PLATE_SET1");
    await choose("Weapon", "Cloth (Kain)"); await expectItem("T3_MAIN_HOLYSTAFF");
    await choose("Off-hand", "Cloth (Kain)"); await expectItem("T3_OFF_TORCH");
    await choose("Bag", ""); await expectItem("T2_BAG");
    await choose("Cape", ""); await expectItem("T2_CAPE");

    await user.clear(search); await user.type(search, "NO_SUCH_SUPPORTED_ITEM");
    expect(screen.getByText("0 equipment cocok")).toBeVisible();
    expect(screen.getByRole("option", { name: "Tidak ada equipment cocok" })).toBeVisible();
  });

  it("does not remove an added target when category navigation changes", async () => {
    const user = userEvent.setup();
    render(<App catalogLoader={async () => catalog} priceLoader={async () => null} />);
    const search = await screen.findByLabelText("Cari equipment");
    await user.type(search, "T4_ARMOR_LEATHER_SET1");
    await user.selectOptions(screen.getByLabelText("Item crafting"), "T4_ARMOR_LEATHER_SET1");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.click(screen.getByRole("button", { name: /All Supported/ }));
    await user.click(screen.getByText("Equipment"));
    await user.click(screen.getByRole("button", { name: "Equipment / Bag" }));
    expect(screen.getByLabelText("Quantity T4_ARMOR_LEATHER_SET1")).toHaveValue(1);
  });
});
