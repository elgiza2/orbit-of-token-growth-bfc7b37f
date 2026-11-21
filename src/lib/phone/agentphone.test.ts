import { describe, expect, it, vi } from "vitest";
import { agentPhone } from "./agentphone.server";

const toNumber = "+12025550101";

describe("AgentPhone outbound calls", () => {
  it("only sends one outbound request with recording off and the existing 40-second ring timeout", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    await expect(agentPhone("fixture", request).dial({ agentId: "agt_fixture", toNumber, initialGreeting: "Hello", systemPrompt: "Fixture" })).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({ toNumber, disableRecording: true, ringTimeoutSeconds: 40 });
  });

  it("only accepts the reserved destination and reads ordered turns from the outbound call", async () => {
    const call = { id: "call_fixture", toNumber, direction: "outbound", status: "completed", transcripts: [{ transcript: "Hello", response: "Hi" }] };
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(call));
    await expect(agentPhone("fixture", request).read(call.id, toNumber)).resolves.toMatchObject({ status: "completed", turns: [{ role: "user", text: "Hello" }, { role: "assistant", text: "Hi" }] });
    await expect(agentPhone("fixture", request).read(call.id, "+12025550102")).rejects.toThrow("unexpected call");
  });
});