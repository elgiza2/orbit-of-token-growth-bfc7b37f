import type { PeopleMessage } from "./peopleApi";

export function canChangeMessage(message: PeopleMessage, userId: string) {
  return Boolean(userId && message.sender_id === userId && !message.deleted_at);
}

export function firstUnreadMessage(messages: PeopleMessage[], userId: string, marker: { last_read_at: string; joined_at: string }) {
  return messages.find((m) => m.sender_id !== userId && !m.deleted_at && Date.parse(m.created_at) > Date.parse(marker.last_read_at) && Date.parse(m.created_at) >= Date.parse(marker.joined_at))?.id || null;
}

export function mergeMessages(current: PeopleMessage[], incoming: PeopleMessage[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) {
    const old = byId.get(m.id);
    // A delayed insert/catch-up must not resurrect deleted or older edited content.
    const version = (v: PeopleMessage) => Date.parse(v.deleted_at || v.edited_at || v.created_at);
    if (!old || version(m) >= version(old)) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}