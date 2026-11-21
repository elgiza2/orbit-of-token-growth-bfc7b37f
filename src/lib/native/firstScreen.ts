/**
 * Resolves once the app has painted its first real screen: something visible
 * (text or media) outside the splash, followed by a short quiet period so the
 * splash does not lift in the middle of the first render burst.
 */
export type FirstScreenOptions = { quietMs?: number; settleMaxMs?: number; maxMs?: number };

export function hasVisibleContent(root: ParentNode, exclude: Element | null): boolean {
  const outside = (el: Element) => !exclude || !exclude.contains(el);
  const media = root.querySelectorAll("img, svg, canvas, video, input, textarea, button");
  for (const el of Array.from(media)) {
    if (!outside(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 8 && r.height > 8) return true;
  }
  const body = (root as Document).body ?? (root as HTMLElement);
  const text = (body.innerText ?? body.textContent ?? "").trim();
  return text.length > 0;
}

export function waitForFirstScreen(exclude: () => Element | null, opts: FirstScreenOptions = {}): { promise: Promise<void>; cancel: () => void } {
  const quietMs = opts.quietMs ?? 250;
  const settleMaxMs = opts.settleMaxMs ?? 1200;
  const maxMs = opts.maxMs ?? 10000;
  let done = false;
  let cancel = () => {};
  const promise = new Promise<void>((resolve) => {
    let firstSeen = 0;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(quiet); clearTimeout(settle); clearTimeout(hard);
      resolve();
    };
    const check = () => {
      if (done) return;
      if (!firstSeen) {
        if (!hasVisibleContent(document, exclude())) return;
        firstSeen = Date.now();
        settle = setTimeout(finish, settleMaxMs);
      }
      clearTimeout(quiet);
      quiet = setTimeout(finish, quietMs);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const hard = setTimeout(finish, maxMs);
    cancel = () => { done = true; observer.disconnect(); clearTimeout(quiet); clearTimeout(settle); clearTimeout(hard); };
    check();
  });
  return { promise, cancel: () => cancel() };
}
