import { describe, expect, it, vi } from "vitest";
import { browserUse, BrowserUseRejected, browserUseCanFallback } from "./browserUse.server";

const profile = "c7902880-206c-4028-a09b-0de95b5da0c7";
const id = "a7902880-206c-4028-a09b-0de95b5da0c7";

describe("Browser Use managed sessions", () => {
  it("opens a scoped 10-minute browser without recording or automated CAPTCHA solving and can stop it", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id, cdpUrl: "wss://example.com/cdp", liveUrl: "https://example.com/live" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const provider = browserUse("fixture", request);
    expect(await provider.open(profile)).toEqual({ id, cdpUrl: "wss://example.com/cdp", liveUrl: "https://example.com/live" });
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({ profileId: profile, timeout: 10, solveCaptchas: false, enableRecording: false });
    await provider.stop(id);
    expect(request.mock.calls[1]).toEqual([`https://api.browser-use.com/api/v4/browsers/${id}`, expect.objectContaining({ method: "PATCH", body: '{"action":"stop"}' })]);
  });

  it("allows Browserbase after an explicit capacity rejection but not after unknown network outcomes", () => {
    expect(browserUseCanFallback(new BrowserUseRejected(429))).toBe(true);
    expect(browserUseCanFallback(new DOMException("Timed out", "TimeoutError"))).toBe(false);
  });
});