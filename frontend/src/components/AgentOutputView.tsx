"use client";

import { useState } from "react";
import Markdown from "./Markdown";
import { STEP_ICONS } from "./Icons";
import { STEPS, wordCount, type StepKey } from "@/lib/pipeline";

const RAW_STEPS: StepKey[] = ["search", "reader"];

/** Raw output of the search and reader agents, in a file-viewer frame. */
export default function AgentOutputView({ results }: { results: Partial<Record<StepKey, string>> }) {
  const available = RAW_STEPS.filter((k) => results[k] != null);
  const [picked, setPicked] = useState<StepKey>("search");
  const current = available.includes(picked) ? picked : available[0];
  const content = current ? results[current] : undefined;
  const def = STEPS.find((s) => s.key === current);

  return (
    <div className="fade-up overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-shell px-4 py-2.5">
        <div className="flex gap-1 rounded-lg border border-line bg-panel p-0.5">
          {RAW_STEPS.map((k) => {
            const Icon = STEP_ICONS[k];
            const on = k === current;
            return (
              <button
                key={k}
                disabled={results[k] == null}
                onClick={() => setPicked(k)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-[11.5px] transition-colors disabled:opacity-35 ${
                  on ? "bg-panel-2 text-text" : "text-muted hover:text-text"
                }`}
              >
                <Icon width={13} height={13} />
                {k}_agent.md
              </button>
            );
          })}
        </div>
        {content != null && (
          <span className="font-mono text-[11px] text-faint">
            {wordCount(content).toLocaleString()} words · {content.length.toLocaleString()} chars
          </span>
        )}
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-6 sm:px-8">
        {content != null && def ? (
          <>
            <p className="label mb-4">
              {def.title} · {def.desc}
            </p>
            <Markdown>{content}</Markdown>
          </>
        ) : (
          <p className="text-sm text-muted">No agent output yet.</p>
        )}
      </div>
    </div>
  );
}
