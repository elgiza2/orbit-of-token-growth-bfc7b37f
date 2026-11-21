import { describe, expect, it } from "vitest";
import { describeAttachments, parseAttachments, withAttachments } from "./peopleMediaText";

describe("people chat attachments", () => {
  it("round-trips photos and files with a caption", () => {
    const text = withAttachments([{ path: "t/1.jpg", name: "beach.jpg", type: "image/jpeg" }, { path: "t/2.pdf", name: "plan.pdf", type: "application/pdf" }], "look");
    expect(parseAttachments(text)).toEqual({ files: [{ path: "t/1.jpg", name: "beach.jpg", type: "image/jpeg" }, { path: "t/2.pdf", name: "plan.pdf", type: "application/pdf" }], text: "look" });
  });
  it("bots read attachments as short labels", () => {
    expect(describeAttachments(withAttachments([{ path: "t/1.jpg", name: "beach.jpg", type: "image/jpeg" }], "what is this?"))).toBe("[photo: beach.jpg] what is this?");
  });
  it("file names cannot break the marker", () => {
    const text = withAttachments([{ path: "t/1.png", name: "a|b]]c", type: "image/png" }], "");
    expect(parseAttachments(text).files[0]?.name).toBe("a b  c");
  });
});
