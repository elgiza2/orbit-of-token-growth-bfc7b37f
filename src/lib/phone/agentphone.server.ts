import { z } from "zod";
import { PHONE_RING_TIMEOUT_SECONDS, type Turn } from "./phoneRules";

const callId = z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/);
const callDetails = z.object({
  id: callId, toNumber: z.string(), direction: z.literal("outbound"), status: z.string(),
  endedAt: z.string().nullish(), durationSeconds: z.number().int().nonnegative().nullish(),
  transcripts: z.array(z.object({ transcript: z.string().nullish(), response: z.string().nullish() })).default([]),
});

export function agentPhone(key: string, request = fetch) {
  async function api(path: string, body?: object) {
    const res = await request(`https://api.agentphone.ai/v1/calls${path}`, {
      method: body ? "POST" : "GET", redirect: "manual", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error("Phone provider could not confirm the request");
    return res.json() as Promise<unknown>;
  }
  return {
    async dial(input: { agentId: string; toNumber: string; initialGreeting: string; systemPrompt: string }) {
      return z.object({ id: callId, fromNumber: z.string().nullish() }).parse(await api("", {
        ...input, disableRecording: true, ringTimeoutSeconds: PHONE_RING_TIMEOUT_SECONDS,
      }));
    },
    async read(id: string, destination: string) {
      const call = callDetails.parse(await api(`/${callId.parse(id)}`));
      if (call.id !== id || call.toNumber !== destination) throw new Error("Phone provider returned an unexpected call");
      const status = call.status.toLowerCase();
      const turns: Turn[] = [];
      for (const row of call.transcripts) {
        if (row.transcript?.trim()) turns.push({ role: "user", text: row.transcript.trim() });
        if (row.response?.trim()) turns.push({ role: "assistant", text: row.response.trim() });
      }
      return { ...call, status, turns };
    },
  };
}