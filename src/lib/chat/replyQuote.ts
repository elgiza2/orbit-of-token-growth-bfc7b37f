/** @doc Reply quotes inside chat text: a leading "> quoted" line followed by the answer. */
export const REPLY_QUOTE_MAX = 140;

export function quoteFor(text: string): string {
  const flat = text.replace(/^>\s?.*\n+/, "").replace(/\s+/g, " ").trim();
  return flat.length > REPLY_QUOTE_MAX ? `${flat.slice(0, REPLY_QUOTE_MAX - 1)}…` : flat;
}

export function withReply(quote: string | null | undefined, body: string): string {
  const q = quote ? quoteFor(quote) : "";
  return q ? `> ${q}\n\n${body}` : body;
}

export function splitReply(content: string): { quote: string | null; body: string } {
  const match = /^>\s?(.+)\n\n([\s\S]*)$/.exec(content);
  return match ? { quote: match[1], body: match[2] } : { quote: null, body: content };
}
