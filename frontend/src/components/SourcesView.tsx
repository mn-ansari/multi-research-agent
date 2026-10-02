import { ExternalIcon } from "./Icons";
import type { Source, StepKey } from "@/lib/pipeline";

const CITED_LABEL: Record<StepKey, string> = {
  search: "Search",
  reader: "Reader",
  writer: "Report",
  critic: "Critic",
};

/** Every URL the agents surfaced, as a grid of source cards. */
export default function SourcesView({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-2 p-10 text-center">
        <p className="text-sm text-muted">No links were found in the agents&apos; output.</p>
      </div>
    );
  }

  return (
    <div className="fade-up grid gap-3 sm:grid-cols-2">
      {sources.map((s, i) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex gap-4 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-2 hover:bg-panel-2"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line-2 bg-shell font-display text-xl uppercase text-text">
            {s.domain.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[11px] uppercase tracking-wider text-muted">
                {String(i + 1).padStart(2, "0")} · {s.domain}
              </span>
              <ExternalIcon
                width={14}
                height={14}
                className="shrink-0 text-faint transition-colors group-hover:text-lime"
              />
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-text">
              {s.label ?? prettyPath(s.url)}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {s.citedBy.map((step) => (
                <span
                  key={step}
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                    step === "writer" ? "bg-lime/15 text-lime" : "bg-panel-2 text-muted"
                  }`}
                >
                  {CITED_LABEL[step]}
                </span>
              ))}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function prettyPath(url: string) {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/$/, "");
    return path && path !== "/" ? path.split("/").filter(Boolean).join(" / ").replace(/[-_]/g, " ") : u.hostname;
  } catch {
    return url;
  }
}
