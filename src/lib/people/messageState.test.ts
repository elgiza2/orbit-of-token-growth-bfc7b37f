import { describe, expect, it } from "vitest";
import { canChangeMessage, firstUnreadMessage, mergeMessages } from "./messageState";
import type { PeopleMessage } from "./peopleApi";
const message: PeopleMessage = { id: "1", thread_id: "group", sender_id: "alice", bot_id: null, content: "Hello", created_at: "2026-11-22T06:00:00Z" };
describe("people message ownership and unread rules", () => {
  it("only the sender can edit or delete their message", () => { expect(canChangeMessage(message, "alice")).toBe(true); expect(canChangeMessage(message, "bob")).toBe(false); expect(canChangeMessage(message, "")).toBe(false); });
  it("deleted messages cannot be edited or restored", () => { expect(canChangeMessage({ ...message, deleted_at: "2026-11-22T06:01:00Z" }, "alice")).toBe(false); });
  it("first unread excludes own, deleted and pre-join messages", () => {
    const messages = [message, { ...message, id: "2", sender_id: "bob" }, { ...message, id: "3", created_at: "2026-11-22T06:02:00Z", deleted_at: "2026-11-22T06:03:00Z" }, { ...message, id: "4", created_at: "2026-11-22T06:04:00Z" }];
    expect(firstUnreadMessage(messages, "bob", { last_read_at: "2026-11-22T05:00:00Z", joined_at: "2026-11-22T06:01:00Z" })).toBe("4");
  });
  it("edits replace a message without adding a duplicate", () => { const edited = { ...message, content: "Updated", edited_at: "2026-11-22T06:01:00Z" }; expect(mergeMessages([message], [edited])).toEqual([edited]); });
  it("a delayed insert cannot reveal a deleted message again", () => { const deleted = { ...message, content: "", deleted_at: "2026-11-22T06:01:00Z" }; expect(mergeMessages([deleted], [message])).toEqual([deleted]); });
});