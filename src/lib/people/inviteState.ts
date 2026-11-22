const KEY = "ceyo-pending-group-invite";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function captureGroupInvite() {
  if (typeof window === "undefined") return;
  const token = new URLSearchParams(window.location.search).get("groupInvite");
  if (token && UUID.test(token)) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ token, until: Date.now() + 3600000 })); } catch { /* blocked storage */ }
  }
}
export function pendingGroupInvite(): string | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null") as { token?: string; until?: number } | null;
    return value?.token && UUID.test(value.token) && typeof value.until === "number" && value.until > Date.now() ? value.token : null;
  } catch { return null; }
}
export function clearGroupInvite() {
  try { sessionStorage.removeItem(KEY); } catch { /* blocked storage */ }
  const url = new URL(window.location.href);
  url.searchParams.delete("groupInvite");
  window.history.replaceState(window.history.state, "", url);
}