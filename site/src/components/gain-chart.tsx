"use client";

import { useMemo, useState } from "react";

export interface GainDatum {
  label: string;
  sub: string;
  ratio: number;
}

/**
 * Horizontal gain bars for the paths where the override actually moves the rate.
 * Rendering a 1.00× row as a full bar would overstate it, so the scale is anchored at 1.0
 * and every bar's width is the excess over stock, clamped to the largest excess on the page.
 */
export function GainChart({
  data,
  labels,
}: {
  data: GainDatum[];
  labels: { stock: string; peak: string; caption: string };
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...data.map((d) => d.ratio), 1.01);
  const span = max - 1;

  const rows = useMemo(
    () => [...data].sort((a, b) => b.ratio - a.ratio),
    [data],
  );

  return (
    <figure className="chart">
      <figcaption className="chart-caption">{labels.caption}</figcaption>
      <ul className="chart-rows">
        {rows.map((d) => {
          const pct = ((d.ratio - 1) / span) * 100;
          const active = hover === d.label;
          return (
            <li
              key={d.label}
              className="chart-row"
              data-active={active}
              onMouseEnter={() => setHover(d.label)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d.label)}
              onBlur={() => setHover(null)}
              tabIndex={0}
            >
              <div className="chart-meta">
                <code>{d.label}</code>
                <span className="chart-sub">{d.sub}</span>
              </div>
              <div className="chart-track" role="img" aria-label={`${d.label}: ${d.ratio.toFixed(2)}x`}>
                <div className="chart-bar" style={{ width: `${Math.max(pct, 1.5)}%` }} />
              </div>
              <output className="chart-value">{d.ratio.toFixed(2)}×</output>
            </li>
          );
        })}
      </ul>
      <p className="meta">
        {labels.stock} · {labels.peak} {max.toFixed(2)}×
      </p>
    </figure>
  );
}
