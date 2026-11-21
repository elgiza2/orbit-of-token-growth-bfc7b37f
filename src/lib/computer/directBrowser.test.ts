import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { directBrowser } from "./directBrowser.server";

vi.mock("./e2b.server", () => { throw new Error("Browser must never load E2B"); });
beforeEach(() => vi.stubGlobal("WebSocketPair", function WebSocketPair() {}));
afterEach(() => vi.unstubAllGlobals());
it("reads the managed browser directly through a Workers websocket fetch", async () => {
  const listeners = new Map<string, (event: any) => void>();
  const methods: string[] = [];
  const socket = {
    accept: vi.fn(), close: vi.fn(),
    addEventListener: (name: string, fn: (event: any) => void) => listeners.set(name, fn),
    send: (wire: string) => {
      const message = JSON.parse(wire);
      methods.push(message.method);
      const result = message.method === "Target.getTargets" ? { targetInfos: [{ type: "page", targetId: "page" }] }
        : message.method === "Target.attachToTarget" ? { sessionId: "attached" }
        : message.method === "Runtime.evaluate" ? { result: { value: { url: "https://example.org/", text: "Hello", controls: [] } } } : {};
      queueMicrotask(() => listeners.get("message")?.({ data: JSON.stringify({ id: message.id, result }) }));
    },
  };
  const request = vi.fn().mockResolvedValue({ webSocket: socket });
  vi.stubGlobal("fetch", request);
  expect(await directBrowser("wss://browser.example/cdp", { action: "read" })).toMatchObject({ text: "Hello" });
  expect(request).toHaveBeenCalledWith("https://browser.example/cdp", expect.objectContaining({ headers: { Upgrade: "websocket" } }));
  expect(methods).toContain("Runtime.evaluate");
  expect(socket.close).toHaveBeenCalled();
});
it("reports failed websocket upgrades without a sandbox fallback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
  await expect(directBrowser("wss://browser.example/cdp", { action: "read" })).rejects.toThrow("Browser websocket connection failed");
});
