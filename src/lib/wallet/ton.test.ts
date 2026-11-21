import { describe, expect, it, vi } from "vitest";
import { fromUnits, parseTonapiJettons, parseToncenterJettons, tonBalance, tonJettons } from "./ton";

const NOT = "0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc";
const USDT = "0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE";

describe("TON wallet balances", () => {
  it("converts nanoton to TON", () => expect(fromUnits("2500000000", 9)).toBe(2.5));
  it("reads NOT with 9 decimals and USDT on TON with 6 decimals", () => {
    expect(parseTonapiJettons({ balances: [
      { balance: "1500000000000", jetton: { address: NOT, decimals: 9 } },
      { balance: "12340000", jetton: { address: USDT.toLowerCase(), decimals: 6 } },
      { balance: "999", jetton: { address: "0:abc", decimals: 9 } },
    ] })).toEqual({ notcoin: 1500, "tether-ton": 12.34 });
  });
  it("reads the same jettons from the backup provider (uppercase addresses)", () => {
    expect(parseToncenterJettons({ jetton_wallets: [{ balance: "1000000000", jetton: NOT.toUpperCase() }] })).toEqual({ notcoin: 1, "tether-ton": 0 });
  });
  it("falls back to toncenter when TonAPI fails", async () => {
    const fetcher = vi.fn(async (url: string) => url.includes("tonapi") ? new Response("", { status: 429 }) : new Response(JSON.stringify({ balance: "3000000000" })));
    expect(await tonBalance("UQabc", fetcher)).toBe(3);
  });
  it("fails instead of reporting zero when every provider fails", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 500 }));
    await expect(tonJettons("UQabc", fetcher)).rejects.toThrow();
  });
});
