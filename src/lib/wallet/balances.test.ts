import { afterEach, describe, expect, it, vi } from "vitest";
import { walletBalances } from "./wallet.server";
const addr = { evm: "0x123", bitcoin: "btc", solana: "sol", ton: "ton", tron: "tron" };
describe("wallet balance accuracy", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rejects when every network read fails rather than reporting zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    await expect(walletBalances(addr)).rejects.toThrow("Offline");
  });
  it("leaves out a network whose RPC errors instead of reporting it as zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("trongrid") ? { data: [{ balance: 2_000_000 }] } : { error: { code: -1 } }), { status: 200 })));
    const b = await walletBalances(addr);
    expect(b.tron).toBe(2);
    expect("ethereum" in b).toBe(false);
    expect("bitcoin" in b).toBe(false);
  });
});
