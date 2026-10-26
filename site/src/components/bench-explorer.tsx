"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { BenchRow } from "@/data/benchmarks";

type SortKey = "card" | "mode" | "stock" | "unlocked" | "ratio";
type View = "all" | "changed" | "flat";

export interface BenchLabels {
  colCard: string;
  colMode: string;
  colStock: string;
  colUnlocked: string;
  colGain: string;
  filterLabel: string;
  viewAll: string;
  viewChanged: string;
  viewFlat: string;
  searchLabel: string;
  searchPlaceholder: string;
  resultOne: string;
  resultMany: string;
  emptyTitle: string;
  emptyBody: string;
  clear: string;
  sortLabel: string;
}

export interface BenchTableRow extends BenchRow {
  slug: string;
}

/**
 * Benchmark matrix. A row counts as "changed" when the unlock moved that path by at least
 * 1%, which keeps best-of-three noise (the RTX 4090 f16/f16 row sits at 1.018x) out of the
 * "did it help" answer while still listing it under "all".
 */
export function BenchExplorer({ rows, labels }: { rows: BenchTableRow[]; labels: BenchLabels }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("changed");
  const [sort, setSort] = useState<SortKey>("ratio");
  const [desc, setDesc] = useState(true);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (view === "changed" && r.ratio < 1.01) return false;
      if (view === "flat" && r.ratio >= 1.01) return false;
      if (!q) return true;
      return (
        r.card.toLowerCase().includes(q) ||
        r.mode.toLowerCase().includes(q) ||
        r.pciId.toLowerCase().includes(q)
      );
    });

    const dir = desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "card":
          return a.card.localeCompare(b.card) * dir;
        case "mode":
          return a.mode.localeCompare(b.mode) * dir;
        case "stock":
          return (a.stock - b.stock) * dir;
        case "unlocked":
          return (a.unlocked - b.unlocked) * dir;
        case "ratio":
        default:
          return (a.ratio - b.ratio) * dir;
      }
    });
  }, [rows, query, view, sort, desc]);

  const toggle = (key: SortKey) => {
    if (sort === key) setDesc((v) => !v);
    else {
      setSort(key);
      setDesc(key === "ratio" || key === "unlocked" || key === "stock");
    }
  };

  const sortBtn = (key: SortKey, text: string) => (
    <button type="button" className="sort-btn" data-active={sort === key} onClick={() => toggle(key)}>
      {text}
      {sort === key ? <span className="arrow">{desc ? "▼" : "▲"}</span> : null}
    </button>
  );

  const counts = useMemo(
    () => ({
      all: rows.length,
      changed: rows.filter((r) => r.ratio >= 1.01).length,
      flat: rows.filter((r) => r.ratio < 1.01).length,
    }),
    [rows],
  );

  return (
    <>
      <div className="toolbar">
        <div className="search-field">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchLabel}
          />
        </div>
        <div className="chip-row" role="group" aria-label={labels.filterLabel}>
          <button type="button" className="chip" aria-pressed={view === "changed"} onClick={() => setView("changed")}>
            {labels.viewChanged}
            <span className="count">{counts.changed}</span>
          </button>
          <button type="button" className="chip" aria-pressed={view === "flat"} onClick={() => setView("flat")}>
            {labels.viewFlat}
            <span className="count">{counts.flat}</span>
          </button>
          <button type="button" className="chip" aria-pressed={view === "all"} onClick={() => setView("all")}>
            {labels.viewAll}
            <span className="count">{counts.all}</span>
          </button>
        </div>
        <span className="result-count" aria-live="polite">
          {(visible.length === 1 ? labels.resultOne : labels.resultMany).replace(
            "{n}",
            String(visible.length),
          )}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <strong>{labels.emptyTitle}</strong>
          {labels.emptyBody}
          <div style={{ marginTop: "0.9rem" }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setQuery("");
                setView("all");
              }}
            >
              {labels.clear}
            </button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{sortBtn("card", labels.colCard)}</th>
                <th scope="col">{sortBtn("mode", labels.colMode)}</th>
                <th scope="col" className="num">
                  {sortBtn("stock", labels.colStock)}
                </th>
                <th scope="col" className="num">
                  {sortBtn("unlocked", labels.colUnlocked)}
                </th>
                <th scope="col" className="num">
                  {sortBtn("ratio", labels.colGain)}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={`${r.slug}-${r.mode}-${r.iters}-${i}`}>
                  <td>
                    <Link href={`/gpus/${r.slug}`}>{r.card}</Link>
                  </td>
                  <td>
                    <span className="mono">{r.mode}</span>
                  </td>
                  <td className="num">
                    {r.stock.toFixed(2)} <span className="meta">{r.unit}</span>
                  </td>
                  <td className="num">
                    {r.unlocked.toFixed(2)} <span className="meta">{r.unit}</span>
                  </td>
                  <td className="num">
                    <span className={r.ratio >= 1.01 ? "gain-positive" : "gain-flat"}>
                      {r.ratio.toFixed(3)}×
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
