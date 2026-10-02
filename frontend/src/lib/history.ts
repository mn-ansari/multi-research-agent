import type { StepKey } from "./pipeline";

/** A completed run, kept in this browser so it can be reopened later. */
export interface HistoryItem {
  id: string;
  topic: string;
  at: number;
  durationMs: number;
  results: Partial<Record<StepKey, string>>;
}

const KEY = "researchmind.history.v1";
const LIMIT = 8;
const EMPTY: HistoryItem[] = [];

let cache: HistoryItem[] | null = null;
const listeners = new Set<() => void>();

function read(): HistoryItem[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: HistoryItem[]) {
  cache = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full or unavailable: keep the in-memory copy */
  }
  listeners.forEach((l) => l());
}

// useSyncExternalStore bindings
export const subscribeHistory = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getHistory = () => read();
export const getServerHistory = () => EMPTY;

export function saveRun(item: HistoryItem) {
  write([item, ...read().filter((x) => x.id !== item.id)].slice(0, LIMIT));
}

export function clearHistory() {
  write([]);
}
