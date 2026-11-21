import { describe, expect, it } from "vitest";
import { quoteFor, splitReply, withReply } from "./replyQuote";

describe("reply quotes", () => {
  it("round-trips a reply", () => {
    const sent = withReply("see you at 8", "ok!");
    expect(sent).toBe("> see you at 8\n\nok!");
    expect(splitReply(sent)).toEqual({ quote: "see you at 8", body: "ok!" });
  });
  it("keeps plain messages untouched", () => {
    expect(splitReply("hello")).toEqual({ quote: null, body: "hello" });
    expect(withReply(null, "hello")).toBe("hello");
  });
  it("never nests an earlier quote and trims long text to 140 chars", () => {
    expect(quoteFor("> old\n\nnew text")).toBe("new text");
    expect(quoteFor("a".repeat(300)).length).toBe(140);
  });
});
