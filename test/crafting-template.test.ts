import { describe, expect, it } from "vitest";
import {
  createPortableTemplate, DRAFT_STORAGE_KEY, MAX_TEMPLATE_BYTES, parsePortableTemplate, readDraft, readTemplates,
  serializeTemplate, TEMPLATE_FORMAT, TEMPLATE_SCHEMA_VERSION, TEMPLATE_STORAGE_KEY, templateFilename, validateTargets,
  writeDraft, writeTemplates, type SavedCraftingTemplate,
} from "../src/crafting-template.js";

const supported = new Set(["T4_ARMOR_CLOTH_SET1", "T5_MAIN_HOLYSTAFF", "T6_2H_HAMMER"]);
const targets = [
  { itemId: "T4_ARMOR_CLOTH_SET1", quantity: 30 },
  { itemId: "T5_MAIN_HOLYSTAFF", quantity: 20 },
  { itemId: "T6_2H_HAMMER", quantity: 10 },
];

describe("crafting template schema and storage", () => {
  it("round-trips exact item IDs and quantities through exported JSON", () => {
    const exported = createPortableTemplate("Crafting BM Harian", targets, "2026-11-01T12:00:00.000Z");
    expect(exported).toMatchObject({ format: TEMPLATE_FORMAT, schemaVersion: TEMPLATE_SCHEMA_VERSION });
    expect(parsePortableTemplate(serializeTemplate(exported), supported).template).toEqual(exported);
    expect(templateFilename(exported.name)).toBe("crafting-bm-harian.json");
  });

  it("combines duplicate IDs deterministically and reports them", () => {
    const value = createPortableTemplate("Duplicate", targets.slice(0, 1));
    value.targets.push({ itemId: "T4_ARMOR_CLOTH_SET1", quantity: 12 });
    const parsed = parsePortableTemplate(JSON.stringify(value), supported);
    expect(parsed.template.targets).toEqual([{ itemId: "T4_ARMOR_CLOTH_SET1", quantity: 42 }]);
    expect(parsed.duplicateItemIds).toEqual(["T4_ARMOR_CLOTH_SET1"]);
  });

  it.each([
    ["invalid JSON", "{", "bukan JSON"],
    ["wrong format", JSON.stringify({ format: "other", schemaVersion: 1 }), "Format"],
    ["wrong version", JSON.stringify({ format: TEMPLATE_FORMAT, schemaVersion: 2 }), "Schema version"],
  ])("rejects %s", (_label, value, message) => expect(() => parsePortableTemplate(value, supported)).toThrow(message));

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe quantity %s", (quantity) => {
    const value = { ...createPortableTemplate("Invalid", targets.slice(0, 1)), targets: [{ itemId: "T4_ARMOR_CLOTH_SET1", quantity }] };
    expect(() => parsePortableTemplate(JSON.stringify(value), supported)).toThrow("Quantity");
  });

  it("rejects empty, unsupported, malformed, and oversized imports without partial output", () => {
    expect(() => parsePortableTemplate(JSON.stringify({ ...createPortableTemplate("Empty", targets.slice(0, 1)), targets: [] }), supported)).toThrow("tidak boleh kosong");
    expect(() => parsePortableTemplate(JSON.stringify({ ...createPortableTemplate("Unknown", targets.slice(0, 1)), targets: [{ itemId: "T9_UNKNOWN", quantity: 1 }] }), supported)).toThrow("T9_UNKNOWN");
    expect(() => validateTargets([{ itemId: "bad id", quantity: 1 }])).toThrow("item ID");
    expect(() => parsePortableTemplate(" ".repeat(MAX_TEMPLATE_BYTES + 1), supported)).toThrow("1 MiB");
  });

  it("persists an empty draft distinctly from a missing draft", () => {
    expect(readDraft(localStorage, supported)).toBeUndefined();
    writeDraft(localStorage, []);
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();
    expect(readDraft(localStorage, supported)).toEqual([]);
  });

  it("persists independent named snapshots", () => {
    const templates: SavedCraftingTemplate[] = [
      { id: "one", name: "T4", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", targets: targets.slice(0, 1) },
      { id: "two", name: "T5", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", targets: targets.slice(1, 2) },
    ];
    writeTemplates(localStorage, templates);
    const restored = readTemplates(localStorage, supported);
    restored[0]!.targets[0]!.quantity = 99;
    expect(restored[1]!.targets).toEqual(targets.slice(1, 2));
    expect(JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY)!).templates[0].targets[0].quantity).toBe(30);
  });

  it("reports corrupted storage without erasing it", () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, "broken");
    localStorage.setItem(TEMPLATE_STORAGE_KEY, "broken");
    expect(() => readDraft(localStorage, supported)).toThrow("rusak");
    expect(() => readTemplates(localStorage, supported)).toThrow("rusak");
    expect(localStorage.getItem(TEMPLATE_STORAGE_KEY)).toBe("broken");
  });

  it("surfaces storage quota failures", () => {
    const unavailable = { setItem: () => { throw new DOMException("quota", "QuotaExceededError"); } } as unknown as Storage;
    expect(() => writeDraft(unavailable, targets)).toThrow("quota");
    expect(() => writeTemplates(unavailable, [])).toThrow("quota");
  });

  it("supports a 45-item target plan without truncation", () => {
    const large = Array.from({ length: 45 }, (_, index) => ({ itemId: `T4_ITEM_${index}`, quantity: index + 1 }));
    expect(validateTargets(large).targets).toEqual(large);
  });
});
