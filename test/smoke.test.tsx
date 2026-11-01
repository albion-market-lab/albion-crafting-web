import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CatalogData } from "@albion-market-lab/crafting-calculator";
import catalogJson from "../public/catalog-v3.json";
import supportJson from "../public/catalog-support-v3.json";
import expected from "./fixtures/expected-plan-v3.json";
import { App } from "../src/App.js";

const catalog = { ...(catalogJson as CatalogData), supportedCraftableIds: supportJson.supportedCraftableIds };
const now = () => new Date("2026-10-29T06:00:00Z");

describe("Task 11 MVP smoke flow", () => {
  it("runs two real targets through golden refining, shopping, and honest mixed-price UX", async () => {
    const user = userEvent.setup();
    const priceLoader = vi.fn(async (itemIds: string[]) => ({ server: "East/Asia" as const, items: [
      { server: "East/Asia", itemId: "T6_FIBER", city: "Bridgewatch", quality: 1, highestBuyPrice: 80, highestBuyObservedAt: "2026-10-29T05:00:00Z" },
      { server: "East/Asia", itemId: "T6_FIBER", city: "Martlock", quality: 1, highestBuyPrice: 85, highestBuyObservedAt: "2026-10-29T05:00:00Z" },
      { server: "East/Asia", itemId: "T6_FIBER", city: "Lymhurst", quality: 1, highestBuyPrice: 120, highestBuyObservedAt: "2026-10-28T04:00:00Z" },
      { server: "East/Asia", itemId: "T6_FIBER", city: "Fort Sterling", quality: 1, highestBuyPrice: null, highestBuyObservedAt: "2026-10-29T05:00:00Z" },
    ] }));
    const activityLoader = vi.fn(async () => ({ server: "East/Asia" as const, items: [
      { server: "East/Asia", itemId: "T6_FIBER", city: "Bridgewatch", quality: 1, averageDailyUnits: 1_000, coverageDays: 6, observedAt: "2026-10-29T05:00:00Z" },
      { server: "East/Asia", itemId: "T6_FIBER", city: "Martlock", quality: 1, averageDailyUnits: 50_000, coverageDays: 6, observedAt: "2026-10-29T05:00:00Z" },
    ] }));
    render(<App catalogLoader={async () => catalog} priceLoader={priceLoader} activityLoader={activityLoader} now={now} />);

    const search = await screen.findByLabelText("Cari equipment");
    const quantity = screen.getByLabelText("Quantity");
    for (const target of expected.targets) {
      await user.clear(search);
      await user.type(search, target.itemId);
      await user.selectOptions(screen.getByLabelText("Item crafting"), target.itemId);
      await user.clear(quantity);
      await user.type(quantity, String(target.quantity));
      await user.click(screen.getByRole("button", { name: "Tambah item" }));
    }
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));

    const breakdown = screen.getByRole("heading", { name: /Crafting Output/ }).closest("section")!;
    for (const item of expected.craftOutputs) expect(within(breakdown).getByText(new RegExp(`${item.itemId} ·`)).closest("summary")).toHaveTextContent(`Craft ${new Intl.NumberFormat("id-ID").format(item.requiredQuantity)}`);
    await user.click(within(breakdown).getByText(/T6_ARMOR_CLOTH_SET1 ·/).closest("summary")!);
    await user.click(within(breakdown).getByText(/T5_SHOES_PLATE_SET1 ·/).closest("summary")!);
    expect(within(screen.getByRole("table", { name: "Kebutuhan bahan Master's Scholar Robe" })).getByText("1.600")).toBeVisible();
    expect(within(screen.getByRole("table", { name: "Kebutuhan bahan Expert's Soldier Boots" })).getByText("160")).toBeVisible();
    const refining = screen.getByRole("heading", { name: /Refining Plan/ }).closest("section")!;
    for (const item of expected.refiningPlan) expect(within(refining).getAllByText(new RegExp(`^${item.itemId} ·`)).find((node) => node.closest("summary"))!.closest("summary")).toHaveTextContent(`Refine ${new Intl.NumberFormat("id-ID").format(item.requiredQuantity)}`);
    await user.click(within(refining).getByText(/T6_CLOTH ·/).closest("summary")!);
    const t6Cloth = screen.getByRole("table", { name: "Kebutuhan bahan Lavish Cloth" });
    expect(within(t6Cloth).getByText("Amberleaf Cotton")).toBeVisible();
    expect(within(t6Cloth).getByText("6.400")).toBeVisible();
    for (const item of expected.shoppingList) {
      const card = screen.getByText(`(${item.itemId})`).closest("article")!;
      expect(within(card).getByText(new Intl.NumberFormat("id-ID").format(item.quantity))).toBeVisible();
    }
    expect(priceLoader).toHaveBeenCalledWith(expected.shoppingList.map(({ itemId }) => itemId));
    expect(await screen.findAllByText("fresh")).not.toHaveLength(0);
    expect(screen.getAllByText("stale")).not.toHaveLength(0);
    expect(screen.getAllByText("missing")).not.toHaveLength(0);
    const martlock = screen.getByText("Rekomendasi").closest("tr")!;
    expect(within(martlock).getByText("Martlock")).toBeVisible();
    expect(within(martlock).getByText("86 silver")).toBeVisible();
    expect(within(martlock).getByText("fresh")).toBeVisible();
    expect(within(martlock).getByText("50.000")).toBeVisible();
    expect(within(martlock).getByText("0,13 hari")).toBeVisible();
    const cheapest = screen.getByText("Termurah").closest("tr")!;
    expect(within(cheapest).getByText("Bridgewatch")).toBeVisible();
    expect(within(cheapest).getByText("Lebih dari 2 hari")).toBeVisible();
    expect(screen.getByText("Data aktivitas: 2/5 kota")).toBeVisible();
    expect(screen.getByText(/Kota lain belum dapat dibandingkan sepenuhnya/)).toBeVisible();
    expect(screen.getByText(/100% rata-rata unit terjual harian/)).toBeVisible();
    expect(screen.getByText(/Estimasi modal Best Value · partial/)).toBeVisible();
  });
});
