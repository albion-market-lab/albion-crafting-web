import type { CraftTarget } from "@albion-market-lab/crafting-calculator";

export const DRAFT_STORAGE_KEY = "albion-market-lab:crafting-draft:v1";
export const TEMPLATE_STORAGE_KEY = "albion-market-lab:crafting-templates:v1";
export const TEMPLATE_FORMAT = "albion-market-lab-crafting-template";
export const TEMPLATE_SCHEMA_VERSION = 1;
export const MAX_TEMPLATE_BYTES = 1_048_576;
export const MAX_TEMPLATE_TARGETS = 5_000;

export interface PortableCraftingTemplate {
  format: typeof TEMPLATE_FORMAT;
  schemaVersion: typeof TEMPLATE_SCHEMA_VERSION;
  name: string;
  exportedAt: string;
  targets: CraftTarget[];
}

export interface SavedCraftingTemplate {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  targets: CraftTarget[];
}

export interface ValidatedImport {
  template: PortableCraftingTemplate;
  duplicateItemIds: string[];
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validName = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 120;
const ITEM_ID_PATTERN = /^[A-Z0-9_@]+$/;

export function validateTargets(value: unknown, supportedItemIds?: ReadonlySet<string>, allowEmpty = true): { targets: CraftTarget[]; duplicateItemIds: string[] } {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new Error(allowEmpty ? "Daftar target tidak valid." : "Template tidak boleh kosong.");
  if (value.length > MAX_TEMPLATE_TARGETS) throw new Error(`Template melebihi batas ${MAX_TEMPLATE_TARGETS} target.`);
  const quantities = new Map<string, number>();
  const duplicateItemIds = new Set<string>();
  const unsupported = new Set<string>();
  for (const entry of value) {
    if (!record(entry) || typeof entry.itemId !== "string" || !ITEM_ID_PATTERN.test(entry.itemId)) throw new Error("Template memiliki item ID yang tidak valid.");
    if (!Number.isSafeInteger(entry.quantity) || (entry.quantity as number) <= 0) throw new Error(`Quantity '${entry.itemId}' harus berupa bilangan bulat positif yang aman.`);
    if (supportedItemIds && !supportedItemIds.has(entry.itemId)) unsupported.add(entry.itemId);
    const previous = quantities.get(entry.itemId) ?? 0;
    if (previous) duplicateItemIds.add(entry.itemId);
    const quantity = previous + (entry.quantity as number);
    if (!Number.isSafeInteger(quantity)) throw new Error(`Total quantity '${entry.itemId}' melebihi batas aman.`);
    quantities.set(entry.itemId, quantity);
  }
  if (unsupported.size) throw new Error(`Item tidak tersedia atau tidak didukung: ${[...unsupported].join(", ")}.`);
  return { targets: [...quantities].map(([itemId, quantity]) => ({ itemId, quantity })), duplicateItemIds: [...duplicateItemIds] };
}

export function parsePortableTemplate(text: string, supportedItemIds: ReadonlySet<string>): ValidatedImport {
  if (new Blob([text]).size > MAX_TEMPLATE_BYTES) throw new Error("File template melebihi batas 1 MiB.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("File bukan JSON yang valid."); }
  if (!record(value) || value.format !== TEMPLATE_FORMAT) throw new Error("Format template tidak didukung.");
  if (value.schemaVersion !== TEMPLATE_SCHEMA_VERSION) throw new Error(`Schema version '${String(value.schemaVersion)}' tidak didukung.`);
  if (!validName(value.name)) throw new Error("Nama template wajib diisi dan maksimal 120 karakter.");
  if (typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt))) throw new Error("Waktu export template tidak valid.");
  const { targets, duplicateItemIds } = validateTargets(value.targets, supportedItemIds, false);
  return { template: { format: TEMPLATE_FORMAT, schemaVersion: TEMPLATE_SCHEMA_VERSION, name: value.name.trim(), exportedAt: value.exportedAt, targets }, duplicateItemIds };
}

export function createPortableTemplate(name: string, targets: CraftTarget[], exportedAt = new Date().toISOString()): PortableCraftingTemplate {
  if (!validName(name)) throw new Error("Nama template wajib diisi dan maksimal 120 karakter.");
  return { format: TEMPLATE_FORMAT, schemaVersion: TEMPLATE_SCHEMA_VERSION, name: name.trim(), exportedAt, targets: validateTargets(targets, undefined, false).targets };
}

export const serializeTemplate = (template: PortableCraftingTemplate) => `${JSON.stringify(template, null, 2)}\n`;
export const templateFilename = (name: string) => `${name.trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "crafting-plan"}.json`;

export function downloadTemplate(template: PortableCraftingTemplate) {
  const url = URL.createObjectURL(new Blob([serializeTemplate(template)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = templateFilename(template.name);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function readDraft(storage: Storage, supportedItemIds: ReadonlySet<string>): CraftTarget[] | undefined {
  const raw = storage.getItem(DRAFT_STORAGE_KEY);
  if (raw === null) return undefined;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Draft tersimpan rusak dan tidak dimuat."); }
  if (!record(value) || value.schemaVersion !== TEMPLATE_SCHEMA_VERSION) throw new Error("Versi draft tersimpan tidak didukung.");
  return validateTargets(value.targets, supportedItemIds).targets;
}

export function writeDraft(storage: Storage, targets: CraftTarget[]) {
  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ schemaVersion: TEMPLATE_SCHEMA_VERSION, targets: validateTargets(targets).targets }));
}

export function readTemplates(storage: Storage, supportedItemIds: ReadonlySet<string>): SavedCraftingTemplate[] {
  const raw = storage.getItem(TEMPLATE_STORAGE_KEY);
  if (raw === null) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Daftar template tersimpan rusak dan tidak dimuat."); }
  if (!record(value) || value.schemaVersion !== TEMPLATE_SCHEMA_VERSION || !Array.isArray(value.templates)) throw new Error("Versi template tersimpan tidak didukung.");
  return value.templates.map((template) => {
    if (!record(template) || typeof template.id !== "string" || !template.id || !validName(template.name) || typeof template.createdAt !== "string" || Number.isNaN(Date.parse(template.createdAt)) || typeof template.updatedAt !== "string" || Number.isNaN(Date.parse(template.updatedAt))) throw new Error("Metadata template tersimpan tidak valid.");
    return { id: template.id, name: template.name.trim(), createdAt: template.createdAt, updatedAt: template.updatedAt, targets: validateTargets(template.targets, supportedItemIds, false).targets };
  });
}

export function writeTemplates(storage: Storage, templates: SavedCraftingTemplate[]) {
  storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify({ schemaVersion: TEMPLATE_SCHEMA_VERSION, templates }));
}

export const newTemplateId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
