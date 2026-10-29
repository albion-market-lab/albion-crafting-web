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
      { server: "East/Asia", itemId: "T6_FIBER", city: "Bridgewatch", quality: 1, highestBuyPrice: 100, highestBuyObservedAt: "2026-10-29T05:00:00Z" },
      { server: "East/Asia", itemId: "T6_FIBER", city: "Martlock", quality: 1, highestBuyPrice: 80, highestBuyObservedAt: "2026-10-28T05:00:00Z" },
      { server: "East/Asia", itemId: "T6_FIBER", city: "Lymhurst", quality: 1, highestBuyPrice: 120, highestBuyObservedAt: "2026-10-29T04:00:00Z" },
      { server: "East/Asia", itemId: "T6_FIBER", city: "Fort Sterling", quality: 1, highestBuyPrice: null, highestBuyObservedAt: "2026-10-29T05:00:00Z" },
    ] }));
    render(<App catalogLoader={async () => catalog} priceLoader={priceLoader} now={now} />);

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

    for (const item of expected.craftOutputs) {
      const row = screen.getAllByText(item.itemId).map((node) => node.closest("tr")).find(Boolean)!;
      expect(within(row).getAllByRole("cell")[1]).toHaveTextContent(String(item.requiredQuantity));
    }
    for (const item of expected.refiningPlan) {
      const row = screen.getByText(item.itemId).closest("tr")!;
      expect(within(row).getAllByRole("cell")[1]).toHaveTextContent(new Intl.NumberFormat("id-ID").format(item.requiredQuantity));
    }
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
    expect(within(martlock).getByText("81 silver")).toBeVisible();
    expect(within(martlock).getByText("stale")).toBeVisible();
    expect(screen.getAllByText("518.400 silver")).toHaveLength(2);
    expect(screen.getByText(/Estimasi modal · partial/)).toBeVisible();
  });
});
