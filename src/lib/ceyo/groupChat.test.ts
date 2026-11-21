import { describe, expect, it } from "vitest";
import { pickSpeakers } from "./groupChat";
const m = [{ id: "c", name: "المنسق", instructions: "" }, { id: "r", name: "الباحث", instructions: "" }, { id: "w", name: "الكاتب", instructions: "" }];
describe("pickSpeakers", () => {
  it("only mentioned members answer", () => expect(pickSpeakers(m, "c", "يا @الكاتب اكتب").map((x) => x.id)).toEqual(["w"]));
  it("everyone answers, coordinator last", () => expect(pickSpeakers(m, "c", "ابدأوا").map((x) => x.id)).toEqual(["r", "w", "c"]));
});

import { cleanMemberAnswer } from "./groupChat";
describe("cleanMemberAnswer", () => {
  it("drops a copied own-name label and speaker markers", () => expect(cleanMemberAnswer("[[speaker: الكاتب]]\nالكاتب: تمام", "الكاتب")).toBe("تمام"));
  it("keeps teammate names inside the text", () => expect(cleanMemberAnswer("الباحث: قال كده", "الكاتب")).toBe("الباحث: قال كده"));
});

describe("orderedStreams", () => {
  it("shows the second bot only after the first finished, even if it answered first", async () => {
    const { orderedStreams } = await import("./groupChat");
    const out: string[] = [];
    const s = orderedStreams<string>(2, (e) => out.push(e));
    s.emitter(1)("b1");
    s.emitter(0)("a1");
    expect(out).toEqual(["a1"]);
    s.finish(1);
    expect(out).toEqual(["a1"]);
    s.finish(0);
    expect(out).toEqual(["a1", "b1"]);
  });
});
