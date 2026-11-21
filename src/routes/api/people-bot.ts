import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { botsToAnswer, personLabel } from "@/lib/people/mentions";
import { runAgentLoop } from "@/lib/ceyo/agentLoop.server";
import { isUsageExhausted } from "@/lib/ceyo/usage";
import { VISUAL_ANSWER_PROMPT } from "@/components/chat/visualAnswer";
import { previewText } from "@/lib/ceyo/phonePush";

const input = z.object({ threadId: z.string().uuid(), messageId: z.string().uuid() });
const noStore = { "Cache-Control": "no-store" };

/** Lets every bot in a people chat answer a member's message (an @mention narrows it). Replies are written by the server. */
async function handle(request: Request) {
  const { authenticate } = await import("@/lib/ceyo/auth.server");
  const auth = await authenticate(request).catch(() => null);
  if (!auth) return Response.json({ error: "Please sign in" }, { status: 401, headers: noStore });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400, headers: noStore });
  const { threadId, messageId } = parsed.data;

  // Read through the caller's own session so membership is enforced by the database.
  const { data: msg } = await auth.db.from("people_messages").select("id,thread_id,sender_id,content").eq("id", messageId).eq("thread_id", threadId).maybeSingle();
  if (!msg || msg.sender_id !== auth.userId) return Response.json({ error: "Not found" }, { status: 404, headers: noStore });
  const { data: info } = await auth.db.rpc("people_thread_info", { p_thread: threadId });
  const members = (info?.members || []) as { id: string; username: string | null; displayName: string | null }[];
  const sender = personLabel(members, msg.sender_id);
  // WhatsApp-style phone notifications for everyone else in the chat. Pushes never fail the request.
  const { sendPhonePush } = await import("@/lib/ceyo/phonePush.server");
  const notify = (id: string, from: string, text: string, except: string | null) => {
    const preview = previewText(text);
    return preview ? Promise.all(members.filter((m) => m.id !== except).map((m) => sendPhonePush(m.id, { kind: "message", id, botName: from, text: preview, path: "/" }))) : Promise.resolve([]);
  };
  await notify(msg.id, sender, msg.content, auth.userId);

  const bots = botsToAnswer(msg.content, (info?.bots || []) as { id: string; name: string }[]);
  if (!bots.length) return Response.json({ replied: 0 }, { headers: noStore });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: recent } = await auth.db.from("people_messages").select("sender_id,bot_id,content,created_at").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(20);
  const nameOf = (m: { sender_id: string | null; bot_id: string | null }) => m.bot_id
    ? ((info?.bots || []) as { id: string; name: string }[]).find((b) => b.id === m.bot_id)?.name || "Bot"
    : personLabel(members, m.sender_id);
  const lines = (recent || []).reverse().map((m) => `${nameOf(m)}: ${m.content}`);
  const people = members.map((p) => `- ${personLabel(members, p.id)}`).join("\n");

  // Every bot answers the same message on its own and at the same time, so replies are independent and not copies of each other.
  let blocked: Response | null = null;
  const results = await Promise.all(bots.map(async (bot) => {
    const { data: full } = await supabaseAdmin.from("bots").select("id,name,instructions,owner_id").eq("id", bot.id).maybeSingle();
    if (!full) return 0;
    // Same loop as one-to-one chats: web tools plus the bot's own cloud computer.
    const system = `You are ${full.name}, one of several bots taking part in a group chat with real people.\n${full.instructions || ""}\nSeveral different people write in this chat; every chat line starts with the name of whoever wrote it. Keep track of who said what, answer the person who wrote the latest message, and address people by their own names — never mix one person's words or requests up with another's.\nPeople in this chat:\n${people}\nReply briefly from your own role and expertise, in your own voice and with your own view; other bots answer the same message separately, so do not copy what earlier bots wrote above — give the part only you would add. Do not prefix your reply with your name. Use your tools (web search, reading pages, run_code on your cloud computer) when the message needs fresh facts, calculations or files; claim you ran something only after a successful tool result.`;
    const visualSystem = `${system}\n${VISUAL_ANSWER_PROMPT}`;
    let text = "";
    try {
      text = (await runAgentLoop(visualSystem, [
        { role: "user", content: `Recent chat (context only):\n${lines.join("\n")}` },
        { role: "user", content: `${sender} (latest message, reply to this person): ${msg.content}` },
      ], () => {}, request.signal, async () => [], { usageOwner: auth.userId, botId: full.owner_id === auth.userId ? full.id : null, maxSteps: 8 })).trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (isUsageExhausted(message) || message.startsWith("Could not check usage")) blocked ??= Response.json({ error: message }, { status: 402, headers: noStore });
      else if (message === "AI is not configured") blocked ??= Response.json({ error: "The reply model is not configured" }, { status: 503, headers: noStore });
      return 0;
    }
    if (!text) return 0;
    const { data: saved, error } = await supabaseAdmin.from("people_messages").insert({ thread_id: threadId, bot_id: full.id, sender_id: null, content: text.slice(0, 8000) }).select("id").single();
    if (error || !saved) return 0;
    await notify(saved.id, full.name, text, null);
    return 1;
  }));
  const replied = results.reduce((a: number, b: number) => a + b, 0);
  if (!replied && blocked) return blocked;
  return Response.json({ replied }, { headers: noStore });
}

export const Route = createFileRoute("/api/people-bot")({ server: { handlers: { POST: ({ request }) => handle(request) } } });
