import { useEffect, useRef, useState } from "react";
import { categoryBreadcrumb, type CategorySelection, type MaterialGroup } from "./categories.js";

interface Props {
  value: CategorySelection;
  onChange: (value: CategorySelection) => void;
}

const materialLabels: Array<[MaterialGroup, string]> = [["cloth", "Cloth (Kain)"], ["leather", "Leather (Kulit)"], ["plate", "Plate (Baja)"]];
const branches = [["helmet", "Helmet"], ["armor", "Armor"], ["shoes", "Shoes"], ["weapon", "Weapon"], ["offhand", "Off-hand"]] as const;

export function CategoryTree({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, []);
  const select = (next: CategorySelection) => { onChange(next); setOpen(false); };
  const leaf = (selection: CategorySelection, label: string) => <button key={selection} className={value === selection ? "active" : ""} type="button" role="treeitem" aria-label={categoryBreadcrumb(selection)} aria-selected={value === selection} onClick={() => select(selection)}>{label}</button>;

  return <div className="category-tree" ref={root}>
    <label>Category<button ref={trigger} className="category-trigger" type="button" aria-label={`Category: ${categoryBreadcrumb(value)}`} aria-haspopup="tree" aria-expanded={open} onClick={() => setOpen(!open)}><span>{categoryBreadcrumb(value)}</span><b>{open ? "−" : "+"}</b></button></label>
    {open && <div className="category-menu" role="tree" aria-label="Category tree">
      {leaf("all", "All Supported")}
      <details><summary>Equipment</summary><div className="tree-level">
        {branches.map(([slot, label]) => <details key={slot}><summary>{label}</summary><div className="tree-level">{materialLabels.map(([group, materialLabel]) => leaf(`${slot}:${group}`, materialLabel))}</div></details>)}
        {leaf("bag", "Bag")}{leaf("cape", "Cape")}{leaf("other", "Other Equipment")}
      </div></details>
      {(["Consumables", "Resources", "Others"] as const).map((label) => <button key={label} type="button" role="treeitem" disabled>{label}<small>Coming Soon</small></button>)}
      <button className="reset-category" type="button" onClick={() => select("all")}>Reset filter</button>
    </div>}
  </div>;
}
