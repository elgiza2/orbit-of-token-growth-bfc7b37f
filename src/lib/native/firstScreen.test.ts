import { describe, expect, it } from "vitest";
import { waitForFirstScreen } from "./firstScreen";

describe("Android splash waits for the first screen", () => {
  it("stays while the page is empty and lifts once the app has drawn something", async () => {
    document.body.innerHTML = "";
    let lifted = false;
    const wait = waitForFirstScreen(() => null, { quietMs: 30, maxMs: 5000 });
    void wait.promise.then(() => { lifted = true; });
    await new Promise((r) => setTimeout(r, 80));
    expect(lifted).toBe(false);
    const el = document.createElement("p");
    el.textContent = "Hello";
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 120));
    expect(lifted).toBe(true);
  });
  it("never waits longer than the safety limit", async () => {
    document.body.innerHTML = "";
    const started = Date.now();
    await waitForFirstScreen(() => null, { maxMs: 60 }).promise;
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
