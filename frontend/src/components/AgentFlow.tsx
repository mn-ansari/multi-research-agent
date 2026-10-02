import { Fragment } from "react";
import { AlertIcon, CheckIcon, STEP_ICONS } from "./Icons";
import { STEPS, formatDuration, type StepKey, type StepStatus } from "@/lib/pipeline";

export interface StepTiming {
  start?: number;
  end?: number;
}

const STATUS_TEXT: Record<StepStatus, string> = {
  waiting: "Idle",
  running: "Working",
  done: "Complete",
  error: "Failed",
};

/** The four agents drawn as a connected flow, with data "beaming" into the active one. */
export default function AgentFlow({
  statuses,
  timings,
  now,
}: {
  statuses: Record<StepKey, StepStatus>;
  timings: Partial<Record<StepKey, StepTiming>>;
  now: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:flex md:items-stretch md:gap-0">
      {STEPS.map((step, i) => {
        const next = STEPS[i + 1];
        const traversed = statuses[step.key] === "done";
        const flowing = traversed && next != null && statuses[next.key] === "running";
        return (
          <Fragment key={step.key}>
            <Node
              stepKey={step.key}
              num={step.num}
              title={step.title}
              desc={step.desc}
              status={statuses[step.key]}
              timing={timings[step.key]}
              now={now}
            />
            {next && (
              <div aria-hidden className="relative hidden w-8 shrink-0 items-center md:flex lg:w-12">
                <div
                  className={`relative h-px w-full transition-colors duration-500 ${
                    traversed ? "bg-lime/60" : "bg-line-2"
                  }`}
                >
                  {flowing && <span className="beam" />}
                </div>
                <span
                  className={`absolute right-0 h-1.5 w-1.5 rotate-45 border-r border-t ${
                    traversed ? "border-lime/70" : "border-line-2"
                  }`}
                />
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function Node({
  stepKey,
  num,
  title,
  desc,
  status,
  timing,
  now,
}: {
  stepKey: StepKey;
  num: string;
  title: string;
  desc: string;
  status: StepStatus;
  timing?: StepTiming;
  now: number;
}) {
  const Icon = STEP_ICONS[stepKey];
  const elapsed = timing?.start != null ? (timing.end ?? now) - timing.start : null;

  const frame =
    status === "running"
      ? "border-lime/50 bg-lime-dim node-glow"
      : status === "done"
        ? "border-line-2 bg-panel-2"
        : status === "error"
          ? "border-coral/50 bg-coral/5"
          : "border-line bg-panel";

  const iconBox =
    status === "running"
      ? "bg-lime text-lime-ink"
      : status === "done"
        ? "bg-text text-shell"
        : status === "error"
          ? "bg-coral/15 text-coral"
          : "bg-panel-2 text-muted border border-line";

  return (
    <div className={`relative min-w-0 flex-1 rounded-xl border p-4 transition-colors duration-300 ${frame}`}>
      <div className="flex items-center justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBox}`}>
          {status === "done" ? (
            <CheckIcon width={15} height={15} strokeWidth={2.25} />
          ) : status === "error" ? (
            <AlertIcon width={15} height={15} />
          ) : (
            <Icon width={15} height={15} />
          )}
        </span>
        <span className="font-mono text-[11px] text-faint">{num}</span>
      </div>
      <p className={`mt-3 text-sm font-medium ${status === "waiting" ? "text-text-2" : "text-text"}`}>
        {title}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted">{desc}</p>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 font-mono text-[10.5px] uppercase tracking-wider">
        <span
          className={`flex items-center gap-1.5 ${
            status === "running"
              ? "text-lime"
              : status === "done"
                ? "text-text-2"
                : status === "error"
                  ? "text-coral"
                  : "text-faint"
          }`}
        >
          {status === "running" && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime" />}
          {STATUS_TEXT[status]}
        </span>
        <span className="tabular-nums text-faint">
          {elapsed != null ? formatDuration(elapsed) : "--"}
        </span>
      </div>
    </div>
  );
}
