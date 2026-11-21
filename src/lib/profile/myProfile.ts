/** @doc The signed-in person's profile (name, username, photo): cached per account for instant display, refreshed from the database, and shared by every screen. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { USERNAME_RE, normalizeUsername } from "@/lib/people/peopleApi";
import { getAuthState } from "@/lib/authStore";

export type MyProfile = { id: string; email: string; displayName: string; username: string | null; avatarUrl: string };
const KEY = "ceyo_my_profile_v1";
const EVENT = "ceyo-profile-changed";
const db = supabase as any;

function readCache(): MyProfile | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && typeof v.id === "string" && v.id === getAuthState().userId ? v : null; } catch { return null; }
}
function writeCache(p: MyProfile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* cache is optional */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: p }));
}

let inflight: Promise<MyProfile | null> | null = null;
export function loadMyProfile(): Promise<MyProfile | null> {
  inflight ??= (async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const meta = (user.user_metadata || {}) as Record<string, string>;
    const { data: row } = await db.from("profiles").select("display_name,username,avatar_url").eq("id", user.id).maybeSingle();
    const p: MyProfile = {
      id: user.id, email: user.email || "",
      displayName: row?.display_name || meta.full_name || meta.name || "",
      username: row?.username ?? null,
      avatarUrl: row?.avatar_url || meta.avatar_url || meta.picture || "",
    };
    writeCache(p);
    return p;
  })().finally(() => { inflight = null; });
  return inflight;
}

export async function updateMyProfile(patch: { avatarUrl?: string; username?: string; displayName?: string }): Promise<MyProfile> {
  const current = (await loadMyProfile()) || null;
  if (!current) throw new Error("Sign in required");
  const row: Record<string, string> = {};
  if (patch.avatarUrl !== undefined) { if (patch.avatarUrl.length > 400_000) throw new Error("This photo is too large"); row.avatar_url = patch.avatarUrl; }
  if (patch.displayName !== undefined) { const n = patch.displayName.trim(); if (n.length < 2 || n.length > 40) throw new Error("Name must be 2–40 characters"); row.display_name = n; }
  if (patch.username !== undefined) { const u = normalizeUsername(patch.username); if (!USERNAME_RE.test(u)) throw new Error("Username: 3–20 lowercase letters, numbers or _"); row.username = u; }
  const r = await db.from("profiles").update(row).eq("id", current.id);
  if (r.error) throw new Error(/duplicate|unique/i.test(r.error.message) ? "This username is taken" : r.error.message);
  const next: MyProfile = { ...current, ...(row.avatar_url !== undefined ? { avatarUrl: row.avatar_url } : {}), ...(row.display_name ? { displayName: row.display_name } : {}), ...(row.username ? { username: row.username } : {}) };
  writeCache(next);
  return next;
}

/** True when nobody else uses this username (case-insensitive). */
export async function usernameAvailable(value: string): Promise<boolean> {
  const u = normalizeUsername(value);
  if (!USERNAME_RE.test(u)) return false;
  const { data } = await db.rpc("search_people", { p_query: u });
  return !(data || []).some((r: { username: string }) => r.username === u);
}

export function useMyProfile(): MyProfile | null {
  const [p, setP] = useState<MyProfile | null>(null);
  useEffect(() => {
    setP(readCache());
    const on = (e: Event) => setP((e as CustomEvent<MyProfile>).detail);
    window.addEventListener(EVENT, on);
    void loadMyProfile().then((v) => v && setP(v)).catch(() => {});
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return p;
}

export function clearMyProfileCache() { try { localStorage.removeItem(KEY); } catch { /* optional */ } }
