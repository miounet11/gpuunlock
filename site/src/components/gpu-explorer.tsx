"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { Device, DeviceStatus } from "@/data/devices";

type SortKey = "name" | "chip" | "status" | "gain" | "pciId";

export interface GpuExplorerLabels {
  searchPlaceholder: string;
  searchLabel: string;
  filterLabel: string;
  all: string;
  sortLabel: string;
  sortName: string;
  sortChip: string;
  sortStatus: string;
  sortGain: string;
  sortPci: string;
  resultOne: string;
  resultMany: string;
  emptyTitle: string;
  emptyBody: string;
  clear: string;
  noGain: string;
  status: Record<DeviceStatus, string>;
}

const STATUS_ORDER: Record<DeviceStatus, number> = {
  measured: 0,
  reported: 1,
  partial: 2,
  untested: 3,
  unsupported: 4,
};

/**
 * Client-side card index. The full device list is serialised into the server payload, so
 * filtering and sorting never hit the network and the same markup is crawlable without JS.
 */
export function GpuExplorer({ devices, labels }: { devices: Device[]; labels: GpuExplorerLabels }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DeviceStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("status");
  const [desc, setDesc] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<DeviceStatus, number>();
    for (const d of devices) map.set(d.status, (map.get(d.status) ?? 0) + 1);
    return map;
  }, [devices]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = devices.filter((d) => {
      if (status !== "all" && d.status !== status) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.chip.toLowerCase().includes(q) ||
        d.pciId.toLowerCase().includes(q) ||
        d.notes.toLowerCase().includes(q)
      );
    });

    const dir = desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "chip":
          return a.chip.localeCompare(b.chip) * dir;
        case "pciId":
          return a.pciId.localeCompare(b.pciId) * dir;
        case "gain":
          return ((a.gainMax ?? -1) - (b.gainMax ?? -1)) * dir;
        case "status":
        default:
          return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir || a.name.localeCompare(b.name);
      }
    });
  }, [devices, query, status, sort, desc]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) {
      setDesc((v) => !v);
    } else {
      setSort(key);
      setDesc(key === "gain");
    }
  };

  const sortBtn = (key: SortKey, text: string) => (
    <button
      type="button"
      className="sort-btn"
      data-active={sort === key}
      onClick={() => toggleSort(key)}
    >
      {text}
      {sort === key ? <span className="arrow">{desc ? "▼" : "▲"}</span> : null}
    </button>
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
          <button
            type="button"
            className="chip"
            aria-pressed={status === "all"}
            onClick={() => setStatus("all")}
          >
            {labels.all}
            <span className="count">{devices.length}</span>
          </button>
          {(Object.keys(STATUS_ORDER) as DeviceStatus[])
            .filter((s) => (counts.get(s) ?? 0) > 0)
            .map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
              >
                {labels.status[s]}
                <span className="count">{counts.get(s)}</span>
              </button>
            ))}
        </div>
        <span className="result-count" aria-live="polite">
          {rows.length === 1
            ? labels.resultOne.replace("{count}", String(rows.length))
            : labels.resultMany.replace("{count}", String(rows.length))}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <strong>{labels.emptyTitle}</strong>
          {labels.emptyBody}
          <div style={{ marginTop: "0.9rem" }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setQuery("");
                setStatus("all");
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
                <th scope="col">{sortBtn("name", labels.sortName)}</th>
                <th scope="col">{sortBtn("chip", labels.sortChip)}</th>
                <th scope="col">{sortBtn("pciId", labels.sortPci)}</th>
                <th scope="col">{sortBtn("status", labels.sortStatus)}</th>
                <th scope="col" className="num">
                  {sortBtn("gain", labels.sortGain)}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.slug}>
                  <td>
                    <Link href={`/gpus/${d.slug}`}>{d.name}</Link>
                  </td>
                  <td>
                    <span className="mono">{d.chip}</span>
                  </td>
                  <td>
                    <span className="mono">{d.pciId}</span>
                  </td>
                  <td>
                    <span className={`badge ${d.status}`}>{labels.status[d.status]}</span>
                  </td>
                  <td className="num">
                    {d.gainMin !== null ? (
                      <span className="gain-positive">
                        +{d.gainMin}
                        {d.gainMax !== null && d.gainMax !== d.gainMin ? `–${d.gainMax}` : ""}%
                      </span>
                    ) : (
                      <span className="gain-flat">{labels.noGain}</span>
                    )}
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
