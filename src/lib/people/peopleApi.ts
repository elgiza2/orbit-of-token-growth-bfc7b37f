/** @doc Browser client for person-to-person messaging: usernames, direct chats and people groups with bots. */
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type PersonInfo = { id: string; username: string | null; displayName: string | null; avatarUrl: string | null };
export type ThreadBot = { id: string; name: string; look: Record<string, any> | null; addedBy: string };
export type ThreadSummary = {
  id: string; kind: "direct" | "group"; name: string | null; updatedAt: string; lastReadAt: string; unreadCount: number;
  members: PersonInfo[]; last: { content: string; senderId: string | null; botId: string | null; createdAt: string } | null;
};
export type PeopleMessage = { id: string; thread_id: string; sender_id: string | null; bot_id: string | null; content: string; created_at: string; edited_at?: string | null; deleted_at?: string | null };
export type PeopleThread = { id: string; kind: "direct" | "group"; name: string | null; description: string; avatar_url: string | null; created_by: string };
export type InvitePreview = { name: string; description: string; avatarUrl: string | null; memberCount: number };

export type PeopleReaction = { message_id: string; user_id: string; emoji: string };

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const normalizeUsername = (v: string) => v.trim().replace(/^@/, "").toLowerCase();

function check<T>(r: { data: T; error: any }): T {
  if (r.error) throw new Error(r.error.message || "Request failed");
  return r.data;
}

export async function myUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Sign in required");
  return id;
}

export const peopleApi = {
  myUsername: async (): Promise<string | null> => {
    const id = await myUserId();
    const row = check(await db.from("profiles").select("username").eq("id", id).maybeSingle()) as { username: string | null } | null;
    return row?.username ?? null;
  },
  setUsername: async (value: string) => {
    const username = normalizeUsername(value);
    if (!USERNAME_RE.test(username)) throw new Error("3–20 lowercase letters, numbers or _");
    const id = await myUserId();
    const r = await db.from("profiles").update({ username }).eq("id", id);
    if (r.error) throw new Error(/duplicate|unique/i.test(r.error.message) ? "This username is taken" : r.error.message);
    return username;
  },
  search: async (q: string): Promise<PersonInfo[]> => {
    const rows = check(await db.rpc("search_people", { p_query: q })) as any[];
    return (rows || []).map((r) => ({ id: r.id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url }));
  },
  threads: async (): Promise<ThreadSummary[]> => {
    const [list, counts] = await Promise.all([db.rpc("my_people_threads"), db.rpc("people_unread_counts")]);
    const unread = new Map((check(counts) as { thread_id: string; unread_count: number }[]).map((r) => [r.thread_id, Number(r.unread_count)]));
    return ((check(list) as ThreadSummary[]) || []).map((t) => ({ ...t, unreadCount: unread.get(t.id) || 0 }));
  },
  saveGroup: async (id: string, name: string, description: string, avatar: string | null) => { check(await db.rpc("update_people_group", { p_thread: id, p_name: name, p_description: description, p_avatar: avatar })); },
  invite: async (id: string, reset = false): Promise<string> => check(await db.rpc("people_group_invite", { p_thread: id, p_reset: reset })) as string,
  previewInvite: async (token: string): Promise<InvitePreview | null> => check(await db.rpc("preview_people_invite", { p_token: token })) as InvitePreview | null,
  joinInvite: async (token: string): Promise<string> => check(await db.rpc("join_people_invite", { p_token: token })) as string,
  changeMessage: async (id: string, content: string, remove = false): Promise<PeopleMessage> => check(await db.rpc("edit_people_message", { p_message: id, p_content: content, p_delete: remove })) as PeopleMessage,
  myReadMarker: async (threadId: string): Promise<{ last_read_at: string; joined_at: string }> => {
    const id = await myUserId();
    return check(await db.from("people_thread_members").select("last_read_at,joined_at").eq("thread_id", threadId).eq("user_id", id).single()) as { last_read_at: string; joined_at: string };
  },
  openDirect: async (username: string): Promise<string> => check(await db.rpc("open_direct_thread", { p_username: normalizeUsername(username) })) as string,
  createGroup: async (name: string, usernames: string[], botIds: string[]): Promise<string> =>
    check(await db.rpc("create_people_group", { p_name: name, p_usernames: usernames.map(normalizeUsername), p_bot_ids: botIds })) as string,
  addMember: async (threadId: string, username: string) => { check(await db.rpc("add_people_member", { p_thread: threadId, p_username: normalizeUsername(username) })); },
  addBot: async (threadId: string, botId: string) => { check(await db.rpc("add_people_bot", { p_thread: threadId, p_bot: botId })); },
  leave: async (threadId: string) => { check(await db.rpc("leave_people_thread", { p_thread: threadId })); },
  info: async (threadId: string): Promise<{ members: PersonInfo[]; bots: ThreadBot[] } | null> => check(await db.rpc("people_thread_info", { p_thread: threadId })) as any,
  thread: async (threadId: string) => check(await db.from("people_threads").select("id,kind,name,description,avatar_url,created_by").eq("id", threadId).maybeSingle()) as PeopleThread | null,
  messages: async (threadId: string, unreadSince?: string): Promise<PeopleMessage[]> => {
    const rows = check(await db.from("people_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(200)) as PeopleMessage[];
    const recent = (rows || []).reverse();
    if (!unreadSince || !recent[0] || Date.parse(recent[0].created_at) <= Date.parse(unreadSince)) return recent;
    const unread: PeopleMessage[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = check(await db.from("people_messages").select("*").eq("thread_id", threadId).gt("created_at", unreadSince).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 199)) as PeopleMessage[];
      unread.push(...page);
      if (page.length < 200) break;
    }
    return [...new Map([...recent, ...unread].map((m) => [m.id, m])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  send: async (threadId: string, content: string): Promise<PeopleMessage> => {
    const sender = await myUserId();
    const r = await db.from("people_messages").insert({ thread_id: threadId, sender_id: sender, content }).select("*").single();
    if (r.error) throw new Error(/row-level security|policy/i.test(r.error.message) ? "You can't message this person" : r.error.message);
    return r.data as PeopleMessage;
  },
  /** Messages newer than the given time, used to catch anything a live update missed. */
  since: async (threadId: string, after: string): Promise<PeopleMessage[]> =>
    (check(await db.from("people_messages").select("*").eq("thread_id", threadId).gt("created_at", after).order("created_at", { ascending: true }).limit(100)) as PeopleMessage[]) || [],
  deleteForAll: async (threadId: string) => { check(await db.rpc("delete_people_thread_for_all", { p_thread: threadId })); },
  isBlocked: async (userId: string): Promise<boolean> => {
    const me = await myUserId();
    const row = check(await db.from("people_blocks").select("blocked_id").eq("blocker_id", me).eq("blocked_id", userId).maybeSingle());
    return Boolean(row);
  },
  block: async (userId: string) => {
    const me = await myUserId();
    const r = await db.from("people_blocks").insert({ blocker_id: me, blocked_id: userId });
    if (r.error && !/duplicate/i.test(r.error.message)) throw new Error(r.error.message);
  },
  unblock: async (userId: string) => {
    const me = await myUserId();
    check(await db.from("people_blocks").delete().eq("blocker_id", me).eq("blocked_id", userId));
  },
  markRead: async (threadId: string, until: string) => {
    check(await db.rpc("mark_people_read", { p_thread: threadId, p_until: until }));
    window.dispatchEvent(new Event("ceyo-people-changed"));
  },
  /** Each member's last read time; empty when the server has no read receipts yet. */
  readState: async (threadId: string): Promise<Record<string, string>> => {
    const r = await db.rpc("people_read_state", { p_thread: threadId });
    if (r.error) return {};
    return Object.fromEntries(((r.data as any[]) || []).map((x) => [x.user_id, x.last_read_at]));
  },
  reactions: async (threadId: string): Promise<PeopleReaction[]> => {
    const r = await db.from("people_reactions").select("message_id,user_id,emoji").eq("thread_id", threadId);
    return r.error ? [] : (r.data as PeopleReaction[]) || [];
  },
  /** Sets my reaction on a message; tapping the same emoji again removes it. */
  react: async (threadId: string, messageId: string, emoji: string | null) => {
    const me = await myUserId();
    if (!emoji) { check(await db.from("people_reactions").delete().eq("message_id", messageId).eq("user_id", me)); return; }
    check(await db.from("people_reactions").upsert({ message_id: messageId, thread_id: threadId, user_id: me, emoji }, { onConflict: "message_id,user_id" }));
  },
  /** Asks the server to let any @mentioned bot in this thread answer the message. */
  askBots: async (threadId: string, messageId: string) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await fetch("/api/people-bot", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ threadId, messageId }) }).catch(() => {});
  },
};

export { mentionedBots } from "./mentions";

export function personLabel(p: PersonInfo | undefined | null) {
  return p?.displayName || (p?.username ? `@${p.username}` : "User");
}
