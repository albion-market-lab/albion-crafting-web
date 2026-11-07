import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CatalogData } from "@albion-market-lab/crafting-calculator";
import catalogJson from "./fixtures/catalog-v3.json";
import { App } from "../src/App.js";
import { createPortableTemplate, DRAFT_STORAGE_KEY, serializeTemplate, TEMPLATE_STORAGE_KEY } from "../src/crafting-template.js";
import type { PriceSnapshot } from "../src/prices.js";

const catalog = catalogJson as CatalogData;
const loader = async () => catalog;
const robe = { itemId: "T6_ARMOR_CLOTH_SET1", quantity: 12 };
const boots = { itemId: "T5_SHOES_PLATE_SET1", quantity: 7 };
const saved = (targets = [boots]) => ({ schemaVersion: 1, templates: [{ id: "saved-1", name: "Saved T5", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", targets }] });

describe("crafting plan persistence UI", () => {
  it("restores before persisting, then autosaves edit, delete, and deliberate empty state", async () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, targets: [robe] }));
    const user = userEvent.setup();
    const view = render(<App catalogLoader={loader} />);
    const quantity = await screen.findByLabelText(`Quantity ${robe.itemId}`);
    expect(quantity).toHaveValue(12);
    expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).targets).toEqual([robe]);

    await user.clear(quantity); await user.type(quantity, "19"); await user.tab();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).targets[0].quantity).toBe(19));
    await user.click(screen.getByRole("button", { name: "Hapus" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).targets).toEqual([]));
    view.unmount();

    render(<App catalogLoader={loader} />);
    expect(await screen.findByText("Plan masih kosong.")).toBeVisible();
  });

  it("autosaves a new target and restores it after remount", async () => {
    const user = userEvent.setup();
    const view = render(<App catalogLoader={loader} />);
    await screen.findByLabelText("Item crafting");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).targets).toEqual([{ itemId: "T6_ARMOR_CLOTH_SET1", quantity: 1 }]));
    view.unmount();
    render(<App catalogLoader={loader} />);
    expect(await screen.findByLabelText("Quantity T6_ARMOR_CLOTH_SET1")).toHaveValue(1);
  });

  it("restores all 45 targets without truncation", async () => {
    const large = structuredClone(catalog) as CatalogData & { supportedCraftableIds: string[] };
    const base = large.items[0]!;
    const items = Array.from({ length: 45 }, (_, index) => ({ ...base, itemId: `T4_FAKE_${index}`, displayName: `Fixture ${index}`, hasCraftingRecipe: true }));
    large.items = items;
    large.supportedCraftableIds = items.map(({ itemId }) => itemId);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, targets: items.map(({ itemId }, index) => ({ itemId, quantity: index + 1 })) }));
    render(<App catalogLoader={async () => large} />);
    expect(await screen.findByLabelText("Quantity T4_FAKE_44")).toHaveValue(45);
    expect(screen.getAllByLabelText(/^Quantity T4_FAKE_/)).toHaveLength(45);
  });

  it("keeps planning usable when autosave hits a storage error", async () => {
    const user = userEvent.setup();
    render(<App catalogLoader={loader} />);
    await screen.findByLabelText("Item crafting");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    expect(await screen.findByText(/Draft tidak dapat disimpan/)).toBeVisible();
    expect(screen.getByLabelText("Quantity T6_ARMOR_CLOTH_SET1")).toHaveValue(1);
    setItem.mockRestore();
  });

  it("keeps the app usable and existing data untouched when storage is corrupted", async () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, "broken");
    localStorage.setItem(TEMPLATE_STORAGE_KEY, "broken");
    render(<App catalogLoader={loader} />);
    expect(await screen.findByText(/Draft tersimpan rusak/)).toBeVisible();
    expect(screen.getByText("Plan masih kosong.")).toBeVisible();
    expect(localStorage.getItem(TEMPLATE_STORAGE_KEY)).toBe("broken");
  });

  it("saves, renames, updates, loads, and deletes independent templates", async () => {
    const user = userEvent.setup();
    render(<App catalogLoader={loader} />);
    await screen.findByLabelText("Item crafting");
    await user.click(screen.getByRole("button", { name: "Tambah item" }));
    await user.type(screen.getByLabelText("Nama template"), "Daily Plan");
    await user.click(screen.getByRole("button", { name: "Save Template" }));
    const storedBeforeEdit = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY)!).templates[0];
    expect(storedBeforeEdit.targets[0].quantity).toBe(1);

    const quantity = screen.getByLabelText("Quantity T6_ARMOR_CLOTH_SET1");
    await user.clear(quantity); await user.type(quantity, "8"); await user.tab();
    expect(JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY)!).templates[0].targets[0].quantity).toBe(1);
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY)!).templates[0].targets[0].quantity).toBe(8);

    vi.spyOn(window, "prompt").mockReturnValue("Renamed Plan");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.getByText("Renamed Plan")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    expect(await screen.findByRole("heading", { name: /Crafting Output/ })).toBeVisible();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Load" }));
    expect(screen.queryByRole("heading", { name: /Crafting Output/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quantity T6_ARMOR_CLOTH_SET1")).toHaveValue(8);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Belum ada saved template.")).toBeVisible();
  });

  it("previews and saves valid JSON without replacing the active draft", async () => {
    const user = userEvent.setup();
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, targets: [robe] }));
    render(<App catalogLoader={loader} />);
    await screen.findByLabelText(`Quantity ${robe.itemId}`);
    const file = new File([serializeTemplate(createPortableTemplate("Imported Plan", [boots], "2026-11-01T12:00:00Z"))], "plan.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Pilih file template JSON"), file);
    expect(await screen.findByText("Import preview")).toBeVisible();
    expect(screen.getByLabelText(`Quantity ${robe.itemId}`)).toHaveValue(12);
    expect(screen.queryByLabelText(`Quantity ${boots.itemId}`)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Simpan Import" }));
    expect(screen.getByText("Imported Plan")).toBeVisible();
    expect(screen.getByLabelText(`Quantity ${robe.itemId}`)).toHaveValue(12);
  });

  it("preserves the draft on invalid import and invalidates an obsolete price request on template load", async () => {
    let resolve!: (value: PriceSnapshot | null) => void;
    const pending = new Promise<PriceSnapshot | null>((done) => { resolve = done; });
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, targets: [robe] }));
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(saved()));
    const user = userEvent.setup();
    render(<App catalogLoader={loader} priceLoader={() => pending} />);
    await screen.findByLabelText(`Quantity ${robe.itemId}`);
    await user.upload(screen.getByLabelText("Pilih file template JSON"), new File(["{"], "broken.json", { type: "application/json" }));
    expect(await screen.findByText(/bukan JSON/)).toBeVisible();
    expect(screen.getByLabelText(`Quantity ${robe.itemId}`)).toHaveValue(12);
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Load" }));
    expect(screen.getByLabelText(`Quantity ${boots.itemId}`)).toHaveValue(7);
    await act(async () => { resolve({ server: "East/Asia", items: [] }); await pending; });
    await waitFor(() => expect(screen.queryByText("Snapshot harga kosong")).not.toBeInTheDocument());
  });

  it("recalculates crafting, refining, shopping, and Smart Buy from a loaded template", async () => {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(saved([robe])));
    const priceLoader = vi.fn(async (itemIds: string[]) => ({ server: "East/Asia" as const, items: itemIds.map((itemId) => ({ server: "East/Asia" as const, itemId, city: "Martlock", quality: 1, highestBuyPrice: 100, highestBuyObservedAt: new Date().toISOString() })) }));
    const user = userEvent.setup();
    render(<App catalogLoader={loader} priceLoader={priceLoader} />);
    await screen.findByRole("button", { name: "Load" });
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(screen.getByRole("button", { name: /Hitung kebutuhan/ }));
    expect(screen.getByRole("heading", { name: /Crafting Output/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Refining Plan/ })).toBeVisible();
    expect(screen.getByText("(T6_FIBER)").closest("article")).toHaveTextContent("768");
    expect(await screen.findAllByText("fresh")).not.toHaveLength(0);
    expect(priceLoader).toHaveBeenCalledWith(["T2_FIBER", "T3_FIBER", "T4_FIBER", "T5_FIBER", "T6_FIBER"]);
  });
});
