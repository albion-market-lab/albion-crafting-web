import { useEffect, useMemo, useRef, useState } from "react";
import { calculateMaterials, estimateBuyOrders, type BuyOrderEstimateResult, type CalculationResult, type CraftTarget, type ProcessMaterialBreakdown } from "@albion-market-lab/crafting-calculator";
import { loadCatalog, type WebCatalogData } from "./catalog.js";
import { loadActivity, loadPrices, type ActivitySnapshot, type PriceSnapshot } from "./prices.js";
import { CategoryTree } from "./CategoryTree.js";
import { buildCategoryAssignments, type CategorySelection } from "./categories.js";
import { CraftingTemplates } from "./CraftingTemplates.js";
import { readDraft, readTemplates, writeDraft, writeTemplates, type SavedCraftingTemplate } from "./crafting-template.js";

interface AppProps {
  catalogLoader?: () => Promise<WebCatalogData>;
  priceLoader?: (itemIds: string[]) => Promise<PriceSnapshot | null>;
  activityLoader?: (itemIds: string[]) => Promise<ActivitySnapshot | null>;
  now?: () => Date;
}

const integer = new Intl.NumberFormat("id-ID");
const silver = (value: number) => `${integer.format(value)} silver`;
const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
export const formatEstimatedDays = (value?: number) => {
  if (value === undefined) return "Tidak tersedia";
  if (value > 0 && value < 0.01) return "<0,01 hari";
  const formatted = decimal.format(value);
  return value > 2 && formatted === decimal.format(2) ? ">2 hari" : `${formatted} hari`;
};
const reasonLabel = {
  ELIGIBLE: "Layak", EXCEEDS_TWO_DAY_TARGET: "Lebih dari 2 hari", MISSING_ACTIVITY: "Aktivitas tidak tersedia",
  NO_TRADING_ACTIVITY: "Volume harian nol", INSUFFICIENT_HISTORY: "History belum cukup", STALE_ACTIVITY: "Aktivitas stale",
  STALE_MARKET_DATA: "Harga stale", MISSING_MARKET_DATA: "Harga tidak tersedia",
} as const;
const activityLabel = { valid: "Aktivitas valid", no_volume: "Volume harian nol", missing: "Aktivitas tidak tersedia", insufficient_history: "History belum cukup", stale: "Aktivitas stale" } as const;

function PriceTable({ estimate, nameOf, itemFilter }: { estimate: BuyOrderEstimateResult; nameOf: (id: string) => string; itemFilter?: string }) {
  const materials = itemFilter ? estimate.materials.filter(({ itemId }) => itemId === itemFilter) : estimate.materials;
  const hasPartialCoverage = materials.some(({ coverage }) => coverage !== "complete");
  const hasPartialActivityCoverage = materials.some(({ activityCoverage }) => activityCoverage.validCities < activityCoverage.totalCities);
  return <><div className="table-wrap"><table className="price-table" aria-label="Harga Shopping List">
    <thead><tr><th>Material / kota</th><th>Jumlah</th><th>Competitive BO</th><th>Subtotal</th><th>Terjual / hari</th><th>Estimasi Hari</th><th>Observasi</th><th>Status</th></tr></thead>
    <tbody>{materials.flatMap((material) => material.candidates.map((candidate) => {
      const recommended = material.suggestedCity === candidate.city;
      const bidPrice = recommended ? material.suggestedBidPrice : candidate.bidPrice;
      return <tr className={recommended ? "recommended-price" : undefined} key={`${material.itemId}:${candidate.city}`}>
        <td><strong>{nameOf(material.itemId)}</strong><small>{candidate.city}{material.cheapestCity === candidate.city && <span className="price-cheapest">Termurah</span>}{recommended && <span className="recommendation">Rekomendasi</span>}</small>{candidate.city === "Bridgewatch" && <small>Data aktivitas: {material.activityCoverage.validCities}/{material.activityCoverage.totalCities} kota</small>}</td><td>{integer.format(material.quantity)}</td><td>{bidPrice === undefined ? "—" : silver(bidPrice)}</td><td>{candidate.subtotal === undefined ? "—" : silver(candidate.subtotal)}</td><td>{candidate.averageDailyUnits === undefined ? "—" : <>{integer.format(Math.round(candidate.averageDailyUnits))}<small>{candidate.activityCoverageDays} hari lengkap</small></>}</td><td>{formatEstimatedDays(candidate.estimatedDays)}<small>{activityLabel[candidate.activityStatus]}</small></td><td>{candidate.observedAt ? <>{new Date(candidate.observedAt).toLocaleString("id-ID")}<small>{candidate.ageHours!.toFixed(1)} jam lalu</small></> : "—"}</td><td><span className={`price-status ${candidate.status}`}>{candidate.status}</span><small>{reasonLabel[candidate.bestValueReason]}</small></td>
      </tr>;
    }))}</tbody>
  </table></div><div className="price-summary"><span>Estimasi modal Best Value · {estimate.status}</span><strong>{estimate.estimatedTotal === null ? "—" : silver(estimate.estimatedTotal)}</strong><p>Estimasi Hari (Volume Pasar) = jumlah kebutuhan ÷ 100% rata-rata unit terjual harian; bukan jaminan Buy Order terisi.</p>{estimate.estimatedTotal === null && <p>Tidak ada rekomendasi lengkap yang memenuhi target maksimal 2 hari. Estimasi termurah berbasis harga fresh saja: {estimate.priceOnlyEstimatedTotal === null ? "—" : silver(estimate.priceOnlyEstimatedTotal)}.</p>}{hasPartialCoverage && <p>Cakupan harga kota parsial; label Termurah hanya membandingkan harga fresh yang tersedia.</p>}{hasPartialActivityCoverage && <p>Rekomendasi berdasarkan kota yang memiliki data aktivitas valid. Kota lain belum dapat dibandingkan sepenuhnya.</p>}</div></>;
}

function IngredientBreakdownList({ title, action, ingredientHeader, rows, nameOf, metaOf }: { title: string; action: string; ingredientHeader: string; rows: ProcessMaterialBreakdown[]; nameOf: (id: string) => string; metaOf: (id: string) => string }) {
  return <section className="result-card process-breakdown">
    <div className="section-heading"><span>Plan</span><h2>{title}</h2></div>
    {rows.length === 0 ? <p className="muted">Tidak ada proses yang diperlukan.</p> : <div className="process-breakdown-list">{rows.map((row) => <details key={row.itemId} open={rows.length === 1}>
      <summary><span><strong>{nameOf(row.itemId)}</strong><small>{row.itemId} · {metaOf(row.itemId)}</small></span><b>{action} {integer.format(row.requiredQuantity)}</b></summary>
      {row.surplusQuantity > 0 && <p className="surplus-note">{integer.format(row.processCount)} proses menghasilkan {integer.format(row.outputQuantity)} unit · surplus {integer.format(row.surplusQuantity)}.</p>}
      <div className="table-wrap"><table aria-label={`Kebutuhan bahan ${nameOf(row.itemId)}`}>
        <thead><tr><th>{ingredientHeader}</th><th>Quantity</th></tr></thead>
        <tbody>{row.ingredients.map((ingredient) => <tr key={ingredient.itemId}><td><strong>{nameOf(ingredient.itemId)}</strong><small>{ingredient.itemId} · {metaOf(ingredient.itemId)}</small></td><td>{integer.format(ingredient.quantity)}</td></tr>)}</tbody>
      </table></div>
    </details>)}</div>}
  </section>;
}

export function App({ catalogLoader = loadCatalog, priceLoader = loadPrices, activityLoader = loadActivity, now = () => new Date() }: AppProps) {
  const [catalog, setCatalog] = useState<WebCatalogData>();
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [enchantment, setEnchantment] = useState("");
  const [category, setCategory] = useState<CategorySelection>("all");
  const [quantity, setQuantity] = useState("1");
  const [targets, setTargets] = useState<CraftTarget[]>([]);
  const [templates, setTemplates] = useState<SavedCraftingTemplate[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [result, setResult] = useState<CalculationResult>();
  const [estimate, setEstimate] = useState<BuyOrderEstimateResult>();
  const [shoppingItemFilter, setShoppingItemFilter] = useState<string>();
  const [priceState, setPriceState] = useState<"idle" | "loading" | "offline" | "empty" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const priceRequestVersion = useRef(0);
  const draftHydrated = useRef(false);
  const savedDraftValue = useRef("");

  useEffect(() => {
    let active = true;
    catalogLoader().then((value) => { if (active) setCatalog(value); }).catch((cause: unknown) => { if (active) setLoadError(cause instanceof Error ? cause.message : "Catalog gagal dimuat."); });
    return () => { active = false; };
  }, [catalogLoader]);

  const craftable = useMemo(() => {
    const supported = catalog?.supportedCraftableIds ? new Set(catalog.supportedCraftableIds) : undefined;
    return catalog?.items.filter((item) => item.hasCraftingRecipe && (!supported || supported.has(item.itemId))) ?? [];
  }, [catalog]);
  const supportedItemIds = useMemo(() => new Set(craftable.map(({ itemId }) => itemId)), [craftable]);
  useEffect(() => {
    if (!catalog || draftHydrated.current) return;
    draftHydrated.current = true;
    const warnings: string[] = [];
    try {
      const storage = window.localStorage;
      try { const draft = readDraft(storage, supportedItemIds); if (draft !== undefined) { savedDraftValue.current = JSON.stringify(draft); setTargets(draft); } } catch (cause) { warnings.push(cause instanceof Error ? cause.message : "Draft tersimpan gagal dimuat."); }
      try { setTemplates(readTemplates(storage, supportedItemIds)); } catch (cause) { warnings.push(cause instanceof Error ? cause.message : "Template tersimpan gagal dimuat."); }
    } catch { warnings.push("Browser storage tidak tersedia. Planner tetap dapat digunakan tanpa autosave."); }
    if (!savedDraftValue.current) savedDraftValue.current = JSON.stringify([]);
    setStorageWarning(warnings.join(" "));
    setDraftReady(true);
  }, [catalog, supportedItemIds]);
  useEffect(() => {
    if (!draftReady) return;
    const value = JSON.stringify(targets);
    if (value === savedDraftValue.current) return;
    try { writeDraft(window.localStorage, targets); savedDraftValue.current = value; }
    catch { setStorageWarning("Draft tidak dapat disimpan ke browser storage. Perubahan tetap aktif selama halaman terbuka."); }
  }, [draftReady, targets]);
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
  const materialMetaOf = (itemId: string) => {
    const item = itemMap.get(itemId);
    const kindKey = /_(ORE|HIDE|FIBER|WOOD|ROCK)(?:_|@|$)/.exec(itemId)?.[1];
    const kinds: Record<string, string> = { ORE: "Ore", HIDE: "Hide", FIBER: "Fiber", WOOD: "Wood", ROCK: "Rock" };
    const tier = item?.tier === undefined ? "Tier tidak diketahui" : `T${item.tier}${item.enchantment ? `.${item.enchantment}` : ""}`;
    return `${kindKey ? kinds[kindKey] : item?.category || "Material"} · ${tier}`;
  };
  const labelOf = (itemId: string) => {
    const item = itemMap.get(itemId);
    return `${nameOf(itemId)} · T${item?.tier ?? "?"}${item?.enchantment ? `.${item.enchantment}` : ""}`;
  };
  const tierOf = (itemId: string) => {
    const item = itemMap.get(itemId);
    return item?.tier === undefined ? "Tier tidak diketahui" : `T${item.tier}${item.enchantment ? `.${item.enchantment}` : ""}`;
  };
  const changeTargets = (next: CraftTarget[]) => { priceRequestVersion.current += 1; setTargets(next); setResult(undefined); setEstimate(undefined); setShoppingItemFilter(undefined); setPriceState("idle"); setError(""); };
  const changeTemplates = (next: SavedCraftingTemplate[]) => {
    try { readTemplates(window.localStorage, supportedItemIds); writeTemplates(window.localStorage, next); setTemplates(next); return true; }
    catch { setStorageWarning("Template tidak dapat disimpan ke browser storage. Data lama tidak dihapus."); return false; }
  };

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
      const itemIds = calculation.shoppingList.map(({ itemId }) => itemId);
      const [snapshot, activityResult] = await Promise.all([priceLoader(itemIds), activityLoader(itemIds).catch(() => null)]);
      if (version !== priceRequestVersion.current) return;
      if (!snapshot) { setEstimate(undefined); setPriceState("offline"); return; }
      setEstimate(estimateBuyOrders({ shoppingList: calculation.shoppingList, prices: snapshot.items, ...(activityResult ? { activity: activityResult.items } : {}), asOf: now().toISOString(), staleAfterHours: 6 }));
      setPriceState(snapshot.items.length ? "ready" : "empty");
    } catch { if (version === priceRequestVersion.current) { setEstimate(undefined); setPriceState("error"); } }
  };

  const calculate = () => {
    priceRequestVersion.current += 1;
    setShoppingItemFilter(undefined);
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
      <CraftingTemplates targets={targets} templates={templates} supportedItemIds={supportedItemIds} onLoad={changeTargets} onTemplatesChange={changeTemplates} />
      {storageWarning && <p className="storage-warning" role="status">{storageWarning}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="calculate" type="button" onClick={calculate}>Hitung kebutuhan <span>→</span></button>
    </section>

    {result && <div className="results">
      <div className="section-heading full"><span>02</span><h2>Hasil perhitungan</h2><p>{result.craftOutputs.length} output · {result.shoppingList.length} bahan mentah</p></div>
      <IngredientBreakdownList title="Crafting Output — Kebutuhan Bahan per Item" action="Craft" ingredientHeader="Material" rows={result.craftingMaterialBreakdown} nameOf={nameOf} metaOf={tierOf} />
      <IngredientBreakdownList title="Refining Plan — Kebutuhan Bahan Refining" action="Refine" ingredientHeader="Required Input" rows={result.refiningMaterialBreakdown} nameOf={nameOf} metaOf={tierOf} />
      <section className="result-card shopping"><div className="section-heading price-heading"><span>Buy</span><h2>Shopping List</h2><button type="button" onClick={() => void refreshPrices()} disabled={priceState === "loading"}>Refresh harga</button></div><div className="shopping-grid">{result.shoppingList.map((item) => <article className={shoppingItemFilter === item.itemId ? "active" : undefined} key={item.itemId}><button type="button" aria-label={`Filter harga ${nameOf(item.itemId)}`} aria-pressed={shoppingItemFilter === item.itemId} onClick={() => setShoppingItemFilter(shoppingItemFilter === item.itemId ? undefined : item.itemId)}><span><strong>{nameOf(item.itemId)}</strong> <small className="item-id">({item.itemId})</small></span><small>{materialMetaOf(item.itemId)}</small><b>{integer.format(item.quantity)}</b></button></article>)}</div>
        {shoppingItemFilter && <p className="shopping-filter-status" role="status">Menampilkan harga untuk {nameOf(shoppingItemFilter)} · klik bahan aktif untuk menampilkan semua.</p>}
        {priceState === "loading" && <div className="price-empty" role="status"><strong>Memuat snapshot harga…</strong></div>}
        {priceState === "offline" && <div className="price-empty"><strong>Mode offline</strong><p>Raw material tetap dihitung. Atur VITE_PRICE_API_URL untuk membaca receiver pribadi.</p></div>}
        {priceState === "empty" && estimate && <><div className="price-empty"><strong>Snapshot harga kosong</strong><p>Receiver merespons, tetapi material ini belum memiliki hasil scan.</p></div><PriceTable estimate={estimate} nameOf={nameOf} itemFilter={shoppingItemFilter} /></>}
        {priceState === "error" && <div className="price-empty error" role="alert"><strong>Receiver harga tidak dapat dihubungi</strong><p>Perhitungan material tetap tersedia. Coba refresh setelah koneksi pulih.</p></div>}
        {priceState === "ready" && estimate && <PriceTable estimate={estimate} nameOf={nameOf} itemFilter={shoppingItemFilter} />}
      </section>
      {result.recipeWarnings.length > 0 && <section className="warnings"><h2>Catatan recipe</h2>{result.recipeWarnings.map((warning) => <p key={`${warning.code}:${warning.itemId}`}>{warning.itemId}: {warning.message}</p>)}</section>}
    </div>}
    <footer>Private data only <span>•</span> No community prices <span>•</span> Manual in-game actions</footer>
  </main>;
}
