export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export type StepKey = "search" | "reader" | "writer" | "critic";
export type StepStatus = "waiting" | "running" | "done" | "error";

export interface StepDef {
  key: StepKey;
  num: string;
  title: string;
  desc: string;
  activity: string;
}

export const STEPS: StepDef[] = [
  {
    key: "search",
    num: "01",
    title: "Search Agent",
    desc: "Gathers recent web information",
    activity: "Searching the web for reliable sources",
  },
  {
    key: "reader",
    num: "02",
    title: "Reader Agent",
    desc: "Scrapes & extracts deep content",
    activity: "Reading and extracting the most relevant source",
  },
  {
    key: "writer",
    num: "03",
    title: "Writer Chain",
    desc: "Drafts the full research report",
    activity: "Drafting the research report",
  },
  {
    key: "critic",
    num: "04",
    title: "Critic Chain",
    desc: "Reviews & scores the report",
    activity: "Reviewing and scoring the report",
  },
];

export type PipelineEvent =
  | { type: "step"; step: StepKey; status: "running" }
  | { type: "step"; step: StepKey; status: "done"; output: string }
  | { type: "error"; step: StepKey; message: string }
  | { type: "complete" };

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`, { signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Runs the pipeline on the FastAPI backend, invoking `onEvent` as each step progresses. */
export async function streamResearch(
  topic: string,
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/research/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = String(data.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as PipelineEvent);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

/** Pulls "Score: X/10" out of the critic's response. */
export function parseScore(critique: string): number | null {
  const match = critique.match(/score\s*[:\-]?\s*\**\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : null;
}

/** Pulls the "One line verdict" out of the critic's response. */
export function parseVerdict(critique: string): string | null {
  const match = critique.match(/one[\s-]*line\s+verdict\s*:?\**\s*\n?\s*(.+)/i);
  return match ? match[1].replace(/^\*+|\*+$/g, "").trim() || null : null;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export interface Critique {
  score: number | null;
  verdict: string | null;
  strengths: string[];
  improvements: string[];
}

/** Splits the critic's fixed-format response into its sections. */
export function parseCritique(critique: string): Critique {
  const strengths: string[] = [];
  const improvements: string[] = [];
  let section: "strengths" | "improvements" | null = null;

  for (const raw of critique.split("\n")) {
    const line = raw.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
    if (!line) continue;
    if (/^strengths\s*:?$/i.test(line)) {
      section = "strengths";
      continue;
    }
    if (/^areas?\s+(to|for)\s+improve(ment)?s?\s*:?$/i.test(line)) {
      section = "improvements";
      continue;
    }
    if (/^(one[\s-]*line\s+verdict|score)\b/i.test(line)) {
      section = null;
      continue;
    }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet && section) {
      (section === "strengths" ? strengths : improvements).push(bullet[1].trim());
    }
  }

  return { score: parseScore(critique), verdict: parseVerdict(critique), strengths, improvements };
}

export interface Source {
  url: string;
  domain: string;
  label: string | null;
  citedBy: StepKey[];
}

/** Collects every distinct URL the agents surfaced, noting which step cited it. */
export function extractSources(results: Partial<Record<StepKey, string>>): Source[] {
  const byUrl = new Map<string, Source>();
  const order: StepKey[] = ["search", "reader", "writer"];

  for (const step of order) {
    const text = results[step];
    if (!text) continue;

    const labels = new Map<string, string>();
    for (const m of text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
      labels.set(cleanUrl(m[2]), m[1].trim());
    }
    for (const m of text.matchAll(/Title:\s*(.+)\s*\n\s*URL:\s*(\S+)/g)) {
      labels.set(cleanUrl(m[2]), m[1].trim());
    }

    for (const m of text.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)) {
      const url = cleanUrl(m[0]);
      let domain: string;
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      const existing = byUrl.get(url);
      const label = labels.get(url) ?? null;
      if (existing) {
        if (!existing.citedBy.includes(step)) existing.citedBy.push(step);
        if (!existing.label && label) existing.label = label;
      } else {
        byUrl.set(url, { url, domain, label, citedBy: [step] });
      }
    }
  }
  return [...byUrl.values()];
}

function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?*]+$/, "");
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** A short, stable reference number for a dossier, e.g. "RM-4K2Q9". */
export function dossierSerial(topic: string, at: number): string {
  let h = 2166136261;
  for (const ch of `${topic}|${at}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `RM-${(h >>> 0).toString(36).toUpperCase().slice(0, 5).padStart(5, "0")}`;
}

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}
