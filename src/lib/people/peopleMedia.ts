/** Photos and files in people chats: stored privately per chat, referenced from the message text. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const PEOPLE_MEDIA_BUCKET = "people-media";
export const PEOPLE_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
import type { PeopleAttachment } from "./peopleMediaText";
export { withAttachments, parseAttachments, describeAttachments, type PeopleAttachment } from "./peopleMediaText";

/** Uploads one file into the chat's private folder; only chat members can read it back. */
export async function uploadPeopleFile(threadId: string, file: File): Promise<PeopleAttachment> {
  if (file.size > PEOPLE_MEDIA_MAX_BYTES) throw new Error(`${file.name} is larger than 25 MB`);
  const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(file.name)?.[1] || "bin").toLowerCase();
  const path = `${threadId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(PEOPLE_MEDIA_BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(/row-level security|policy|403/i.test(error.message) ? "You can't send files in this chat" : "Could not upload the file");
  return { path, name: file.name || "file", type: file.type || "application/octet-stream" };
}

const urls = new Map<string, { url: string; until: number }>();

/** Short-lived private link for an attachment, cached while still valid. */
export function useAttachmentUrl(path: string): string | null {
  const [url, setUrl] = useState<string | null>(() => { const hit = urls.get(path); return hit && hit.until > Date.now() ? hit.url : null; });
  useEffect(() => {
    let alive = true;
    const hit = urls.get(path);
    if (hit && hit.until > Date.now()) { setUrl(hit.url); return; }
    void supabase.storage.from(PEOPLE_MEDIA_BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (!alive || !data?.signedUrl) return;
      urls.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60_000 });
      setUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [path]);
  return url;
}
