import { z } from "zod";

const id = z.string().uuid();
const browser = z.object({ id, cdpUrl: z.string().regex(/^(wss|https):\/\//), liveUrl: z.string().startsWith("https://") });
const API = "https://api.browser-use.com/api/v4";

export class BrowserUseRejected extends Error {
  constructor(readonly status: number) { super("Browser Use could not open a browser"); }
}

export function browserUseCanFallback(error: unknown) {
  return error instanceof BrowserUseRejected && [401, 402, 403, 404, 429, 503].includes(error.status);
}

export function browserUse(key: string, request = fetch) {
  async function api(path: string, method: string, body: object) {
    const res = await request(`${API}${path}`, {
      method, redirect: "manual", signal: AbortSignal.timeout(15_000),
      headers: { "X-Browser-Use-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new BrowserUseRejected(res.status);
    return res;
  }
  const stop = async (sessionId: string) => { await api(`/browsers/${id.parse(sessionId)}`, "PATCH", { action: "stop" }); };
  return {
    async createProfile() {
      return z.object({ id }).parse(await (await api("/profiles", "POST", {})).json()).id;
    },
    async open(profileId: string) {
      const raw: unknown = await (await api("/browsers", "POST", {
        profileId: id.parse(profileId), timeout: 10, browserScreenWidth: 1280, browserScreenHeight: 800,
        proxyCountryCode: null, solveCaptchas: false, enableRecording: false,
      })).json();
      const parsed = browser.safeParse(raw);
      if (parsed.success) return parsed.data;
      const partial = z.object({ id }).safeParse(raw);
      if (partial.success) await stop(partial.data.id).catch(() => undefined);
      throw new Error("Browser Use returned an incomplete session");
    },
    stop,
  };
}