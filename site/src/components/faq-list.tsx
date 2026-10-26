"use client";

import { useState } from "react";

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * Accordion FAQ. Uses <details>/<summary> so every answer is in the HTML for crawlers and
 * works without JS; the state here only lets "expand all" drive several at once.
 */
export function FaqList({ items, expandAll, collapseAll }: { items: FaqItem[]; expandAll: string; collapseAll: string }) {
  const [allOpen, setAllOpen] = useState<boolean | null>(null);

  return (
    <>
      <div className="toolbar">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setAllOpen((v) => !(v ?? false))}
        >
          {allOpen ? collapseAll : expandAll}
        </button>
      </div>
      <div className="faq-list">
        {/* The key includes `allOpen` so toggling remounts the element; without it the
            `open` attribute and the user's own clicks would fight over the same node. */}
        {items.map((item, i) => (
          <details key={`${item.q}-${String(allOpen)}`} className="faq-item" open={allOpen ?? undefined}>
            <summary>
              <span className="faq-num">{String(i + 1).padStart(2, "0")}</span>
              <span>{item.q}</span>
            </summary>
            <div className="faq-answer">
              <p>{item.a}</p>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
