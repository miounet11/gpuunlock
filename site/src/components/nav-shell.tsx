"use client";

import { useEffect, useState } from "react";

/**
 * Mobile navigation disclosure. The links themselves stay server-rendered children, so the
 * markup is complete without JavaScript; this only toggles visibility below 860px.
 */
export function NavShell({
  children,
  actions,
  menuLabel,
  closeLabel,
}: {
  children: React.ReactNode;
  actions: React.ReactNode;
  menuLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="icon-btn nav-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-nav"
        aria-label={open ? closeLabel : menuLabel}
      >
        {open ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        )}
      </button>
      <nav className="site-nav" id="site-nav" data-open={open} aria-label={menuLabel}>
        {children}
      </nav>
      <div className="header-actions">{actions}</div>
    </>
  );
}
