import { beforeEach, describe, expect, it } from "vitest";
import { claimNotification, markNotified, resetNotifiedForTests } from "./dedupe";

describe("notification dedupe", () => {
  beforeEach(() => resetNotifiedForTests());
  it("shows the same event only once", () => {
    expect(claimNotification("job:1")).toBe(true);
    expect(claimNotification("job:1")).toBe(false);
    expect(claimNotification("job:2")).toBe(true);
  });
  it("never replays work marked as already finished", () => {
    markNotified(["run:9"]);
    expect(claimNotification("run:9")).toBe(false);
  });
  it("forgets ids after three days", () => {
    const t = Date.now();
    expect(claimNotification("job:old", t)).toBe(true);
    resetMemoryOnly();
    expect(claimNotification("job:old", t + 3 * 24 * 3600_000 + 1)).toBe(true);
  });
});

function resetMemoryOnly() {
  const saved = localStorage.getItem("ceyo_notified_v1");
  resetNotifiedForTests();
  if (saved) localStorage.setItem("ceyo_notified_v1", saved);
}
