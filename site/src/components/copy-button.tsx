"use client";

import { useState } from "react";

/**
 * Copies the text of the <code> block this button is rendered next to.
 * `navigator.clipboard` needs a secure context, so the fallback selects the text and tells
 * the visitor to copy manually rather than failing silently.
 */
export function CopyButton({ label, copiedLabel }: { label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const pre = e.currentTarget.parentElement;
    const text = pre?.querySelector("code")?.textContent ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="copy-btn" onClick={copy} aria-live="polite">
      {copied ? copiedLabel : label}
    </button>
  );
}
