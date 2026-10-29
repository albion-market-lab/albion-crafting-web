import { useEffect, useMemo, useState } from "react";
import { calculateMaterials, type CalculationResult, type CatalogData, type CraftTarget, type ProcessPlan } from "@albion-market-lab/crafting-calculator";
import { loadCatalog } from "./catalog.js";

interface AppProps {
  catalogLoader?: () => Promise<CatalogData>;
}

const integer = new Intl.NumberFormat("id-ID");

function PlanTable({ title, rows, nameOf }: { title: string; rows: ProcessPlan[]; nameOf: (id: string) => string }) {
  return <section className="result-card">
    <div className="section-heading"><span>Plan</span><h2>{title}</h2></div>
    {rows.length === 0 ? <p className="muted">Tidak ada proses yang diperlukan.</p> : <div className="table-wrap"><table>
      <thead><tr><th>Item</th><th>Butuh</th><th>Proses</th><th>Output</th><th>Surplus</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.itemId}><td><strong>{nameOf(row.itemId)}</strong><small>{row.itemId}</small></td><td>{integer.format(row.requiredQuantity)}</td><td>{integer.format(row.processCount)}</td><td>{integer.format(row.outputQuantity)}</td><td>{integer.format(row.surplusQuantity)}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}

export function App({ catalogLoader = loadCatalog }: AppProps) {
  const [catalog, setCatalog] = useState<CatalogData>();
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [targets, setTargets] = useState<CraftTarget[]>([]);
  const [result, setResult] = useState<CalculationResult>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    catalogLoader().then((value) => { if (active) setCatalog(value); }).catch((cause: unknown) => { if (active) setLoadError(cause instanceof Error ? cause.message : "Catalog gagal dimuat."); });
    return () => { active = false; };
  }, [catalogLoader]);

  const craftable = useMemo(() => catalog?.items.filter((item) => item.hasCraftingRecipe) ?? [], [catalog]);
  useEffect(() => { if (!selected && craftable[0]) setSelected(craftable[0].itemId); }, [craftable, selected]);
  const itemMap = useMemo(() => new Map(catalog?.items.map((item) => [item.itemId, item])), [catalog]);
  const nameOf = (itemId: string) => itemMap.get(itemId)?.displayName || `${itemId} (nama belum tersedia)`;
  const labelOf = (itemId: string) => {
    const item = itemMap.get(itemId);
    return `${nameOf(itemId)} · T${item?.tier ?? "?"}${item?.enchantment ? `.${item.enchantment}` : ""}`;
  };
  const changeTargets = (next: CraftTarget[]) => { setTargets(next); setResult(undefined); setError(""); };

  const addTarget = () => {
    const count = Number(quantity);
    if (!selected || !Number.isSafeInteger(count) || count <= 0) { setError("Quantity harus berupa bilangan bulat positif."); return; }
    const existing = targets.find((target) => target.itemId === selected);
    changeTargets(existing
      ? targets.map((target) => target.itemId === selected ? { ...target, quantity: target.quantity + count } : target)
      : [...targets, { itemId: selected, quantity: count }]);
    setQuantity("1");
  };

  const calculate = () => {
    if (!catalog || targets.length === 0) { setError("Tambahkan minimal satu target crafting."); return; }
    try { setResult(calculateMaterials({ targets, catalog })); setError(""); }
    catch (cause) { setResult(undefined); setError(cause instanceof Error ? cause.message : "Perhitungan gagal."); }
  };

  if (loadError) return <main className="shell state"><p className="eyebrow">Catalog error</p><h1>Planner tidak dapat dimuat</h1><p role="alert">{loadError}</p></main>;
  if (!catalog) return <main className="shell state"><div className="loader" /><p>Memuat katalog crafting…</p></main>;
  if (craftable.length === 0) return <main className="shell state"><p className="eyebrow">Catalog empty</p><h1>Belum ada item craftable</h1><p>Ganti fixture katalog dengan export v3 yang memiliki crafting recipe.</p></main>;

  return <main className="shell">
    <header className="hero"><div><p className="eyebrow">Albion Market Lab · Offline planner</p><h1>Crafting plan,<br /><em>without guesswork.</em></h1><p className="lede">Gabungkan banyak target, uraikan refining, dan bawa shopping list yang pasti. Harga menyusul saat data pribadi tersedia.</p></div><div className="status"><span className="dot" /> Catalog ready <b>{craftable.length} recipes</b></div></header>

    <section className="planner">
      <div className="section-heading"><span>01</span><h2>Target crafting</h2></div>
      <div className="target-form">
        <label>Item<select aria-label="Item crafting" value={selected} onChange={(event) => setSelected(event.target.value)}>{craftable.map((item) => <option key={item.itemId} value={item.itemId}>{labelOf(item.itemId)}</option>)}</select></label>
        <label>Quantity<input aria-label="Quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <button type="button" onClick={addTarget}>Tambah item</button>
      </div>
      {targets.length === 0 ? <div className="empty"><strong>Plan masih kosong.</strong><span>Pilih item dan quantity untuk mulai.</span></div> : <div className="targets">{targets.map((target) => <article key={target.itemId}><div><strong>{nameOf(target.itemId)}</strong><small>{target.itemId}</small></div><label>Qty<input key={target.quantity} aria-label={`Quantity ${target.itemId}`} type="number" min="1" defaultValue={target.quantity} onBlur={(event) => { const next = Number(event.target.value); if (Number.isSafeInteger(next) && next > 0) changeTargets(targets.map((item) => item.itemId === target.itemId ? { ...item, quantity: next } : item)); else { event.target.value = String(target.quantity); setError("Quantity harus berupa bilangan bulat positif."); } }} /></label><button className="remove" type="button" onClick={() => changeTargets(targets.filter((item) => item.itemId !== target.itemId))}>Hapus</button></article>)}</div>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="calculate" type="button" onClick={calculate}>Hitung kebutuhan <span>→</span></button>
    </section>

    {result && <div className="results">
      <div className="section-heading full"><span>02</span><h2>Hasil perhitungan</h2><p>{result.craftOutputs.length} output · {result.shoppingList.length} bahan mentah</p></div>
      <PlanTable title="Crafting Output" rows={result.craftOutputs} nameOf={nameOf} />
      <PlanTable title="Refining Plan" rows={result.refiningPlan} nameOf={nameOf} />
      <section className="result-card shopping"><div className="section-heading"><span>Buy</span><h2>Shopping List</h2></div><div className="shopping-grid">{result.shoppingList.map((item) => <article key={item.itemId}><span>{nameOf(item.itemId)}</span><small>{item.itemId}</small><b>{integer.format(item.quantity)}</b></article>)}</div><div className="price-empty"><span>Estimasi modal</span><strong>Belum ada data harga</strong><p>Task 06 berjalan sepenuhnya offline. Tidak ada harga yang dikarang atau dianggap nol.</p></div></section>
      {result.recipeWarnings.length > 0 && <section className="warnings"><h2>Catatan recipe</h2>{result.recipeWarnings.map((warning) => <p key={`${warning.code}:${warning.itemId}`}>{warning.itemId}: {warning.message}</p>)}</section>}
    </div>}
    <footer>Private data only <span>•</span> No community prices <span>•</span> Manual in-game actions</footer>
  </main>;
}
