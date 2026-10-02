"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import AgentFlow, { type StepTiming } from "@/components/AgentFlow";
import ActivityLog, { type LogEntry } from "@/components/ActivityLog";
import Dossier, { DossierPending } from "@/components/Dossier";
import CritiqueView from "@/components/CritiqueView";
import SourcesView from "@/components/SourcesView";
import AgentOutputView from "@/components/AgentOutputView";
import { AlertIcon, ArrowRightIcon, BrandMark, ClockIcon, StopIcon } from "@/components/Icons";
import {
  API_URL,
  STEPS,
  checkHealth,
  extractSources,
  formatDuration,
  streamResearch,
  wordCount,
  type PipelineEvent,
  type StepKey,
  type StepStatus,
} from "@/lib/pipeline";
import {
  clearHistory,
  getHistory,
  getServerHistory,
  saveRun,
  subscribeHistory,
  type HistoryItem,
} from "@/lib/history";

const EXAMPLES = ["LLM agents 2025", "CRISPR gene editing", "Fusion energy progress"];

const IDLE: Record<StepKey, StepStatus> = {
  search: "waiting",
  reader: "waiting",
  writer: "waiting",
  critic: "waiting",
};
const ALL_DONE: Record<StepKey, StepStatus> = {
  search: "done",
  reader: "done",
  writer: "done",
  critic: "done",
};

type TabKey = "dossier" | "critique" | "sources" | "output";

function friendlyError(message: string): { title: string; detail?: string } {
  if (/RESOURCE_EXHAUSTED|\b429\b|quota/i.test(message)) {
    const m = message.match(/retry in (?:(\d+)h)?(?:(\d+)m)?/i);
    const retry = m && (m[1] || m[2]) ? [m[1] && `${m[1]}h`, m[2] && `${m[2]}m`].filter(Boolean).join(" ") : null;
    return {
      title: `Model quota exceeded. The API key's limit has been reached${
        retry ? `; it resets in about ${retry}` : ""
      }.`,
      detail: message,
    };
  }
  if (message === "Failed to fetch" || /NetworkError|Load failed/i.test(message)) {
    return { title: `Could not reach the API at ${API_URL}. Make sure the FastAPI server is running.` };
  }
  return message.length > 220 ? { title: "The pipeline reported an error.", detail: message } : { title: message };
}

export default function Home() {
  const [topic, setTopic] = useState("");
  const [activeTopic, setActiveTopic] = useState("");
  const [statuses, setStatuses] = useState<Record<StepKey, StepStatus>>(IDLE);
  const [timings, setTimings] = useState<Partial<Record<StepKey, StepTiming>>>({});
  const [results, setResults] = useState<Partial<Record<StepKey, string>>>({});
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("dossier");
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const history = useSyncExternalStore(subscribeHistory, getHistory, getServerHistory);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const runRef = useRef<{
    topic: string;
    startedAt: number;
    results: Partial<Record<StepKey, string>>;
    starts: Partial<Record<StepKey, number>>;
  }>({ topic: "", startedAt: 0, results: {}, starts: {} });

  const addLog = useCallback((entry: Omit<LogEntry, "t"> & { t?: number }) => {
    setLog((l) => [...l, { t: entry.t ?? Date.now(), ...entry }]);
  }, []);

  // ── API health ──
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      const ok = await checkHealth();
      if (!cancelled) setApiOnline(ok);
    };
    ping();
    const id = setInterval(ping, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Elapsed-time ticker ──
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // ── "/" focuses the brief ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleEvent = useCallback(
    (event: PipelineEvent) => {
      const t = Date.now();
      const run = runRef.current;
      setNow(t);

      if (event.type === "step") {
        const def = STEPS.find((s) => s.key === event.step)!;
        setStatuses((s) => ({ ...s, [event.step]: event.status }));
        if (event.status === "running") {
          run.starts[event.step] = t;
          setTimings((x) => ({ ...x, [event.step]: { start: t } }));
          addLog({ t, step: event.step, kind: "start", text: `${def.activity.toLowerCase()}…` });
        } else {
          run.results[event.step] = event.output;
          setTimings((x) => ({ ...x, [event.step]: { ...x[event.step], end: t } }));
          setResults((r) => ({ ...r, [event.step]: event.output }));
          const took = run.starts[event.step] != null ? ` in ${formatDuration(t - run.starts[event.step]!)}` : "";
          addLog({
            t,
            step: event.step,
            kind: "done",
            text: `returned ${wordCount(event.output).toLocaleString()} words${took}`,
          });
        }
      } else if (event.type === "error") {
        setStatuses((s) => ({ ...s, [event.step]: "error" }));
        setTimings((x) => ({ ...x, [event.step]: { ...x[event.step], end: t } }));
        setError(event.message);
        addLog({ t, step: event.step, kind: "error", text: friendlyError(event.message).title });
      } else if (event.type === "complete") {
        const id = String(run.startedAt);
        setCreatedAt(t);
        setHistoryId(id);
        addLog({ t, step: "system", kind: "done", text: `dossier ready · ${formatDuration(t - run.startedAt)} total` });
        saveRun({ id, topic: run.topic, at: t, durationMs: t - run.startedAt, results: { ...run.results } });
      }
    },
    [addLog],
  );

  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    const value = topic.trim();
    if (!value) {
      setError("Please enter a research topic first.");
      inputRef.current?.focus();
      return;
    }
    if (running) return;

    const controller = new AbortController();
    const t = Date.now();
    abortRef.current = controller;
    runRef.current = { topic: value, startedAt: t, results: {}, starts: {} };

    setActiveTopic(value);
    setStatuses(IDLE);
    setTimings({});
    setResults({});
    setError(null);
    setNotice(null);
    setCreatedAt(null);
    setHistoryId(null);
    setTab("dossier");
    setNow(t);
    setLog([{ t, step: "system", kind: "info", text: `brief received: “${value}”` }]);
    setRunning(true);

    try {
      await streamResearch(value, handleEvent, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) {
        setNotice("Research stopped. Completed steps are kept below.");
        addLog({ step: "system", kind: "info", text: "stopped by user" });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        addLog({ step: "system", kind: "error", text: friendlyError(message).title });
        checkHealth().then(setApiOnline);
      }
      setStatuses((s) => {
        const next = { ...s };
        for (const k of Object.keys(next) as StepKey[]) {
          if (next[k] === "running") next[k] = controller.signal.aborted ? "waiting" : "error";
        }
        return next;
      });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const openHistory = (item: HistoryItem) => {
    if (running) return;
    setActiveTopic(item.topic);
    setTopic(item.topic);
    setResults(item.results);
    setStatuses(ALL_DONE);
    setTimings({ search: { start: item.at - item.durationMs, end: item.at } });
    setCreatedAt(item.at);
    setHistoryId(item.id);
    setError(null);
    setNotice(null);
    setTab("dossier");
    setLog([]);
    addLog({ step: "system", kind: "info", text: `reopened saved brief: “${item.topic}”` });
  };

  const runningStep = STEPS.find((s) => statuses[s.key] === "running") ?? null;
  const doneCount = STEPS.filter((s) => statuses[s.key] === "done").length;
  const hasRun = activeTopic !== "";
  const sources = useMemo(() => extractSources(results), [results]);
  const lastEnd = Math.max(0, ...Object.values(timings).map((x) => x?.end ?? 0));
  const firstStart = timings.search?.start;
  const elapsedMs = firstStart != null ? (running ? now : lastEnd) - firstStart : null;
  const err = error ? friendlyError(error) : null;

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Top bar ── */}
      <header className="no-print sticky top-0 z-30 border-b border-line bg-shell/90 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark className="text-text" />
            <span className="text-[15px] font-semibold tracking-tight">ResearchMind</span>
            <span className="hidden h-4 w-px bg-line-2 sm:block" />
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-muted sm:block">
              Research Desk
            </span>
          </div>

          <div className="hidden items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted md:flex">
            {running && runningStep ? (
              <>
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime" />
                <span className="text-text-2">{runningStep.title}</span>
                <span className="text-faint">· {doneCount}/4 · {formatDuration(elapsedMs ?? 0)}</span>
              </>
            ) : hasRun && doneCount === 4 ? (
              <span>Last brief completed in {formatDuration(elapsedMs ?? 0)}</span>
            ) : (
              <span className="text-faint">Ready</span>
            )}
          </div>

          <div
            className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted"
            title={API_URL}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                apiOnline == null ? "bg-faint" : apiOnline ? "bg-lime" : "bg-coral"
              }`}
            />
            {apiOnline == null ? "Checking" : apiOnline ? "API online" : "API offline"}
          </div>
        </div>
      </header>

      <div className="flex-1 lg:grid lg:grid-cols-[372px_minmax(0,1fr)]">
        {/* ── Control rail ── */}
        <aside className="no-print border-b border-line bg-panel/40 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="space-y-6 p-4 sm:p-5">
            <form
              onSubmit={run}
              className="rounded-xl border border-line-2 bg-panel transition-colors focus-within:border-lime/50"
            >
              <div className="flex items-center justify-between px-4 pt-3.5">
                <label htmlFor="topic" className="label">
                  New research brief
                </label>
                <span className="kbd hidden lg:inline">/</span>
              </div>
              <textarea
                ref={inputRef}
                id="topic"
                rows={3}
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  if (error && !running) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    run();
                  }
                }}
                disabled={running}
                placeholder="What should the agents investigate? e.g. Quantum computing breakthroughs in 2025"
                className="block w-full resize-none bg-transparent px-4 pb-3 pt-2 text-[15px] leading-relaxed text-text outline-none placeholder:text-faint disabled:opacity-60"
              />
              <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
                <span className="flex items-center gap-1.5 pl-1 text-[11px] text-faint">
                  <span className="kbd">↵</span> run
                  <span className="kbd ml-1.5">⇧ ↵</span> newline
                </span>
                {running ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="inline-flex items-center gap-2 rounded-lg border border-line-2 bg-panel-2 px-4 py-2 text-sm font-medium text-text transition-colors hover:border-coral/60 hover:text-coral"
                  >
                    <StopIcon width={14} height={14} />
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink transition hover:brightness-95 active:translate-y-px"
                  >
                    Run agents
                    <ArrowRightIcon width={14} height={14} strokeWidth={2.25} />
                  </button>
                )}
              </div>
            </form>

            <section>
              <p className="label mb-2">Suggested briefs</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {EXAMPLES.map((ex) => (
                  <li key={ex}>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => {
                        setTopic(ex);
                        setError(null);
                        inputRef.current?.focus();
                      }}
                      className="group flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] text-text-2 transition-colors hover:text-text disabled:opacity-50"
                    >
                      {ex}
                      <ArrowRightIcon
                        width={13}
                        height={13}
                        className="text-faint transition group-hover:translate-x-0.5 group-hover:text-lime"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <div className={log.length === 0 ? "hidden lg:block" : ""}>
              <ActivityLog entries={log} live={running} />
            </div>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="label">Recent briefs</p>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="font-mono text-[10.5px] uppercase tracking-wider text-faint transition-colors hover:text-coral"
                  >
                    Clear
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-4 text-[13px] text-faint">
                  Completed dossiers are saved here, in this browser.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button
                        onClick={() => openHistory(h)}
                        disabled={running}
                        className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors disabled:opacity-50 ${
                          h.id === historyId
                            ? "border-lime/40 bg-lime-dim"
                            : "border-line hover:border-line-2 hover:bg-panel-2"
                        }`}
                      >
                        <p className="truncate text-[13.5px] text-text">{h.topic}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-faint">
                          <ClockIcon width={11} height={11} />
                          {new Date(h.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
                          {formatDuration(h.durationMs)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="hidden pt-2 font-mono text-[10.5px] uppercase tracking-wider text-faint lg:block">
              LangChain · FastAPI · Next.js
            </p>
          </div>
        </aside>

        {/* ── Canvas ── */}
        <main className="dot-grid min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-5xl">
            <div className="no-print mb-3 flex items-center justify-between">
              <p className="label">Agent pipeline</p>
              <p className="font-mono text-[11px] text-faint">{doneCount}/4 complete</p>
            </div>
            <div className="no-print">
              <AgentFlow statuses={statuses} timings={timings} now={now} />
            </div>

            {(err || notice) && (
              <div
                role="alert"
                className={`no-print fade-up mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                  err ? "border-coral/30 bg-coral/10 text-coral" : "border-line bg-panel text-text-2"
                }`}
              >
                <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="break-words">{err ? err.title : notice}</p>
                  {err?.detail && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-coral/70">
                        Technical details
                      </summary>
                      <p className="mt-2 max-h-40 overflow-y-auto break-all font-mono text-[11px] leading-relaxed text-coral/80">
                        {err.detail}
                      </p>
                    </details>
                  )}
                </div>
              </div>
            )}

            {hasRun ? (
              <>
                {/* Telemetry */}
                <div className="no-print mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-panel md:grid-cols-4">
                  <Stat label="Elapsed" value={elapsedMs != null ? formatDuration(elapsedMs) : "--"} />
                  <Stat label="Agents done" value={`${doneCount}/4`} />
                  <Stat label="Sources found" value={String(sources.length)} />
                  <Stat
                    label="Report words"
                    value={results.writer ? wordCount(results.writer).toLocaleString() : "--"}
                  />
                </div>

                {/* Tabs */}
                <div role="tablist" className="no-print mt-8 flex gap-6 overflow-x-auto border-b border-line">
                  <Tab id="dossier" active={tab} onSelect={setTab} ready={results.writer != null} busy={runningStep?.key === "writer"}>
                    Dossier
                  </Tab>
                  <Tab id="critique" active={tab} onSelect={setTab} ready={results.critic != null} busy={runningStep?.key === "critic"}>
                    Critique
                  </Tab>
                  <Tab id="sources" active={tab} onSelect={setTab} ready={sources.length > 0}>
                    Sources <span className="ml-1 font-mono text-[11px] text-faint">{sources.length}</span>
                  </Tab>
                  <Tab id="output" active={tab} onSelect={setTab} ready={results.search != null}>
                    Agent output
                  </Tab>
                </div>

                <div className="mt-6 pb-16">
                  {tab === "dossier" &&
                    (results.writer != null ? (
                      <Dossier
                        topic={activeTopic}
                        report={results.writer}
                        critique={results.critic}
                        sourceCount={sources.length}
                        createdAt={createdAt ?? lastEnd}
                        onOpenCritique={() => setTab("critique")}
                      />
                    ) : running ? (
                      <DossierPending
                        topic={activeTopic}
                        activity={runningStep ? `${runningStep.activity}…` : "Preparing…"}
                      />
                    ) : (
                      <Pending text="The dossier was not produced for this run." />
                    ))}
                  {tab === "critique" &&
                    (results.critic != null ? (
                      <CritiqueView critique={results.critic} />
                    ) : (
                      <Pending
                        text={running ? "The critic reviews the report once the writer has finished." : "No critique for this run."}
                        live={running}
                      />
                    ))}
                  {tab === "sources" && <SourcesView sources={sources} />}
                  {tab === "output" && <AgentOutputView results={results} />}
                </div>
              </>
            ) : (
              <Intro />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line px-5 py-4 [&:not(:last-child)]:border-r max-md:[&:nth-child(2)]:border-r-0 max-md:[&:nth-child(-n+2)]:border-b">
      <p className="label">{label}</p>
      <p className="mt-1.5 font-mono text-xl tabular-nums text-text">{value}</p>
    </div>
  );
}

function Tab({
  id,
  active,
  onSelect,
  ready,
  busy,
  children,
}: {
  id: TabKey;
  active: TabKey;
  onSelect: (t: TabKey) => void;
  ready: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  const on = id === active;
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={() => onSelect(id)}
      className={`relative flex shrink-0 items-center gap-2 pb-3 text-sm transition-colors ${
        on ? "text-text" : ready ? "text-text-2 hover:text-text" : "text-faint hover:text-muted"
      }`}
    >
      {children}
      {busy && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime" />}
      {on && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />}
    </button>
  );
}

function Pending({ text, live = false }: { text: string; live?: boolean }) {
  return (
    <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-line-2 p-10 text-center">
      <p className={`max-w-sm text-sm text-muted ${live ? "caret" : ""}`}>{text}</p>
    </div>
  );
}

function Intro() {
  return (
    <section className="mt-12 pb-16 lg:mt-16">
      <p className="label">Multi-agent research engine</p>
      <h1 className="mt-5 font-display text-[3.4rem] leading-[0.95] tracking-tight text-text sm:text-7xl xl:text-[6.5rem]">
        Ask a question.
        <br />
        <span className="italic text-lime">Four agents</span> brief you.
      </h1>
      <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-text-2">
        A search agent scouts the web, a reader extracts the strongest source, a writer drafts
        a structured report and a critic scores it, all streamed live into a printable dossier.
      </p>

      <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
        {[
          ["01", "The dossier", "Introduction, key findings, conclusion and sources, typeset like print."],
          ["02", "The scorecard", "An independent critic rates the work and lists what to improve."],
          ["03", "The source map", "Every link the agents touched, traced back to who cited it."],
        ].map(([n, title, body]) => (
          <div key={n} className="bg-panel p-6">
            <p className="font-mono text-[11px] text-lime">{n}</p>
            <p className="mt-6 font-display text-2xl text-text">{title}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
