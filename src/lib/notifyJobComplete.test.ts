import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { showSystemNotification } from "./notifyJobComplete";
import { previewText } from "./ceyo/phonePush";

const shown: string[] = [];
beforeEach(() => {
  shown.length = 0;
  localStorage.clear();
  class FakeNotification { static permission = "granted"; onclick: unknown = null; constructor(title: string) { shown.push(title); } close() {} }
  vi.stubGlobal("Notification", FakeNotification);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("shows nothing while the user is looking at the app", () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  showSystemNotification({ id: "a", title: "Sara" });
  expect(shown).toEqual([]);
});

it("shows a system notification once when the app is in the background", () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
  showSystemNotification({ id: "b", title: "Sara" });
  showSystemNotification({ id: "b", title: "Sara" });
  expect(shown).toEqual(["Sara"]);
});

it("notification preview drops code blocks, speaker tags and link addresses", () => {
  expect(previewText("[[speaker: Writer]]\nHi **there** [site](https://x.y)\n```ui\n{}\n```")).toBe("Hi there site");
});
