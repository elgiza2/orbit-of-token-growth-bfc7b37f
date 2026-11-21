/** Bots that a message addresses with @Name (case-insensitive, Arabic names supported). */
export function mentionedBots<T extends { name: string }>(text: string, bots: T[]): T[] {
  const lower = text.toLowerCase();
  return bots.filter((b) => lower.includes(`@${b.name.toLowerCase()}`));
}

/** Most bots that answer one message, to bound cost per send. */
export const MAX_GROUP_REPLIES = 8;

/**
 * Bots that answer a member's message: every bot in the chat replies on its own;
 * an @mention narrows the reply to the bots it names.
 */
export function botsToAnswer<T extends { name: string }>(text: string, bots: T[]): T[] {
  const named = mentionedBots(text, bots);
  return (named.length ? named : bots).slice(0, MAX_GROUP_REPLIES);
}

export type Person = { id: string; username: string | null; displayName: string | null };
/** A name that tells members apart even when two people share a display name. */
export function personLabel(members: Person[], id: string | null) {
  const p = members.find((x) => x.id === id);
  if (!p) return "Member";
  const handle = p.username ? `@${p.username}` : "";
  return p.displayName ? (handle ? `${p.displayName} (${handle})` : p.displayName) : handle || "Member";
}

