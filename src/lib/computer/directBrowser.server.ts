import type { z } from "zod";
import { browserAction } from "./browserRules";

/** Browser-level CDP connection, supported by Workers without Node or a sandbox. */
export async function directBrowser(connectUrl: string, input: z.infer<typeof browserAction>) {
  const socket = await connectSocket(connectUrl);
  let sequence = 0;
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const fail = () => {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error("Browser websocket disconnected")); }
    pending.clear();
  };
  socket.addEventListener("close", fail);
  socket.addEventListener("error", fail);
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      const p = pending.get(message.id);
      if (!p) return;
      clearTimeout(p.timer); pending.delete(message.id);
      if (message.error) p.reject(new Error(message.error.message || "Browser command failed"));
      else p.resolve(message.result);
    } catch { fail(); }
  });
  function command(method: string, params: object = {}, sessionId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("Browser command timed out")); }, 30_000);
      pending.set(id, { resolve, reject, timer });
      try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
      catch { clearTimeout(timer); pending.delete(id); reject(new Error("Browser websocket send failed")); }
    });
  }
  try {
    const { targetInfos } = await command("Target.getTargets");
    let targetId = targetInfos.find((t: { type: string }) => t.type === "page")?.targetId;
    if (!targetId) ({ targetId } = await command("Target.createTarget", { url: "about:blank" }));
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    const page = (method: string, params: object = {}) => command(method, params, sessionId);
    async function evaluate(expression: string) {
      const result = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error("Page evaluation failed: invalid selector, missing control, or page changed");
      return result.result.value;
    }
    await page("Page.enable");
    await page("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    if (input.action === "navigate" || input.action === "login") {
      const result = await page("Page.navigate", { url: input.url });
      if (result.errorText) throw new Error(`Navigation failed: ${result.errorText}`);
      // Wait for the requested document, not the preceding page's readyState.
      const deadline = Date.now() + 25_000;
      let ready = false;
      while (Date.now() < deadline) {
        try { const frame = await page("Page.getFrameTree");
          ready = (!result.loaderId || frame.frameTree.frame.loaderId === result.loaderId) && await evaluate(`location.href !== 'about:blank' && document.readyState !== 'loading' && performance.getEntriesByType('navigation').length > 0`); } catch { /* execution context replaced during navigation */ }
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!ready) throw new Error("Navigation timed out; observe before repeating");
    }
    if (["click", "fill", "press"].includes(input.action)) {
      await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(input.selector)}); if (!e) throw Error('Control not found'); e.scrollIntoView({block:'center'}); e.focus(); ${input.action === "click" ? "e.click();" : input.action === "fill" ? `const setter = Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set; if (!setter) throw Error('Not an input'); setter.call(e, ${JSON.stringify(input.value || "")}); e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true}));` : ""} })()`);
      if (input.action === "press") {
        const key = input.value || "Enter";
        const codes: Record<string, number> = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
        if (!codes[key]) throw new Error("Unsupported key; use Enter, Tab, Escape, Backspace, Delete or an arrow key");
        await page("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: codes[key], ...(key === "Enter" ? { text: "\r" } : {}) });
        await page("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: codes[key] });
      }
    }
    if (input.action === "click_at") {
      await page("Input.dispatchMouseEvent", { type: "mousePressed", x: input.x, y: input.y, button: "left", clickCount: 1 });
      await page("Input.dispatchMouseEvent", { type: "mouseReleased", x: input.x, y: input.y, button: "left", clickCount: 1 });
    }
    if (input.action === "type_text") await page("Input.insertText", { text: input.value || "" });
    const observation = await evaluate(`({url:location.href,text:(document.body?.innerText||'').slice(0,12000),controls:Array.from(document.querySelectorAll('input,button,a,textarea,select')).slice(0,80).map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,text:(e.innerText||e.getAttribute('aria-label')||'').slice(0,100)}))})`);
    if (input.action === "look") observation.shot = (await page("Page.captureScreenshot", { format: "jpeg", quality: 60 })).data;
    return observation as { url: string; shot?: string; text: string; controls: unknown[] };
  } finally { fail(); socket.close(); }
}

type CdpSocket = Pick<WebSocket, "send" | "close" | "addEventListener">;

/** Workers upgrade through fetch; Node hosts (dev server, Vercel) use the standard WebSocket client. */
async function connectSocket(connectUrl: string): Promise<CdpSocket> {
  const endpoint = new URL(connectUrl);
  if (endpoint.protocol !== "wss:" && endpoint.protocol !== "https:") throw new Error("Invalid browser endpoint");
  const workers = typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== "undefined";
  if (workers || typeof WebSocket === "undefined") {
    endpoint.protocol = "https:";
    const response = await fetch(endpoint.href, { headers: { Upgrade: "websocket" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const socket = (response as Response & { webSocket?: WebSocket & { accept(): void } }).webSocket;
    if (!socket) throw new Error("Browser websocket connection failed");
    socket.accept();
    return socket;
  }
  endpoint.protocol = "wss:";
  const socket = new WebSocket(endpoint.href);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { try { socket.close(); } catch { /* closed */ } reject(new Error("Browser websocket connection failed")); }, 15_000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Browser websocket connection failed")); }, { once: true });
  });
  return socket;
}
