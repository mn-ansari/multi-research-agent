"use client";

import { useState } from "react";
import Markdown from "./Markdown";
import { CheckIcon, CopyIcon, DownloadIcon, PrinterIcon } from "./Icons";
import { dossierSerial, parseScore, wordCount } from "@/lib/pipeline";

function stampColor(score: number) {
  return score >= 8 ? "var(--stamp-good)" : score >= 6 ? "var(--stamp-mid)" : "var(--stamp-low)";
}

function stampWord(score: number) {
  return score >= 8 ? "Approved" : score >= 6 ? "Reviewed" : "Revise";
}

/** The finished report, typeset as a printed research dossier. */
export default function Dossier({
  topic,
  report,
  critique,
  sourceCount,
  createdAt,
  onOpenCritique,
}: {
  topic: string;
  report: string;
  critique?: string;
  sourceCount: number;
  createdAt: number;
  onOpenCritique: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const words = wordCount(report);
  const score = critique ? parseScore(critique) : null;
  const date = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research_report_${Math.floor(Date.now() / 1000)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fade-up">
      {/* Toolbar */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
          {words.toLocaleString()} words · {Math.max(1, Math.round(words / 220))} min read ·{" "}
          {sourceCount} source{sourceCount === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          <ToolButton onClick={copy} label={copied ? "Copied" : "Copy"}>
            {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
          </ToolButton>
          <ToolButton onClick={() => window.print()} label="Print / PDF">
            <PrinterIcon width={14} height={14} />
          </ToolButton>
          <button
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-lg bg-lime px-3 py-1.5 text-[13px] font-medium text-lime-ink transition hover:brightness-95"
          >
            <DownloadIcon width={14} height={14} />
            Download .md
          </button>
        </div>
      </div>

      {/* Paper */}
      <article className="print-area relative mx-auto overflow-hidden rounded-[4px] bg-paper text-paper-ink shadow-[0_1px_0_rgba(255,255,255,0.06),0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        <div className="px-6 pb-14 pt-8 sm:px-14 sm:pt-12 lg:px-20">
          {/* Letterhead */}
          <header className="flex items-center justify-between gap-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-paper-muted">
            <span>ResearchMind · Research Dossier</span>
            <span className="text-right">
              {dossierSerial(topic, createdAt)} · {date}
            </span>
          </header>
          <div className="mt-3 border-t-2 border-paper-ink" />
          <div className="mt-[3px] border-t border-paper-ink" />

          <div className="relative">
            <h1 className="mt-10 max-w-[85%] font-display text-[2.6rem] leading-[1.02] tracking-tight text-paper-ink sm:text-6xl">
              {topic}
            </h1>
            <p className="mt-5 max-w-xl font-serif text-lg italic leading-snug text-paper-muted">
              A briefing compiled by four cooperating agents: web search, source
              extraction, drafting and independent critique.
            </p>

            {score != null && (
              <button
                onClick={onOpenCritique}
                title="Open the critic's review"
                className="stamp absolute right-0 top-2 hidden h-28 w-28 flex-col items-center justify-center rounded-full border-[3px] font-mono uppercase sm:flex"
                style={{ color: stampColor(score), borderColor: stampColor(score) }}
              >
                <span className="absolute inset-1.5 rounded-full border border-dashed border-current opacity-60" />
                <span className="text-[9px] tracking-[0.2em]">Critic</span>
                <span className="font-display text-4xl normal-case leading-none tracking-tight">
                  {score}
                  <span className="text-lg">/10</span>
                </span>
                <span className="text-[9px] tracking-[0.2em]">{stampWord(score)}</span>
              </button>
            )}
          </div>

          <dl className="mt-8 grid grid-cols-3 border-y border-paper-line py-3 font-mono text-[10.5px] uppercase tracking-[0.12em]">
            <Meta label="Prepared by" value="Writer Chain" />
            <Meta label="Reviewed by" value="Critic Chain" />
            <Meta label="Sources" value={String(sourceCount)} />
          </dl>

          <div className="mt-10">
            <Markdown variant="paper">{report}</Markdown>
          </div>

          <footer className="mt-14 flex items-center justify-between border-t border-paper-line pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-muted">
            <span>End of dossier</span>
            <span>{dossierSerial(topic, createdAt)}</span>
          </footer>
        </div>
      </article>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-paper-muted">{label}</dt>
      <dd className="mt-1 truncate text-paper-ink">{value}</dd>
    </div>
  );
}

function ToolButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-panel px-3 py-1.5 text-[13px] text-text-2 transition-colors hover:border-faint hover:text-text"
    >
      {children}
      {label}
    </button>
  );
}

/** Paper placeholder shown while the writer is still drafting. */
export function DossierPending({ topic, activity }: { topic: string; activity: string }) {
  return (
    <div className="fade-up">
      <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-lime">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime" />
        {activity}
      </div>
      <article className="relative overflow-hidden rounded-[4px] bg-paper shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        <div className="px-6 pb-14 pt-8 sm:px-14 sm:pt-12 lg:px-20">
          <header className="flex justify-between font-mono text-[10.5px] uppercase tracking-[0.16em] text-paper-muted">
            <span>ResearchMind · Research Dossier</span>
            <span>Draft in progress</span>
          </header>
          <div className="mt-3 border-t-2 border-paper-ink" />
          <div className="mt-[3px] border-t border-paper-ink" />
          <h1 className="mt-10 max-w-[85%] font-display text-[2.6rem] leading-[1.02] tracking-tight text-paper-ink/40 sm:text-6xl">
            {topic}
          </h1>
          <div className="mt-12 space-y-3.5">
            {[96, 100, 88, 100, 72].map((w, i) => (
              <div key={i} className="skeleton-paper h-3.5" style={{ width: `${w}%` }} />
            ))}
            <div className="h-6" />
            <div className="skeleton-paper h-3 w-40" />
            <div className="h-2" />
            {[100, 92, 97, 64].map((w, i) => (
              <div key={i} className="skeleton-paper h-3.5" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}
