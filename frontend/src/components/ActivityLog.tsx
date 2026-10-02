"use client";

import { useEffect, useRef } from "react";
import { clockTime, type StepKey } from "@/lib/pipeline";

export interface LogEntry {
  t: number;
  step: StepKey | "system";
  kind: "info" | "start" | "done" | "error";
  text: string;
}

const TAG: Record<LogEntry["step"], string> = {
  search: "search",
  reader: "reader",
  writer: "writer",
  critic: "critic",
  system: "system",
};

/** Terminal-style feed of pipeline events. */
export default function ActivityLog({ entries, live }: { entries: LogEntry[]; live: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Keep the newest entry in view without scrolling the page itself.
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [entries.length]);

  return (
    <div className="rounded-xl border border-line bg-shell">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="label">Activity</span>
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-faint">
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "pulse-dot bg-lime" : "bg-faint"}`} />
          {live ? "Live" : "Idle"}
        </span>
      </div>
      <div ref={boxRef} className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-[1.7]">
        {entries.length === 0 ? (
          <p className="caret text-faint">awaiting a research brief</p>
        ) : (
          entries.map((e, i) => (
            <div key={i} className="fade-up flex gap-2.5">
              <span className="shrink-0 tabular-nums text-faint">{clockTime(e.t)}</span>
              <span
                className={`w-12 shrink-0 ${
                  e.kind === "error" ? "text-coral" : e.kind === "done" ? "text-lime" : "text-text-2"
                }`}
              >
                {TAG[e.step]}
              </span>
              <span className={`min-w-0 break-words ${e.kind === "error" ? "text-coral" : "text-muted"}`}>
                {e.text}
              </span>
            </div>
          ))
        )}
        {live && entries.length > 0 && <p className="caret mt-0.5 text-faint" />}
      </div>
    </div>
  );
}
