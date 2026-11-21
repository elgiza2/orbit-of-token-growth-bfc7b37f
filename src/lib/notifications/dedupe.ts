/** @doc One notification per event: ids already shown are remembered on this device (shared across tabs) for three days. */
const KEY = "ceyo_notified_v1";
const TTL = 3 * 24 * 3600_000;
const MAX = 400;
const memory = new Map<string, number>();

function read(): Record<string, number> {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

/** Returns true only the first time an id is claimed (on this device, across tabs and reloads). */
export function claimNotification(id: string, now = Date.now()): boolean {
  if (memory.has(id)) return false;
  const all = read();
  if (all[id] && now - all[id] < TTL) { memory.set(id, all[id]); return false; }
  all[id] = now;
  memory.set(id, now);
  const kept = Object.entries(all).filter(([, at]) => now - at < TTL).sort((a, b) => b[1] - a[1]).slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* memory still dedupes this tab */ }
  return true;
}

/** Marks ids as already shown without showing them (old work found at startup). */
export function markNotified(ids: string[], now = Date.now()) {
  if (!ids.length) return;
  const all = read();
  for (const id of ids) { all[id] ??= now; memory.set(id, all[id]); }
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* optional */ }
}

export function resetNotifiedForTests() { memory.clear(); try { localStorage.removeItem(KEY); } catch { /* none */ } }
