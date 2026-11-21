/** @doc Last 60 messages per people-chat on this device, bound to the signed-in account, so a chat opens instantly before the fresh load arrives. */
import { getAuthState } from "@/lib/authStore";
const key = (thread: string) => `ceyo_pp_cache_v1:${getAuthState().userId || "-"}:${thread}`;
export function readThread<T>(thread: string): T[] {
  try { const v = JSON.parse(localStorage.getItem(key(thread)) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function writeThread<T>(thread: string, list: T[]) {
  if (!getAuthState().userId) return;
  try { localStorage.setItem(key(thread), JSON.stringify(list.slice(-60))); } catch { /* optional */ }
}
