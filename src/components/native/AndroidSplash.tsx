/**
 * Android-app-only boot splash: the Ceyo ghost on black, matching the native
 * launch screen so the hand-off is invisible. It stays until the app has
 * painted its first real screen, then tells the native side (appReady) and
 * fades out together with it. Never renders on the web.
 */
import { useEffect, useRef, useState } from "react";
import { isPlayApp } from "@/lib/native/playBilling";
import { waitForFirstScreen } from "@/lib/native/firstScreen";
import "@/styles/android-splash.css";

const tellNativeReady = () => {
  try { (window as unknown as { MegsyAndroid?: { appReady?: () => void } }).MegsyAndroid?.appReady?.(); } catch { /* older app build */ }
};

export function AndroidSplash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isPlayApp()) return;
    setShow(true);
    const started = Date.now();
    const wait = waitForFirstScreen(() => ref.current);
    let t1: ReturnType<typeof setTimeout> | undefined;
    let t2: ReturnType<typeof setTimeout> | undefined;
    void wait.promise.then(() => {
      // A tiny minimum avoids a one-frame flash on very fast warm starts.
      t1 = setTimeout(() => {
        tellNativeReady();
        setLeaving(true);
        t2 = setTimeout(() => setShow(false), 320);
      }, Math.max(0, 250 - (Date.now() - started)));
    });
    return () => { wait.cancel(); clearTimeout(t1); clearTimeout(t2); tellNativeReady(); };
  }, []);
  if (!show) return null;
  return (
    <div ref={ref} className={`android-splash${leaving ? " is-leaving" : ""}`} role="status" aria-label="Loading Ceyo">
      <div className="android-splash-ghost">
        <img src="/splash-ghost.webp" alt="" width={150} height={150} decoding="sync" fetchPriority="high" draggable={false} />
      </div>
    </div>
  );
}
