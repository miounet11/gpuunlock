"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";

export interface Step {
  id: string;
  title: string;
  body: string;
  code?: string;
  note?: string;
}

/**
 * Install steps with a progress rail. The rail is client-side only: it tracks which steps
 * the visitor has marked done in this tab, and never claims an install succeeded.
 */
export function StepTimeline({
  steps,
  labels,
}: {
  steps: Step[];
  labels: { copy: string; copied: string; markDone: string; done: string; progress: string };
}) {
  const [done, setDone] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="timeline-wrap">
      <p className="timeline-progress" aria-live="polite">
        {labels.progress.replace("{done}", String(done.size)).replace("{total}", String(steps.length))}
      </p>
      <ol className="timeline">
        {steps.map((s, i) => {
          const isDone = done.has(s.id);
          return (
            <li key={s.id} id={`step-${s.id}`} className="timeline-item" data-done={isDone}>
              <div className="timeline-marker" aria-hidden="true">
                {isDone ? "✓" : i + 1}
              </div>
              <div className="timeline-body">
                <h2>{s.title}</h2>
                <p>{s.body}</p>
                {s.code ? (
                  <pre>
                    <code>{s.code}</code>
                    <CopyButton label={labels.copy} copiedLabel={labels.copied} />
                  </pre>
                ) : null}
                {s.note ? <p className="meta">{s.note}</p> : null}
                <button
                  type="button"
                  className="btn btn-sm step-done"
                  onClick={() => toggle(s.id)}
                  aria-pressed={isDone}
                >
                  {isDone ? labels.done : labels.markDone}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
