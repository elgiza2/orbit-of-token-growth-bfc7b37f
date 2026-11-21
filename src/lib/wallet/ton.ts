/** TON network holdings: native TON plus listed jettons (NOT, USDT on TON), read from TonAPI with toncenter as backup. */

/** Jetton master addresses (raw form) → wallet token id from walletTokens.ts. */
export const TON_JETTONS: Record<string, { id: string; decimals: number }> = {
  "0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc": { id: "notcoin", decimals: 9 },
  "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe": { id: "tether-ton", decimals: 6 },
};

/** Smallest units ("nano") → whole coins, without losing precision on large integers. */
export function fromUnits(value: unknown, decimals: number): number {
  const text = typeof value === "number" ? String(Math.trunc(value)) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) return NaN;
  const whole = BigInt(text);
  const base = 10n ** BigInt(decimals);
  return Number(whole / base) + Number(whole % base) / Number(base);
}

const raw = (address: unknown) => typeof address === "string" ? address.toLowerCase() : "";

/** TonAPI /v2/accounts/{a}/jettons → balances of listed jettons. Listed jettons missing from the answer are 0. */
export function parseTonapiJettons(body: unknown): Record<string, number> {
  const list = (body as { balances?: unknown })?.balances;
  if (!Array.isArray(list)) throw new Error("Jettons unavailable");
  const out: Record<string, number> = Object.fromEntries(Object.values(TON_JETTONS).map((j) => [j.id, 0]));
  for (const item of list as { balance?: unknown; jetton?: { address?: unknown; decimals?: unknown } }[]) {
    const known = TON_JETTONS[raw(item.jetton?.address)];
    if (!known) continue;
    const decimals = Number(item.jetton?.decimals ?? known.decimals);
    const amount = fromUnits(item.balance, Number.isInteger(decimals) ? decimals : known.decimals);
    if (Number.isFinite(amount)) out[known.id] = (out[known.id] ?? 0) + amount;
  }
  return out;
}

/** toncenter v3 /jetton/wallets?owner_address= → balances of listed jettons. */
export function parseToncenterJettons(body: unknown): Record<string, number> {
  const list = (body as { jetton_wallets?: unknown })?.jetton_wallets;
  if (!Array.isArray(list)) throw new Error("Jettons unavailable");
  const out: Record<string, number> = Object.fromEntries(Object.values(TON_JETTONS).map((j) => [j.id, 0]));
  for (const item of list as { balance?: unknown; jetton?: unknown }[]) {
    const known = TON_JETTONS[raw(item.jetton)];
    if (!known) continue;
    const amount = fromUnits(item.balance, known.decimals);
    if (Number.isFinite(amount)) out[known.id] = (out[known.id] ?? 0) + amount;
  }
  return out;
}

type Fetcher = (url: string) => Promise<Response>;
const json = async (fetcher: Fetcher, url: string) => { const r = await fetcher(url); if (!r.ok) throw new Error(`TON provider ${r.status}`); return r.json(); };
const firstOk = async <T,>(tries: Array<() => Promise<T>>): Promise<T> => {
  let last: unknown;
  for (const t of tries) { try { return await t(); } catch (e) { last = e; } }
  throw last instanceof Error ? last : new Error("TON balance unavailable");
};

/** Native TON balance; TonAPI first because keyless toncenter is often rate-limited. */
export function tonBalance(address: string, fetcher: Fetcher): Promise<number> {
  const a = encodeURIComponent(address);
  return firstOk([
    async () => { const n = fromUnits((await json(fetcher, `https://tonapi.io/v2/accounts/${a}`))?.balance, 9); if (!Number.isFinite(n)) throw new Error("bad"); return n; },
    async () => { const j = await json(fetcher, `https://toncenter.com/api/v3/walletInformation?address=${a}&use_v2=false`); const n = fromUnits(j?.balance, 9); if (!Number.isFinite(n)) throw new Error("bad"); return n; },
    async () => { const j = await json(fetcher, `https://toncenter.com/api/v2/getAddressBalance?address=${a}`); if (j?.ok === false) throw new Error("bad"); const n = fromUnits(j?.result, 9); if (!Number.isFinite(n)) throw new Error("bad"); return n; },
  ]);
}

export function tonJettons(address: string, fetcher: Fetcher): Promise<Record<string, number>> {
  const a = encodeURIComponent(address);
  return firstOk([
    async () => parseTonapiJettons(await json(fetcher, `https://tonapi.io/v2/accounts/${a}/jettons`)),
    async () => parseToncenterJettons(await json(fetcher, `https://toncenter.com/api/v3/jetton/wallets?owner_address=${a}&limit=50`)),
  ]);
}
