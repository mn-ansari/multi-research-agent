import Markdown from "./Markdown";
import { ArrowRightIcon, CheckIcon } from "./Icons";
import { parseCritique } from "@/lib/pipeline";

function scoreColor(score: number) {
  return score >= 8 ? "var(--lime)" : score >= 6 ? "var(--amber)" : "var(--coral)";
}

/** The critic's review as a scorecard: score ring, verdict, strengths vs. improvements. */
export default function CritiqueView({ critique }: { critique: string }) {
  const { score, verdict, strengths, improvements } = parseCritique(critique);
  const structured = strengths.length > 0 || improvements.length > 0;

  const r = 54;
  const c = 2 * Math.PI * r;

  return (
    <div className="fade-up space-y-5">
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Score ring */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-panel p-6">
          <span className="label">Critic score</span>
          <div className="relative mt-4 h-36 w-36">
            <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
              <circle cx="64" cy="64" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
              {score != null && (
                <circle
                  cx="64"
                  cy="64"
                  r={r}
                  fill="none"
                  stroke={scoreColor(score)}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - score / 10)}
                  className="transition-[stroke-dashoffset] duration-1000 ease-out"
                />
              )}
            </svg>
            <div className="absolute inset-0 flex items-baseline justify-center pt-11">
              <span className="font-display text-6xl leading-none text-text">{score ?? "–"}</span>
              <span className="ml-0.5 font-mono text-sm text-muted">/10</span>
            </div>
          </div>
          <span className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted">
            {score == null ? "Unscored" : score >= 8 ? "Strong report" : score >= 6 ? "Solid, with gaps" : "Needs revision"}
          </span>
        </div>

        {/* Verdict */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-panel p-6 sm:p-8">
          <span className="label">One-line verdict</span>
          <p className="mt-4 font-display text-3xl leading-[1.15] text-text sm:text-[2.6rem]">
            {verdict ? <>&ldquo;{verdict}&rdquo;</> : "The critic did not include a one-line verdict."}
          </p>
          <span className="mt-6 font-mono text-[11px] uppercase tracking-wider text-faint">
            Critic Chain · independent review
          </span>
        </div>
      </div>

      {structured ? (
        <div className="grid gap-5 md:grid-cols-2">
          <PointList title="Strengths" items={strengths} tone="good" />
          <PointList title="Areas to improve" items={improvements} tone="improve" />
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-panel p-6 sm:p-8">
          <Markdown>{critique}</Markdown>
        </div>
      )}
    </div>
  );
}

function PointList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "good" | "improve";
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-6">
      <div className="flex items-center justify-between">
        <span className="label">{title}</span>
        <span className="font-mono text-[11px] text-faint">{String(items.length).padStart(2, "0")}</span>
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-text-2">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
                tone === "good" ? "bg-lime/15 text-lime" : "bg-amber/15 text-amber"
              }`}
            >
              {tone === "good" ? (
                <CheckIcon width={12} height={12} strokeWidth={2.5} />
              ) : (
                <ArrowRightIcon width={12} height={12} strokeWidth={2.25} />
              )}
            </span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-faint">None listed.</li>}
      </ul>
    </div>
  );
}
