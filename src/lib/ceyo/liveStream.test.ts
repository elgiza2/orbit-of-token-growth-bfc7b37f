import { describe, expect, it } from "vitest";
import { liveStreamReady, safeVisibleLength } from "./liveStream";

const long = "Here is a friendly, detailed answer about your trip to Alexandria with places to eat, things to see along the corniche, and how to get there by train.";
describe("live answer streaming", () => {
  it("holds short beginnings", () => expect(liveStreamReady("Sure, here")).toBe(false));
  it("streams a genuine answer once the prefix is long enough", () => expect(liveStreamReady(long)).toBe(true));
  it("never streams a refusal that may be retried", () => expect(liveStreamReady("I can't access the internet right now. " + long)).toBe(false));
  it("never streams a printed tool call", () => expect(liveStreamReady('```json\n{"name": "web_search", "arguments": {}}\n``` ' + long, ["web_search"])).toBe(false));
  it("stops streaming once a real tool call starts", () => expect(liveStreamReady(long, [], true)).toBe(false));
  it("waits for an unfinished code block to close", () => {
    expect(safeVisibleLength("Intro\n```ui\n{\"a\":")).toBe(6);
    expect(safeVisibleLength("Intro\n```ui\n{}\n```\nDone")).toBe("Intro\n```ui\n{}\n```\nDone".length);
  });
});
