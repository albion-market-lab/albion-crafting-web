import { useEffect, useMemo, useRef, useState } from "react";
import { calculateMaterials, estimateBuyOrders, type BuyOrderEstimateResult, type CalculationResult, type CraftTarget, type ProcessPlan } from "@albion-market-lab/crafting-calculator";
import { loadCatalog, type WebCatalogData } from "./catalog.js";
import { loadPrices, type PriceSnapshot } from "./prices.js";
import { CategoryTree } from "./CategoryTree.js";
import { buildCategoryAssignments, type CategorySelection } from "./categories.js";

interface AppProps {
  catalogLoader?: () => Promise<WebCatalogData>;
  priceLoader?: (itemIds: string[]) => Promise<PriceSnapshot | null>;
  now?: () => Date;
}

const integer = new Intl.NumberFormat("id-ID");
const silver = (value: number) => `${integer.format(value)} silver`;

function PriceTable({ estimate, nameOf }: { estimate: BuyOrderEstimateResult; nameOf: (id: string) => string }) {
  return <><div className="table-wrap"><table className="price-table">
    <thead><tr><th>Material / kota</th><th>Jumlah</th><th>Bid</th><th>Subtotal</th><th>Observasi</th><th>Status</th></tr></thead>
    <tbody>{estimate.materials.flatMap((material) => material.candidates.map((candidate) => {
      const recommended = material.suggestedCity === candidate.city;
      const bidPrice = recommended ? material.suggestedBidPrice : candidate.bidPrice;
      return <tr className={recommended ? "recommended-price" : undefined} key={`${material.itemId}:${candidate.city}`}>
        <td><strong>{nameOf(material.itemId)}</strong><small>{candidate.city}{recommended && <span className="recommendation">Rekomendasi</span>}</small></td><td>{integer.format(material.quantity)}</td><td>{bidPrice === undefined ? "—" : silver(bidPrice)}</td><td>{candidate.subtotal === undefined ? "—" : silver(candidate.subtotal)}</td><td>{candidate.observedAt ? <>{new Date(candidate.observedAt).toLocaleString("id-ID")}<small>{candidate.ageHours!.toFixed(1)} jam lalu</small></> : "—"}</td><td><span className={`price-status ${candidate.status}`}>{candidate.status}</span></td>
      </tr>;
    }))}</tbody>
  </table></div><div className="price-summary"><span>Estimasi modal · {estimate.status}</span><strong>{estimate.estimatedTotal === null ? "—" : silver(estimate.estimatedTotal)}</strong>{estimate.status !== "complete" && <p>Total belum lengkap karena sebagian harga atau cakupan kota tidak tersedia.</p>}</div></>;
}

function PlanTable({ title, rows, nameOf }: { title: string; rows: ProcessPlan[]; nameOf: (id: string) => string }) {
  return <section className="result-card">
    <div className="section-heading"><span>Plan</span><h2>{title}</h2></div>
    {rows.length === 0 ? <p className="muted">Tidak ada proses yang diperlukan.</p> : <div className="table-wrap"><table>
      <thead><tr><th>Item</th><th>Butuh</th><th>Proses</th><th>Output</th><th>Surplus</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.itemId}><td><strong>{nameOf(row.itemId)}</strong><small>{row.itemId}</small></td><td>{integer.format(row.requiredQuantity)}</td><td>{integer.format(row.processCount)}</td><td>{integer.format(row.outputQuantity)}</td><td>{integer.format(row.surplusQuantity)}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}

export function App({ catalogLoader = loadCatalog, priceLoader = loadPrices, now = () => new Date() }: AppProps) {
  const [catalog, setCatalog] = useState<WebCatalogData>();
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [enchantment, setEnchantment] = useState("");
  const [category, setCategory] = useState<CategorySelection>("all");
  const [quantity, setQuantity] = useState("1");
  const [targets, setTargets] = useState<CraftTarget[]>([]);
  const [result, setResult] = useState<CalculationResult>();
  const [estimate, setEstimate] = useState<BuyOrderEstimateResult>();
  const [priceState, setPriceState] = useState<"idle" | "loading" | "offline" | "empty" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const priceRequestVersion = useRef(0);

  useEffect(() => {
    let active = true;
    catalogLoader().then((value) => { if (active) setCatalog(value); }).catch((cause: unknown) => { if (active) setLoadError(cause instanceof Error ? cause.message : "Catalog gagal dimuat."); });
    return () => { active = false; };
  }, [catalogLoader]);

  const craftable = useMemo(() => {
    const supported = catalog?.supportedCraftableIds ? new Set(catalog.supportedCraftableIds) : undefined;
    return catalog?.items.filter((item) => item.hasCraftingRecipe && (!supported || supported.has(item.itemId))) ?? [];
  }, [catalog]);
  const tiers = useMemo(() => [...new Set(craftable.flatMap((item) => item.tier === undefined ? [] : [item.tier]))].sort((a, b) => a - b), [craftable]);
  const enchantments = useMemo(() => [...new Set(craftable.map((item) => item.enchantment))].sort((a, b) => a - b), [craftable]);
  const categoryAssignments = useMemo(() => catalog ? buildCategoryAssignments(catalog, craftable) : new Map(), [catalog, craftable]);
  const filteredCraftable = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return craftable.filter((item) => (!query || item.itemId.toLocaleLowerCase().includes(query) || item.displayName.toLocaleLowerCase().includes(query)) && (!tier || item.tier === Number(tier)) && (!enchantment || item.enchantment === Number(enchantment)) && (category === "all" || categoryAssignments.get(item.itemId) === category));
  }, [craftable, search, tier, enchantment, category, categoryAssignments]);
  const visibleCraftable = filteredCraftable.slice(0, 100);
  useEffect(() => { if (!filteredCraftable.some((item) => item.itemId === selected)) setSelected(filteredCraftable[0]?.itemId ?? ""); }, [filteredCraftable, selected]);
  const itemMap = useMemo(() => new Map(catalog?.items.map((item) => [item.itemId, item])), [catalog]);
  const nameOf = (itemId: string) => itemMap.get(itemId)?.displayName || `${itemId} (nama belum tersedia)`;
  const labelOf = (itemId: string) => {
    const item = itemMap.get(itemId);
    return `${nameOf(itemId)} · T${item?.tier ?? "?"}${item?.enchantment ? `.${item.enchantment}` : ""}`;
  };
  const changeTargets = (next: CraftTarget[]) => { priceRequestVersion.current += 1; setTargets(next); setResult(undefined); setEstimate(undefined); setPriceState("idle"); setError(""); };

  const addTarget = () => {
    const count = Number(quantity);
    if (!selected || !Number.isSafeInteger(count) || count <= 0) { setError("Quantity harus berupa bilangan bulat positif."); return; }
    const existing = targets.find((target) => target.itemId === selected);
    changeTargets(existing
      ? targets.map((target) => target.itemId === selected ? { ...target, quantity: target.quantity + count } : target)
      : [...targets, { itemId: selected, quantity: count }]);
    setQuantity("1");
  };

  const refreshPrices = async (calculation = result) => {
    if (!calculation) return;
    const version = ++priceRequestVersion.current;
    setPriceState("loading");
    try {
      const snapshot = await priceLoader(calculation.shoppingList.map(({ itemId }) => itemId));
      if (version !== priceRequestVersion.current) return;
      if (!snapshot) { setEstimate(undefined); setPriceState("offline"); return; }
      setEstimate(estimateBuyOrders({ shoppingList: calculation.shoppingList, prices: snapshot.items, asOf: now().toISOString(), staleAfterHours: 6 }));
      setPriceState(snapshot.items.length ? "ready" : "empty");
    } catch { if (version === priceRequestVersion.current) { setEstimate(undefined); setPriceState("error"); } }
  };

  const calculate = () => {
    priceRequestVersion.current += 1;
    if (!catalog || targets.length === 0) { setError("Tambahkan minimal satu target crafting."); return; }
    try { const calculation = calculateMaterials({ targets, catalog }); setResult(calculation); setError(""); void refreshPrices(calculation); }
    catch (cause) { setResult(undefined); setError(cause instanceof Error ? cause.message : "Perhitungan gagal."); }
  };

  if (loadError) return <main className="shell state"><p className="eyebrow">Catalog error</p><h1>Planner tidak dapat dimuat</h1><p role="alert">{loadError}</p></main>;
  if (!catalog) return <main className="shell state"><div className="loader" /><p>Memuat katalog crafting…</p></main>;
  if (craftable.length === 0) return <main className="shell state"><p className="eyebrow">Catalog empty</p><h1>Belum ada item craftable</h1><p>Ganti fixture katalog dengan export v3 yang memiliki crafting recipe.</p></main>;

  return <main className="shell">
    <header className="hero"><div><p className="eyebrow">Albion Market Lab · Private planner</p><h1>Crafting plan,<br /><em>without guesswork.</em></h1><p className="lede">Gabungkan banyak target, uraikan refining, dan gunakan snapshot harga dari receiver pribadi.</p></div><div className="status"><span className="dot" /> Catalog ready <b>{integer.format(craftable.length)} supported{catalog.rejectedCraftableItems ? ` · ${integer.format(catalog.rejectedCraftableItems)} pending` : ""}</b></div></header>

    <section className="planner">
      <div className="section-heading"><span>01</span><h2>Target crafting</h2></div>
      <div className="catalog-filters">
        <label className="catalog-search">Cari equipment<input aria-label="Cari equipment" type="search" placeholder="Cari nama atau item ID…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <CategoryTree value={category} onChange={setCategory} />
        <label>Tier<select aria-label="Filter tier" value={tier} onChange={(event) => setTier(event.target.value)}><option value="">Semua tier</option>{tiers.map((value) => <option key={value} value={value}>T{value}</option>)}</select></label>
        <label>Enchantment<select aria-label="Filter enchantment" value={enchantment} onChange={(event) => setEnchantment(event.target.value)}><option value="">Semua enchantment</option>{enchantments.map((value) => <option key={value} value={value}>.{value}</option>)}</select></label>
        <button className="clear-filters" type="button" onClick={() => { setSearch(""); setTier(""); setEnchantment(""); setCategory("all"); }}>Clear filters</button>
      </div>
      <p className="filter-summary">{integer.format(filteredCraftable.length)} equipment cocok{filteredCraftable.length > 100 ? " · 100 pertama ditampilkan" : ""}</p>
      <div className="target-form">
        <label>Item<select aria-label="Item crafting" value={selected} onChange={(event) => setSelected(event.target.value)} disabled={visibleCraftable.length === 0}>{visibleCraftable.length === 0 ? <option value="">Tidak ada equipment cocok</option> : visibleCraftable.map((item) => <option key={item.itemId} value={item.itemId}>{labelOf(item.itemId)}</option>)}</select></label>
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
      <section className="result-card shopping"><div className="section-heading price-heading"><span>Buy</span><h2>Shopping List</h2><button type="button" onClick={() => void refreshPrices()} disabled={priceState === "loading"}>Refresh harga</button></div><div className="shopping-grid">{result.shoppingList.map((item) => <article key={item.itemId}><span>{nameOf(item.itemId)}</span><small>{item.itemId}</small><b>{integer.format(item.quantity)}</b></article>)}</div>
        {priceState === "loading" && <div className="price-empty" role="status"><strong>Memuat snapshot harga…</strong></div>}
        {priceState === "offline" && <div className="price-empty"><strong>Mode offline</strong><p>Raw material tetap dihitung. Atur VITE_PRICE_API_URL untuk membaca receiver pribadi.</p></div>}
        {priceState === "empty" && estimate && <><div className="price-empty"><strong>Snapshot harga kosong</strong><p>Receiver merespons, tetapi material ini belum memiliki hasil scan.</p></div><PriceTable estimate={estimate} nameOf={nameOf} /></>}
        {priceState === "error" && <div className="price-empty error" role="alert"><strong>Receiver harga tidak dapat dihubungi</strong><p>Perhitungan material tetap tersedia. Coba refresh setelah koneksi pulih.</p></div>}
        {priceState === "ready" && estimate && <PriceTable estimate={estimate} nameOf={nameOf} />}
      </section>
      {result.recipeWarnings.length > 0 && <section className="warnings"><h2>Catatan recipe</h2>{result.recipeWarnings.map((warning) => <p key={`${warning.code}:${warning.itemId}`}>{warning.itemId}: {warning.message}</p>)}</section>}
    </div>}
    <footer>Private data only <span>•</span> No community prices <span>•</span> Manual in-game actions</footer>
  </main>;
}
