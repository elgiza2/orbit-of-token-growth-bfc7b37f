/** @doc Swipe a chat bubble sideways (touch or pen) to reply to it; returns props for the row element. */
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

const TRIGGER = 56;

export function useSwipeReply<T>(onReply: (item: T) => void) {
  const start = useRef<{ x: number; y: number; el: HTMLElement; item: T; locked: boolean | null } | null>(null);
  const reset = (el?: HTMLElement) => { if (el) { el.style.transition = "transform .18s ease"; el.style.transform = ""; } start.current = null; };
  return (item: T) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") return;
      start.current = { x: e.clientX, y: e.clientY, el: e.currentTarget, item, locked: null };
      e.currentTarget.style.transition = "none";
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (s.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.locked = Math.abs(dx) > Math.abs(dy) * 1.4;
      if (!s.locked) return;
      const rtl = getComputedStyle(s.el).direction === "rtl";
      const pull = Math.max(0, Math.min(90, rtl ? -dx : dx));
      s.el.style.transform = `translateX(${rtl ? -pull : pull}px)`;
      s.el.dataset.swipeReady = pull >= TRIGGER ? "true" : "false";
    },
    onPointerUp: () => {
      const s = start.current;
      if (!s) return;
      const ready = s.el.dataset.swipeReady === "true";
      delete s.el.dataset.swipeReady;
      reset(s.el);
      if (ready) { if ("vibrate" in navigator) navigator.vibrate(10); onReply(s.item); }
    },
    onPointerCancel: () => reset(start.current?.el),
  });
}
