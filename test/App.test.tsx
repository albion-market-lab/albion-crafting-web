import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CatalogData } from "@albion-market-lab/crafting-calculator";
import catalogJson from "./fixtures/catalog-v3.json";
import { App } from "../src/App.js";
import type { PriceSnapshot } from "../src/prices.js";

const catalog = catalogJson as CatalogData;
const loader = async () => catalog;
const now = () => new Date("2026-10-29T06:00:00Z");
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };

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
    const fiber = screen.getByText("(T6_FIBER)").closest("article")!;
    expect(within(fiber).getByText("6.400")).toBeVisible();
    expect(within(fiber).getByText("Fiber · T6")).toBeVisible();
    expect(await screen.findByText("Mode offline")).toBeVisible();
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

  it("searches and filters equipment without rendering the whole catalog", async () => {
    const user = userEvent.setup();
    const large = structuredClone(catalog);
    large.items.push(...Array.from({ length: 1_000 }, (_, index) => ({ ...large.items[0]!, itemId: `T6_FAKE_${index}`, displayName: `Fixture ${index}`, hasCraftingRecipe: true })));
    render(<App catalogLoader={async () => large} />);
    expect(await screen.findByText(/1.002 equipment cocok/)).toBeVisible();
    expect(screen.getByLabelText("Item crafting").querySelectorAll("option")).toHaveLength(100);
    await user.type(screen.getByLabelText("Cari equipment"), "soldier boots");
    await user.selectOptions(screen.getByLabelText("Filter tier"), "5");
    await user.selectOptions(screen.getByLabelText("Filter enchantment"), "0");
    expect(screen.getByRole("option", { name: /Expert's Soldier Boots/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Scholar Robe/ })).not.toBeInTheDocument();
  });

  it("renders successful mixed fresh, stale, and missing private prices", async () => {
    const user = userEvent.setup();
    render(<App catalogLoader={loader} now={now} priceLoader={async () => ({ server: "East/Asia", items: [
      { server: "East/Asia", itemId: "T6_FIBER", city: "Bridgewatch", quality: 1, highestBuyPrice: 100, highestBuyObservedAt: "2026-10-29T05:00:00Z" },
      { server: "East/Asia", itemId: "T6_FIBER", city: "Martlock", quality: 1, highestBuyPrice: 80, highestBuyObservedAt: "2026-10-28T05:00:00Z" },
    ] })} />);
    await screen.findByLabelText("Item crafting");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    expect(await screen.findAllByText("fresh")).not.toHaveLength(0);
    expect(screen.getAllByText("stale")).not.toHaveLength(0);
    expect(screen.getAllByText("missing")).not.toHaveLength(0);
    expect(screen.getAllByText("5.184 silver")).toHaveLength(2);
    expect(screen.getByText("Estimasi modal seluruh Shopping List · partial")).toBeVisible();
    const priceTable = screen.getByRole("table", { name: "Harga Shopping List" });
    expect(within(priceTable).getAllByText("Cotton")).not.toHaveLength(0);
    const fiberFilter = screen.getByRole("button", { name: "Filter harga Amberleaf Cotton" });
    await user.click(fiberFilter);
    expect(fiberFilter).toHaveAttribute("aria-pressed", "true");
    expect(within(priceTable).queryByText("Cotton")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Amberleaf Cotton");
    expect(screen.getByText("Estimasi modal seluruh Shopping List · partial")).toBeVisible();
    expect(screen.getAllByText("5.184 silver")).not.toHaveLength(0);
    await user.click(fiberFilter);
    expect(fiberFilter).toHaveAttribute("aria-pressed", "false");
    expect(within(priceTable).getAllByText("Cotton")).not.toHaveLength(0);
    await user.click(fiberFilter);
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    expect(fiberFilter).toHaveAttribute("aria-pressed", "false");
    await screen.findAllByText("fresh");
    await user.click(fiberFilter);
    const targetQuantity = screen.getByLabelText("Quantity T6_ARMOR_CLOTH_SET1");
    await user.clear(targetQuantity); await user.type(targetQuantity, "2"); await user.tab();
    expect(screen.queryByRole("button", { name: "Filter harga Amberleaf Cotton" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    expect(await screen.findByRole("button", { name: "Filter harga Amberleaf Cotton" })).toHaveAttribute("aria-pressed", "false");
  });

  it("distinguishes empty, offline, and failed price sources while preserving materials", async () => {
    const user = userEvent.setup();
    const view = render(<App catalogLoader={loader} priceLoader={async () => ({ server: "East/Asia", items: [] })} />);
    await screen.findByLabelText("Item crafting");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    expect(await screen.findByText("Snapshot harga kosong")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Refining Plan" })).toBeVisible();
    expect(screen.getByText("Estimasi modal seluruh Shopping List · unavailable")).toBeVisible();
    expect(screen.getAllByText("—")).not.toHaveLength(0);
    expect(screen.queryByText("Rekomendasi")).not.toBeInTheDocument();
    view.unmount();

    const offline = render(<App catalogLoader={loader} priceLoader={async () => null} />);
    await screen.findByLabelText("Item crafting");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    expect(await screen.findByText("Mode offline")).toBeVisible();
    offline.unmount();

    render(<App catalogLoader={loader} priceLoader={async () => { throw new Error("offline"); }} />);
    await screen.findByLabelText("Item crafting");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("tidak dapat dihubungi");
  });

  it("ignores an older price response that finishes after the latest calculation", async () => {
    const user = userEvent.setup();
    const first = deferred<PriceSnapshot | null>();
    const second = deferred<PriceSnapshot | null>();
    const requests = [first, second];
    let call = 0;
    render(<App catalogLoader={loader} now={now} priceLoader={() => requests[call++]!.promise} />);
    await screen.findByLabelText("Item crafting");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    const targetQuantity = screen.getByLabelText("Quantity T6_ARMOR_CLOTH_SET1");
    await user.clear(targetQuantity);
    await user.type(targetQuantity, "2");
    await user.tab();
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    second.resolve({ server: "East/Asia", items: [{ server: "East/Asia", itemId: "T6_FIBER", city: "Martlock", quality: 1, highestBuyPrice: 200, highestBuyObservedAt: "2026-10-29T05:00:00Z" }] });
    expect(await screen.findAllByText("25.728 silver")).toHaveLength(2);
    await act(async () => { first.resolve({ server: "East/Asia", items: [{ server: "East/Asia", itemId: "T6_FIBER", city: "Martlock", quality: 1, highestBuyPrice: 1, highestBuyObservedAt: "2026-10-29T05:00:00Z" }] }); await first.promise; });
    await waitFor(() => expect(screen.getAllByText("25.728 silver")).toHaveLength(2));
    expect(screen.queryByText("128 silver")).not.toBeInTheDocument();
  });

  it("invalidates a pending price request when the target changes", async () => {
    const user = userEvent.setup();
    const pending = deferred<PriceSnapshot | null>();
    render(<App catalogLoader={loader} now={now} priceLoader={() => pending.promise} />);
    await screen.findByLabelText("Item crafting");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    await user.click(screen.getByRole("button", { name: "Hapus" }));
    await act(async () => { pending.resolve({ server: "East/Asia", items: [] }); await pending.promise; });
    await waitFor(() => expect(screen.getByText("Plan masih kosong.")).toBeVisible());
    expect(screen.queryByText("Snapshot harga kosong")).not.toBeInTheDocument();
  });
});
