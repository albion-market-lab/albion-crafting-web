import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CatalogData } from "@albion-market-lab/crafting-calculator";
import catalogJson from "../public/catalog-v3.json";
import { App } from "../src/App.js";

const catalog = catalogJson as CatalogData;
const loader = async () => catalog;

describe("multi-target crafting planner", () => {
  it("aggregates duplicate targets and renders calculator results", async () => {
    const user = userEvent.setup();
    render(<App catalogLoader={loader} />);
    const item = await screen.findByLabelText("Item crafting");
    const quantity = screen.getByLabelText("Quantity");

    await user.clear(quantity);
    await user.type(quantity, "60");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.clear(quantity);
    await user.type(quantity, "40");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    expect(screen.getByLabelText("Quantity T6_ARMOR_CLOTH_SET1")).toHaveValue(100);

    await user.selectOptions(item, "T5_SHOES_PLATE_SET1");
    await user.clear(quantity);
    await user.type(quantity, "20");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));

    expect(screen.getByRole("heading", { name: "Crafting Output" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Refining Plan" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Shopping List" })).toBeVisible();
    const fiber = screen.getByText("T6_FIBER").closest("article")!;
    expect(within(fiber).getByText("6.400")).toBeVisible();
    expect(screen.getByText("Belum ada data harga")).toBeVisible();
  });

  it("supports editing and deleting targets", async () => {
    const user = userEvent.setup();
    render(<App catalogLoader={loader} />);
    await screen.findByLabelText("Item crafting");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    const targetQuantity = screen.getByLabelText("Quantity T6_ARMOR_CLOTH_SET1");
    await user.clear(targetQuantity);
    await user.type(targetQuantity, "12");
    expect(targetQuantity).toHaveValue(12);
    await user.click(screen.getByRole("button", { name: "Hapus" }));
    expect(screen.getByText("Plan masih kosong.")).toBeVisible();
  });

  it("rejects invalid quantities", async () => {
    const user = userEvent.setup();
    render(<App catalogLoader={loader} />);
    await screen.findByLabelText("Item crafting");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "0");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    expect(screen.getByRole("alert")).toHaveTextContent("bilangan bulat positif");
  });

  it("shows calculator recipe errors with the affected item ID", async () => {
    const user = userEvent.setup();
    const broken = structuredClone(catalog);
    broken.craftingRecipes = [];
    render(<App catalogLoader={async () => broken} />);
    await screen.findByLabelText("Item crafting");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("T6_ARMOR_CLOTH_SET1");
  });

  it("shows loading, empty, and missing-name states", async () => {
    const pending = new Promise<CatalogData>(() => undefined);
    const loading = render(<App catalogLoader={() => pending} />);
    expect(screen.getByText("Memuat katalog crafting…")).toBeVisible();
    loading.unmount();

    const empty = render(<App catalogLoader={async () => ({ items: [], craftingRecipes: [], refiningRecipes: [] })} />);
    expect(await screen.findByText("Belum ada item craftable")).toBeVisible();
    empty.unmount();

    const nameless = structuredClone(catalog);
    nameless.items[0]!.displayName = "";
    nameless.items[0]!.nameStatus = "name_missing";
    render(<App catalogLoader={async () => nameless} />);
    expect(await screen.findByRole("option", { name: /T6_ARMOR_CLOTH_SET1 \(nama belum tersedia\)/ })).toBeVisible();
  });
});
