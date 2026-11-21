import { claimNotification } from "@/lib/notifications/dedupe";

/** The user is looking at the app right now: no notification, like WhatsApp. */
const appInView = () => typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();

/**
 * Show a system notification (outside the app, like WhatsApp) once per event id.
 * Nothing is drawn inside the app. Shown only while the app is in the background or not focused;
 * the Android app gets its notifications as server pushes instead.
 */
export function showSystemNotification(opts: { id: string; title: string; body?: string; onClickUrl?: string; force?: boolean }) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (!opts.force && appInView()) return;
  if (Notification.permission !== "granted") return;
  if (!claimNotification(opts.id)) return;
  const options: NotificationOptions = { body: opts.body, tag: opts.id, icon: "/app-icon-192.png", badge: "/app-icon-192.png", data: { url: opts.onClickUrl || "/" } };
  const fallback = () => {
    try {
      const n = new Notification(opts.title, options);
      n.onclick = () => { window.focus(); if (opts.onClickUrl) window.location.href = opts.onClickUrl; n.close(); };
    } catch { /* this browser only allows notifications through a service worker */ }
  };
  // Some mobile browsers only allow notifications through a service worker registration.
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistration().then((reg) => reg ? reg.showNotification(opts.title, options) : fallback()).catch(fallback);
  } else fallback();
}

/** Completion notification for a background job; same id is shown only once per device. */
export function notifyJobComplete(opts: {
  id: string;
  kind: "video" | "slides" | "research";
  title: string;
  body?: string;
  onClickUrl?: string;
  failed?: boolean;
}) {
  showSystemNotification({ id: opts.id, title: opts.title, body: opts.body, onClickUrl: opts.onClickUrl });
}

/** Best-effort request for Notification permission (silent when unavailable). */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch {
    return false;
  }
}
