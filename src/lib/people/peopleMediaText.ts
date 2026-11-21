/** Browser- and server-safe message format for people-chat attachments. */
export type PeopleAttachment = { path: string; name: string; type: string };

const MARK_RE = /\[\[file:([^|\]\n]+)\|([^|\]\n]*)\|([^|\]\n]*)\]\]\n?/g;
const clean = (v: string) => v.replace(/[|\][\n]/g, " ").trim();

/** Message text for a set of attachments followed by an optional caption. */
export function withAttachments(files: PeopleAttachment[], caption: string): string {
  return [...files.map((f) => `[[file:${f.path}|${clean(f.name).slice(0, 120)}|${clean(f.type).slice(0, 80)}]]`), caption].filter(Boolean).join("\n");
}

/** Splits a message into its attachments and the remaining text. */
export function parseAttachments(content: string): { files: PeopleAttachment[]; text: string } {
  const files: PeopleAttachment[] = [];
  const text = content.replace(MARK_RE, (_m, path: string, name: string, type: string) => { files.push({ path, name, type }); return ""; }).trim();
  return { files, text };
}

/** Plain text a bot or a chat list can read: attachments become short labels. */
export function describeAttachments(content: string): string {
  const { files, text } = parseAttachments(content);
  const labels = files.map((f) => (f.type.startsWith("image/") ? `[photo: ${f.name}]` : f.type.startsWith("video/") ? `[video: ${f.name}]` : `[file: ${f.name}]`));
  return [...labels, text].filter(Boolean).join(" ");
}

