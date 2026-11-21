import { describe, expect, it } from "vitest";
import { landingHostResponse, withRobotsTag } from "./hostRouting.server";

describe("landing host routing", () => {
  it("serves the home page as full HTML with its own canonical link", async () => {
    const res = await landingHostResponse(new Request("https://ceyo.si/"));
    expect(res?.status).toBe(200);
    const html = await res!.text();
    expect(html).toContain('<link rel="canonical" href="https://ceyo.app/">');
  });
  it("sends app screens on the landing to the web app", async () => {
    const res = await landingHostResponse(new Request("https://ceyo.app/settings?a=1"));
    expect(res?.headers.get("location")).toBe("https://web.ceyo.si/settings?a=1");
  });
  it("leaves files and public pages alone", async () => {
    expect(await landingHostResponse(new Request("https://ceyo.app/assets/app.js"))).toBeNull();
    expect(await landingHostResponse(new Request("https://ceyo.app/privacy"))).toBeNull();
  });
  it("does nothing on the web app host", async () => expect(await landingHostResponse(new Request("https://web.ceyo.si/"))).toBeNull());
  it("tags Android app pages as not indexable", () => {
    const res = withRobotsTag(new Request("https://app.ceyo.si/"), new Response("<p>x</p>", { headers: { "content-type": "text/html" } }));
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
