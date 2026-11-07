import { useRef, useState, type ChangeEvent } from "react";
import type { CraftTarget } from "@albion-market-lab/crafting-calculator";
import { createPortableTemplate, downloadTemplate, MAX_TEMPLATE_BYTES, newTemplateId, parsePortableTemplate, type PortableCraftingTemplate, type SavedCraftingTemplate } from "./crafting-template.js";

const readFileText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("File template tidak dapat dibaca."));
  reader.onerror = () => reject(new Error("File template tidak dapat dibaca."));
  reader.readAsText(file);
});

interface CraftingTemplatesProps {
  targets: CraftTarget[];
  templates: SavedCraftingTemplate[];
  supportedItemIds: ReadonlySet<string>;
  onLoad: (targets: CraftTarget[]) => void;
  onAdd: (template: SavedCraftingTemplate) => boolean;
  onRename: (template: SavedCraftingTemplate, name: string, updatedAt: string) => boolean;
  onUpdate: (template: SavedCraftingTemplate, targets: CraftTarget[], updatedAt: string) => boolean;
  onDelete: (template: SavedCraftingTemplate) => boolean;
}

export function CraftingTemplates({ targets, templates, supportedItemIds, onLoad, onAdd, onRename, onUpdate, onDelete }: CraftingTemplatesProps) {
  const [name, setName] = useState("");
  const [feedback, setFeedback] = useState("");
  const [importPreview, setImportPreview] = useState<PortableCraftingTemplate>();
  const fileInput = useRef<HTMLInputElement>(null);
  const now = () => new Date().toISOString();

  const save = () => {
    try {
      const portable = createPortableTemplate(name, targets);
      const timestamp = now();
      if (onAdd({ id: newTemplateId(), name: portable.name, createdAt: timestamp, updatedAt: timestamp, targets: portable.targets })) { setName(""); setFeedback(`Template '${portable.name}' disimpan.`); }
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : "Template gagal disimpan."); }
  };
  const load = (template: SavedCraftingTemplate) => {
    if (targets.length > 0 && !window.confirm(`Ganti current draft dengan template '${template.name}'?`)) return;
    onLoad(template.targets.map((target) => ({ ...target })));
    setFeedback(`Template '${template.name}' dimuat. Klik Hitung kebutuhan untuk menghitung ulang.`);
  };
  const rename = (template: SavedCraftingTemplate) => {
    const nextName = window.prompt("Nama template baru", template.name)?.trim();
    if (!nextName || nextName.length > 120) return;
    if (onRename(template, nextName, now())) setFeedback(`Template diubah menjadi '${nextName}'.`);
  };
  const update = (template: SavedCraftingTemplate) => {
    if (targets.length === 0) { setFeedback("Current draft kosong dan tidak dapat digunakan untuk update."); return; }
    if (onUpdate(template, targets, now())) setFeedback(`Template '${template.name}' diperbarui dari current draft.`);
  };
  const remove = (template: SavedCraftingTemplate) => {
    if (window.confirm(`Hapus template '${template.name}'?`) && onDelete(template)) setFeedback(`Template '${template.name}' dihapus.`);
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportPreview(undefined);
    try {
      if (file.size > MAX_TEMPLATE_BYTES) throw new Error("File template melebihi batas 1 MiB.");
      const imported = parsePortableTemplate(await readFileText(file), supportedItemIds);
      setImportPreview(imported.template);
      setFeedback(imported.duplicateItemIds.length ? `Duplikat digabung dengan menjumlahkan quantity: ${imported.duplicateItemIds.join(", ")}.` : "Template valid. Simpan import untuk menambahkannya ke daftar.");
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : "Import template gagal."); }
  };
  const saveImport = () => {
    if (!importPreview) return;
    const timestamp = now();
    const saved = { id: newTemplateId(), name: importPreview.name, createdAt: timestamp, updatedAt: timestamp, targets: importPreview.targets.map((target) => ({ ...target })) };
    if (onAdd(saved)) { setFeedback(`Template '${saved.name}' berhasil diimport tanpa mengubah current draft.`); setImportPreview(undefined); }
  };

  return <section className="template-panel" aria-labelledby="template-heading">
    <div className="section-heading"><span>Draft</span><h2 id="template-heading">Crafting Plan Templates</h2></div>
    <p className="template-help"><strong>Current Draft</strong> tersimpan otomatis. <strong>Saved Template</strong> hanya berubah saat disimpan atau diperbarui. JSON adalah backup portabel.</p>
    <div className="template-controls">
      <label>Nama template<input aria-label="Nama template" maxLength={120} placeholder="Contoh: Crafting BM Harian" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button type="button" onClick={save} disabled={targets.length === 0}>Save Template</button>
      <button type="button" onClick={() => fileInput.current?.click()}>Import JSON</button>
      <button type="button" onClick={() => downloadTemplate(createPortableTemplate(name.trim() || "Current Draft", targets))} disabled={targets.length === 0}>Download Current JSON</button>
      <input ref={fileInput} className="visually-hidden" aria-label="Pilih file template JSON" type="file" accept="application/json,.json" onChange={(event) => void importFile(event)} />
    </div>
    {importPreview && <div className="import-preview"><span>Import preview</span><strong>{importPreview.name}</strong><small>{importPreview.targets.length} jenis equipment</small><button type="button" onClick={saveImport}>Simpan Import</button><button type="button" onClick={() => setImportPreview(undefined)}>Batal</button></div>}
    {feedback && <p className="template-feedback" role="status">{feedback}</p>}
    {templates.length === 0 ? <p className="muted">Belum ada saved template.</p> : <div className="table-wrap"><table className="template-table"><thead><tr><th>Template</th><th>Equipment</th><th>Actions</th></tr></thead><tbody>{templates.map((template) => <tr key={template.id}><td><strong>{template.name}</strong><small>Updated {new Date(template.updatedAt).toLocaleString("id-ID")}</small></td><td>{template.targets.length}</td><td><div className="template-actions"><button type="button" onClick={() => load(template)}>Load</button><button type="button" onClick={() => downloadTemplate(createPortableTemplate(template.name, template.targets))}>Export</button><button type="button" onClick={() => rename(template)}>Rename</button><button type="button" onClick={() => update(template)}>Update</button><button className="danger" type="button" onClick={() => remove(template)}>Delete</button></div></td></tr>)}</tbody></table></div>}
  </section>;
}
