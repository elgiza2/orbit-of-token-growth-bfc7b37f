import { userErrorText } from "@/lib/errors";
/** Person-to-person messaging inside the hub: username setup, chat list, new chat/group forms and the chat view. */
import { Button } from "@/components/ui/button";
import { GroupDetails, PendingGroupInvitation } from "./GroupDetails";
import { canChangeMessage, firstUnreadMessage, mergeMessages } from "@/lib/people/messageState";
import { readThread, writeThread } from "@/lib/people/threadCache";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronLeft, LogOut, UserPlus, Bot, X, AtSign, Check, MoreHorizontal, Trash2, Ban, Reply, Link2, Plus, Paperclip, FileText, Copy, CheckCheck, Pencil, Info } from "lucide-react";
import { describeAttachments, parseAttachments, uploadPeopleFile, useAttachmentUrl, withAttachments, type PeopleAttachment } from "@/lib/people/peopleMedia";
import { useSwipeReply } from "@/hooks/useSwipeReply";
import { quoteFor, splitReply, withReply } from "@/lib/chat/replyQuote";
import { askConfirm } from "@/components/common/CeyoConfirm";
import { FormattedAnswer } from "@/components/chat/FormattedAnswer";
import { supabase } from "@/integrations/supabase/client";
import type { AgentInfo } from "@/lib/agentsky/client";
import { peopleApi, personLabel, myUserId, USERNAME_RE, normalizeUsername, type PersonInfo, type PeopleMessage, type ThreadSummary, type ThreadBot, type PeopleReaction, type PeopleThread } from "@/lib/people/peopleApi";
import { BotAvatar, GroupRowAvatar, type HubLang } from "../HubParts";
import "@/styles/ceyo.css";
import "@/styles/people.css";

function PersonAvatar({ person, size = 36 }: { person?: PersonInfo | null; size?: number }) {
  const label = personLabel(person);
  return <span className="pp-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden>
    {person?.avatarUrl ? <img src={person.avatarUrl} alt="" /> : (label.replace("@", "")[0] || "?").toUpperCase()}
  </span>;
}

function botAgent(b: ThreadBot): Pick<AgentInfo, "name" | "color" | "isDefault"> & { id: string } {
  const colors = ["aurora", "ocean", "ember", "mint", "sun", "rose", "mono"];
  return { id: b.id, name: b.name, color: (colors.includes(b.look?.color) ? b.look?.color : "aurora") as AgentInfo["color"], isDefault: false };
}

/** Asks once for a username; renders children when one is set. */
export function UsernameGate({ lang, children }: { lang: HubLang; children: React.ReactNode }) {
  const ar = false;
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void peopleApi.myUsername().then(setUsername).catch(() => setUsername(null)); }, []);
  if (username === undefined) return null;
  if (username) return <>{children}</>;
  const save = async () => {
    setBusy(true); setError("");
    try { setUsername(await peopleApi.setUsername(value)); } catch (e) { setError(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  };
  return <section className="pp-panel">
    <h2>{ar ? "اختار اسم مستخدم" : "Choose your username"}</h2>
    <p className="pp-muted">{ar ? "صحابك وتيمك هيلاقوك بيه ويكلموك." : "Friends and teammates find and message you with it."}</p>
    <label className="pp-field"><AtSign size={16} /><input value={value} onChange={(e) => setValue(normalizeUsername(e.target.value))} placeholder="username" autoCapitalize="none" autoCorrect="off" maxLength={20} onKeyDown={(e) => { if (e.key === "Enter" && USERNAME_RE.test(value)) void save(); }} /></label>
    <small className="pp-muted">{ar ? "من 3 لـ 20 حرف إنجليزي صغير أو أرقام أو _" : "3–20 lowercase letters, numbers or _"}</small>
    {error && <p className="pp-error" role="alert">{userErrorText(error)}</p>}
    <button type="button" className="pp-primary" disabled={busy || !USERNAME_RE.test(value)} onClick={() => void save()}>{ar ? "حفظ" : "Save"}</button>
  </section>;
}

/** People chats in the home list. */
export function PeopleSection({ lang, agents, active, onOpen }: { lang: HubLang; agents: AgentInfo[]; active: string | null; onOpen: (id: string) => void }) {
  const ar = false;
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [groupBots, setGroupBots] = useState<Record<string, ThreadBot[]>>({});
  const [me, setMe] = useState("");
  useEffect(() => {
    let alive = true; let channel: ReturnType<typeof supabase.channel> | null = null;
    const load = () => peopleApi.threads().then(async (t) => {
      if (!alive) return;
      setThreads(t);
      const entries = await Promise.all(t.filter((thread) => thread.kind === "group").map(async (thread) => {
        const info = await peopleApi.info(thread.id).catch(() => null);
        return [thread.id, info?.bots || []] as const;
      }));
      if (alive) setGroupBots(Object.fromEntries(entries));
    }).catch(() => {});
    void myUserId().then((id) => {
      if (!alive) return; setMe(id); void load();
      channel = supabase.channel(`people-list-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "people_messages" }, () => void load())
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "people_thread_members", filter: `user_id=eq.${id}` }, () => void load())
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "people_threads" }, () => void load()).subscribe();
    }).catch(() => {});
    const onChange = () => void load();
    window.addEventListener("ceyo-people-changed", onChange);
    return () => { alive = false; window.removeEventListener("ceyo-people-changed", onChange); if (channel) void supabase.removeChannel(channel); };
  }, []);
  return <><PendingGroupInvitation onJoined={onOpen} />{threads.length > 0 && <section className="hub-category pp-section">
    <div className="hub-category-title"><span>{ar ? "الناس" : "People"}</span></div>
    <div className="hub-category-rows">
      {threads.map((t) => {
        const other = t.kind === "direct" ? t.members.find((m) => m.id !== me) : null;
        const title = t.kind === "group" ? t.name || (ar ? "جروب" : "Group") : personLabel(other);
        const draft = readDraft(t.id);
        const unread = t.unreadCount > 0;
        return <div className="hub-list-row" key={t.id}>
          <button type="button" className="hub-list-row-main" data-unread={unread} data-active={active === t.id} onClick={() => onOpen(t.id)}>
            {t.kind === "group" ? <GroupRowAvatar label={title} portraits={groupBots[t.id]?.length
              ? groupBots[t.id].map((bot) => <BotAvatar key={bot.id} agent={agents.find((agent) => agent.id === bot.id) || botAgent(bot)} size={22} />)
              : t.members.map((person) => <PersonAvatar key={person.id} person={person} size={22} />)} /> : <PersonAvatar person={other} />}
            <span className="hub-row-copy"><span className="hub-row-title"><strong>{title}</strong></span><span className="hub-row-preview">{draft ? <><span className="pp-draft">Draft:</span> {draft}</> : (t.last?.content ? describeAttachments(splitReply(t.last.content).body) : "") || (t.kind === "group" ? [...(groupBots[t.id] || []).map((bot) => bot.name), ...t.members.map(personLabel)].join(" · ") : ar ? "ابدأ الكلام" : "Say hi")}</span></span>
            {unread && <span className="pp-unread-badge" aria-label={`${t.unreadCount} unread messages`}>{t.unreadCount > 999 ? "999+" : t.unreadCount}</span>}
          </button>
        </div>;
      })}
    </div>
  </section>}</>;
}

function PeoplePicker({ lang, picked, onPick }: { lang: HubLang; picked: PersonInfo[]; onPick: (p: PersonInfo) => void }) {
  const ar = false;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonInfo[]>([]);
  useEffect(() => {
    const term = normalizeUsername(q);
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(() => void peopleApi.search(term).then(setResults).catch(() => setResults([])), 220);
    return () => clearTimeout(t);
  }, [q]);
  return <div className="pp-picker">
    <label className="pp-field"><AtSign size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? "دوّر باسم المستخدم" : "Search by username"} autoCapitalize="none" autoCorrect="off" /></label>
    {results.length > 0 && <div className="pp-results">{results.map((p) => {
      const on = picked.some((x) => x.id === p.id);
      return <button type="button" key={p.id} className="pp-result" data-on={on} onClick={() => { onPick(p); setQ(""); }}><PersonAvatar person={p} size={32} /><span><strong>{p.displayName || p.username}</strong><small>@{p.username}</small></span>{on && <Check size={16} />}</button>;
    })}</div>}
    {normalizeUsername(q).length >= 2 && !results.length && <p className="pp-muted">{ar ? "مفيش حد بالاسم ده" : "No one with that username"}</p>}
  </div>;
}

export function NewPeopleChat({ lang, mode, agents, onCancel, onOpened }: { lang: HubLang; mode: "dm" | "group"; agents: AgentInfo[]; onCancel: () => void; onOpened: (id: string) => void }) {
  const ar = false;
  const [picked, setPicked] = useState<PersonInfo[]>([]);
  const [bots, setBots] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const toggle = (p: PersonInfo) => setPicked((cur) => cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : mode === "dm" ? [p] : [...cur, p]);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const id = mode === "dm" ? await peopleApi.openDirect(picked[0].username || "") : await peopleApi.createGroup(name, picked.map((p) => p.username || ""), bots);
      window.dispatchEvent(new Event("ceyo-people-changed"));
      onOpened(id);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };
  const ready = mode === "dm" ? picked.length === 1 : name.trim().length > 0 && picked.length + bots.length > 0;
  const isGroup = mode === "group";
  const naming = isGroup && stage === 1;
  const back = () => naming ? setStage(0) : onCancel();
  return <section className="pp-panel pp-new">
    <header className="pp-panel-head"><button type="button" className="pp-icon" aria-label="Back" onClick={back}><ChevronLeft size={20} /></button>
      <h2>{!isGroup ? "New message" : naming ? "New group" : "Add members"}{isGroup && !naming && <small className="pp-new-count">{picked.length + bots.length} selected</small>}</h2></header>
    <UsernameGate lang={lang}>
      {(picked.length > 0 || bots.length > 0) && <div className="pp-new-chosen">
        {picked.map((p) => <button type="button" key={p.id} onClick={() => !naming && toggle(p)}><span className="pp-new-av"><PersonAvatar person={p} size={46} />{!naming && <i><X size={11} /></i>}</span><small>{p.displayName || p.username}</small></button>)}
        {bots.map((id) => { const a = agents.find((x) => x.id === id); return a ? <button type="button" key={id} onClick={() => !naming && setBots((c) => c.filter((x) => x !== id))}><span className="pp-new-av"><BotAvatar agent={a} size={46} />{!naming && <i><X size={11} /></i>}</span><small>{a.name}</small></button> : null; })}
      </div>}
      {naming ? <>
        <label className="pp-field pp-new-name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" maxLength={80} /><small>{80 - name.length}</small></label>
        <p className="pp-muted">Members: {picked.length + bots.length}</p>
      </> : <>
        <PeoplePicker lang={lang} picked={picked} onPick={toggle} />
        {isGroup && agents.length > 0 && <>
          <h3 className="pp-sub">Bots</h3>
          <div className="pp-results">{agents.map((a) => {
            const on = bots.includes(a.id);
            return <button type="button" key={a.id} className="pp-result" data-on={on} onClick={() => setBots((cur) => on ? cur.filter((x) => x !== a.id) : [...cur, a.id])}><BotAvatar agent={a} size={32} /><span><strong>{a.name}</strong><small>{a.description}</small></span><span className="pp-check" data-on={on}>{on && <Check size={14} />}</span></button>;
          })}</div>
        </>}
      </>}
      {error && <p className="pp-error" role="alert">{userErrorText(error)}</p>}
      {isGroup && !naming
        ? <button type="button" className="pp-fab" aria-label="Next" disabled={picked.length + bots.length === 0} onClick={() => setStage(1)}><ArrowUp size={22} style={{ transform: "rotate(90deg)" }} /></button>
        : isGroup
          ? <button type="button" className="pp-fab" aria-label="Create group" disabled={!ready || busy} onClick={() => void submit()}><Check size={24} /></button>
          : <button type="button" className="pp-primary" disabled={!ready || busy} onClick={() => void submit()}>Start chat</button>}
    </UsernameGate>
  </section>;
}

const DRAFT_KEY = (id: string) => `megsy_people_draft_${id}`;
function readDraft(id: string) { try { return localStorage.getItem(DRAFT_KEY(id)) || ""; } catch { return ""; } }
function writeDraft(id: string, v: string) { try { if (v.trim()) localStorage.setItem(DRAFT_KEY(id), v); else localStorage.removeItem(DRAFT_KEY(id)); } catch { /* storage blocked */ } }
const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

function fmtTime(at?: string) {
  if (!at) return "";
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function PeopleChat({ lang, threadId, agents, onBack }: { lang: HubLang; threadId: string; agents: AgentInfo[]; onBack: () => void }) {
  const ar = false;
  const [me, setMe] = useState("");
  const [thread, setThread] = useState<PeopleThread | null>(null);
  const [info, setInfo] = useState<{ members: PersonInfo[]; bots: ThreadBot[] }>({ members: [], bots: [] });
  const [messages, setMessages] = useState<PeopleMessage[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"" | "people" | "bots">("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupDetails, setGroupDetails] = useState(false);
  const [editing, setEditing] = useState<PeopleMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [firstUnread, setFirstUnread] = useState<string | null>(null);
  const initialPositioned = useRef(false);
  const followBottom = useRef(true);
  const markedThrough = useRef("");
  const [botsBusy, setBotsBusy] = useState(0);
  const [replyTo, setReplyTo] = useState<PeopleMessage | null>(null);
  const [profile, setProfile] = useState<PersonInfo | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [readState, setReadState] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<PeopleReaction[]>([]);
  const [actionFor, setActionFor] = useState<PeopleMessage | null>(null);
  const swipe = useSwipeReply<PeopleMessage>((m) => { setReplyTo(m); textarea.current?.focus(); });
  const scroller = useRef<HTMLDivElement>(null);
  const latestRef = useRef("");
  useEffect(() => { const last = messages[messages.length - 1]?.created_at; if (last) { latestRef.current = last; writeThread(threadId, messages); } }, [messages, threadId]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const markVisibleRead = () => {
    const el = scroller.current;
    const until = latestRef.current;
    if (!el || !until || !initialPositioned.current || document.hidden || !document.hasFocus() || el.scrollHeight - el.scrollTop - el.clientHeight > 48 || markedThrough.current === until) return;
    markedThrough.current = until;
    void peopleApi.markRead(threadId, until).catch(() => { markedThrough.current = ""; });
  };
  const reloadInfo = () => peopleApi.info(threadId).then((i) => i && setInfo({ members: i.members || [], bots: i.bots || [] })).catch(() => {});
  useEffect(() => {
    let alive = true;
    void myUserId().then((id) => alive && setMe(id)).catch(() => {});
    void peopleApi.thread(threadId).then((t) => alive && setThread(t)).catch(() => {});
    void reloadInfo();
    latestRef.current = ""; initialPositioned.current = false; markedThrough.current = ""; setFirstUnread(null);
    const cached = readThread<PeopleMessage>(threadId);
    if (cached.length) setMessages(cached);
    void Promise.all([myUserId(), peopleApi.myReadMarker(threadId)]).then(async ([userId, marker]) => {
      const m = await peopleApi.messages(threadId, marker.last_read_at);
      if (!alive) return;
      const unread = firstUnreadMessage(m, userId, marker);
      setFirstUnread(unread); followBottom.current = !unread;
      setMessages(m); writeThread(threadId, m); latestRef.current = m[m.length - 1]?.created_at || "";
    }).catch((e) => alive && setError(userErrorText(e)));
    setText(readDraft(threadId));
    const loadMeta = () => { void peopleApi.readState(threadId).then((r) => alive && setReadState(r)); void peopleApi.reactions(threadId).then((r) => alive && setReactions(r)); };
    loadMeta();
    const merge = (incoming: PeopleMessage[]) => {
      if (!alive || !incoming.length) return;
      setMessages((cur) => mergeMessages(cur, incoming));
    };
    const catchUp = () => { if (!document.hidden && latestRef.current) void Promise.all([peopleApi.messages(threadId), peopleApi.since(threadId, latestRef.current)]).then(([recent, fresh]) => merge([...recent, ...fresh])).catch(() => {}); };
    let live = false;
    const channel = supabase.channel(`people-thread-${threadId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "people_messages", filter: `thread_id=eq.${threadId}` }, (p: any) => merge([p.new as PeopleMessage]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "people_messages", filter: `thread_id=eq.${threadId}` }, (p: any) => merge([p.new as PeopleMessage]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "people_threads", filter: `id=eq.${threadId}` }, () => { void peopleApi.thread(threadId).then((t) => alive && setThread(t)); })
      .on("postgres_changes", { event: "*", schema: "public", table: "people_thread_members", filter: `thread_id=eq.${threadId}` }, (p: any) => { const row = p.new as { user_id?: string; last_read_at?: string }; if (row?.user_id && row.last_read_at) setReadState((c) => ({ ...c, ...Object.fromEntries([[row.user_id, row.last_read_at]]) })); void reloadInfo(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "people_reactions", filter: `thread_id=eq.${threadId}` }, () => { void peopleApi.reactions(threadId).then((r) => alive && setReactions(r)); })
      .subscribe((status) => { live = status === "SUBSCRIBED"; if (live) catchUp(); });
    // Live updates are the fast path; a light catch-up covers dropped sockets and sleeping tabs.
    const timer = window.setInterval(() => { if (!live) catchUp(); }, 2500);
    const slow = window.setInterval(() => { catchUp(); if (!document.hidden) loadMeta(); }, 15000);
    const onVisible = () => { catchUp(); markVisibleRead(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { alive = false; window.clearInterval(timer); window.clearInterval(slow); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); void supabase.removeChannel(channel); };
  }, [threadId]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !messages.length || !latestRef.current) return;
    if (!initialPositioned.current) {
      initialPositioned.current = true;
      if (firstUnread) el.querySelector("[data-first-unread]")?.scrollIntoView({ block: "start" });
      else el.scrollTop = el.scrollHeight;
    } else if (followBottom.current) el.scrollTop = el.scrollHeight;
    markVisibleRead();
  }, [messages, firstUnread, botsBusy]);
  useEffect(() => { writeDraft(threadId, text); }, [text, threadId]);
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const isGroup = thread?.kind === "group";
  const other = thread?.kind === "direct" ? info.members.find((m) => m.id !== me) : null;
  const title = isGroup ? thread?.name || (ar ? "جروب" : "Group") : personLabel(other);
  const people = useMemo(() => new Map(info.members.map((m) => [m.id, m])), [info.members]);
  useEffect(() => { if (other?.id) void peopleApi.isBlocked(other.id).then(setBlocked).catch(() => {}); }, [other?.id]);
  const deleteForAll = async () => {
    setMenuOpen(false);
    if (!(await askConfirm({ title: "Delete this chat for everyone?", body: isGroup ? "All messages are removed for every member. This can't be undone." : "All messages are removed for you and the other person. This can't be undone.", confirm: "Delete", danger: true }))) return;
    try { await peopleApi.deleteForAll(threadId); window.dispatchEvent(new Event("ceyo-people-changed")); onBack(); } catch (e) { setError(userErrorText(e)); }
  };
  const toggleBlock = async () => {
    setMenuOpen(false);
    if (!other) return;
    if (!blocked && !(await askConfirm({ title: `Block ${personLabel(other)}?`, body: "Neither of you can send messages in this chat until you unblock.", confirm: "Block", danger: true }))) return;
    try { if (blocked) await peopleApi.unblock(other.id); else await peopleApi.block(other.id); setBlocked(!blocked); } catch (e) { setError(userErrorText(e)); }
  };
  // Prefer the owner's real bot record so the avatar matches the one in the normal chat.
  const botAgents = useMemo(() => info.bots.map((b) => agents.find((a) => a.id === b.id) || botAgent(b)), [info.bots, agents]);
  const bots = useMemo(() => new Map(info.bots.map((b, i) => [b.id, { bot: b, agent: botAgents[i] }])), [info.bots, botAgents]);

  const mentionQuery = info.bots.length ? /(?:^|\s)@([^\s@]*)$/.exec(text)?.[1] : undefined;
  const mentionMatches = mentionQuery === undefined ? [] : info.bots.filter((b) => b.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);
  const pickMention = (name: string) => { setText((t) => t.replace(/@([^\s@]*)$/, `@${name} `)); textarea.current?.focus(); };

  const reactionsFor = useMemo(() => {
    const map = new Map<string, PeopleReaction[]>();
    for (const r of reactions) map.set(r.message_id, [...(map.get(r.message_id) || []), r]);
    return map;
  }, [reactions]);
  const react = (m: PeopleMessage, emoji: string) => {
    setActionFor(null);
    const mine = reactions.find((r) => r.message_id === m.id && r.user_id === me);
    const next = mine?.emoji === emoji ? null : emoji;
    setReactions((cur) => [...cur.filter((r) => !(r.message_id === m.id && r.user_id === me)), ...(next ? [{ message_id: m.id, user_id: me, emoji: next }] : [])]);
    void peopleApi.react(threadId, m.id, next).catch(() => { setError("Reactions aren't available yet"); void peopleApi.reactions(threadId).then(setReactions); });
  };
  // Who has read up to each of my messages: the last of my messages each member has seen.
  const seenBy = useMemo(() => {
    const out = new Map<string, PersonInfo[]>();
    for (const [uid, at] of Object.entries(readState)) {
      if (uid === me || !at) continue;
      let last: PeopleMessage | undefined;
      for (const m of messages) if (m.sender_id === me && m.created_at <= at) last = m;
      const person = people.get(uid);
      if (last && person) out.set(last.id, [...(out.get(last.id) || []), person]);
    }
    return out;
  }, [readState, messages, me, people]);
  const lastMine = useMemo(() => [...messages].reverse().find((m) => m.sender_id === me)?.id, [messages, me]);
  const press = useRef<{ t: number; x: number; y: number } | null>(null);
  const rowProps = (m: PeopleMessage) => {
    if (m.deleted_at) return {};
    const sw = swipe(m);
    const clear = () => { if (press.current) window.clearTimeout(press.current.t); press.current = null; };
    return {
      ...sw,
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); setActionFor(m); },
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => { sw.onPointerDown(e); clear(); const x = e.clientX, y = e.clientY; press.current = { x, y, t: window.setTimeout(() => { press.current = null; if ("vibrate" in navigator) navigator.vibrate(12); setActionFor(m); }, 450) }; },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => { sw.onPointerMove(e); if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) clear(); },
      onPointerUp: () => { clear(); sw.onPointerUp(); },
      onPointerCancel: () => { clear(); sw.onPointerCancel(); },
    };
  };
  // Drag the whole conversation sideways to peek at every message's time.
  const column = useRef<HTMLDivElement>(null);
  const peek = useRef<{ x: number; y: number; on: boolean | null } | null>(null);
  const peekProps = {
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType !== "mouse") peek.current = { x: e.clientX, y: e.clientY, on: null }; },
    onPointerMove: (e: React.PointerEvent) => {
      const p = peek.current; const el = column.current; if (!p || !el) return;
      const rtl = getComputedStyle(el).direction === "rtl";
      const dx = (e.clientX - p.x) * (rtl ? 1 : -1); const dy = e.clientY - p.y;
      if (p.on === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) p.on = dx > 0 && dx > Math.abs(dy) * 1.4;
      if (!p.on) return;
      const pull = Math.min(76, Math.max(0, dx));
      el.style.transition = "none"; el.style.transform = `translateX(${rtl ? pull : -pull}px)`;
    },
    onPointerUp: () => { const el = column.current; if (el) { el.style.transition = ""; el.style.transform = ""; } peek.current = null; },
    onPointerCancel: () => { const el = column.current; if (el) { el.style.transition = ""; el.style.transform = ""; } peek.current = null; },
  };

  const send = async (followUp?: string) => {
    const typed = (followUp ?? text).trim();
    if (!followUp) writeDraft(threadId, "");
    const picked = followUp ? [] : pending;
    if ((!typed && !picked.length) || uploading) return;
    const quoted = followUp ? null : replyTo;
    setText(""); setError(""); setReplyTo(null); if (picked.length) setPending([]);
    try {
      let attached: PeopleAttachment[] = [];
      if (picked.length) { setUploading(true); try { attached = await Promise.all(picked.map((f) => uploadPeopleFile(threadId, f))); } finally { setUploading(false); } }
      const content = withAttachments(attached, typed);
      const m = await peopleApi.send(threadId, withReply(quoted ? splitReply(quoted.content).body : null, content));
      setMessages((cur) => cur.some((x) => x.id === m.id) ? cur : [...cur, m]);
      // The server notifies the other members' phones and lets the chat's bots answer.
      const hasBots = info.bots.length > 0;
      if (hasBots) setBotsBusy((n) => n + 1);
      void peopleApi.askBots(threadId, m.id).catch((e) => { if (hasBots) setError(userErrorText(e)); }).finally(() => {
        if (!hasBots) return;
        setBotsBusy((n) => Math.max(0, n - 1));
        // Pull replies in case the live update was missed.
        void peopleApi.messages(threadId).then((list) => setMessages((cur) => { const ids = new Set(list.map((x) => x.id)); return [...list, ...cur.filter((x) => !ids.has(x.id))]; })).catch(() => {});
      });
    } catch (e) { setText(typed); setReplyTo(quoted); if (picked.length) setPending(picked); setError(e instanceof Error ? e.message : "Not sent"); }
  };

  const changeMessage = async (m: PeopleMessage, remove = false) => {
    if (remove && !await askConfirm({ title: "Delete this message for everyone?", body: "Its contents will be removed for all members.", confirm: "Delete", danger: true })) return;
    setSavingEdit(true); setError("");
    try {
      const original = splitReply(m.content);
      const files = parseAttachments(original.body).files;
      const updated = await peopleApi.changeMessage(m.id, remove ? "" : withReply(original.quote, withAttachments(files, editText.trim())), remove);
      setMessages((cur) => mergeMessages(cur, [updated])); setEditing(null); setActionFor(null);
      window.dispatchEvent(new Event("ceyo-people-changed"));
    } catch (e) { setError(userErrorText(e)); } finally { setSavingEdit(false); }
  };

  const shownBots = botAgents.slice(0, 6);
  const extraBots = Math.max(0, botAgents.length - shownBots.length);
  const headAvatars = isGroup
    ? shownBots.length
      ? <span className="cx-stack">{shownBots.map((a) => <BotAvatar key={a.id} agent={a} size={22} />)}{extraBots > 0 && <span className="cx-stack-more">+{extraBots}</span>}</span>
      : <span className="cx-stack">{info.members.slice(0, 4).map((p) => <PersonAvatar key={p.id} person={p} size={24} />)}</span>
    : <PersonAvatar person={other} size={26} />;

  return <section className="cx-chat" aria-label={`${title} conversation`}>
    <header className="cx-head">
      <button type="button" className="cx-circle cx-glass" aria-label={ar ? "رجوع" : "Back"} onClick={onBack}><ChevronLeft size={22} /></button>
      <button type="button" className="cx-title-pill cx-glass" disabled={!other && !isGroup} onClick={() => isGroup ? setGroupDetails(true) : other && setProfile(other)} aria-label={isGroup ? "Open group information" : other ? `Open ${title}'s profile` : undefined}>
        {isGroup && thread?.avatar_url ? <span className="pp-head-photo"><img src={thread.avatar_url} alt="" /></span> : headAvatars}
        <span className="pp-head-copy"><strong dir="auto">{title}</strong>{isGroup && <small dir="auto">{[...info.bots.map((b) => b.name), ...info.members.filter((p) => p.id !== me).map(personLabel), "You"].join(", ")}</small>}</span>
      </button>
      <div className="cx-head-actions">
        <button type="button" className="cx-circle cx-glass cx-head-menu" aria-label="Menu" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}><MoreHorizontal size={20} /></button>
      </div>
      {menuOpen && <div className="cx-scrim" onPointerDown={() => setMenuOpen(false)} />}
      {menuOpen && <div className="cx-pop cx-pop-down" role="menu">
        {isGroup && <Button variant="ghost" onClick={() => { setMenuOpen(false); setGroupDetails(true); }}><Info size={19} />Group information</Button>}
        {isGroup && <button type="button" onClick={() => { setMenuOpen(false); setPanel("people"); }}><UserPlus size={19} />{ar ? "ضيف شخص" : "Add person"}</button>}
        {isGroup && <button type="button" onClick={() => { setMenuOpen(false); setPanel("bots"); }}><Bot size={19} />{ar ? "ضيف بوت" : "Add bot"}</button>}
        {isGroup && <button type="button" onClick={() => { setMenuOpen(false); void peopleApi.leave(threadId).then(() => { window.dispatchEvent(new Event("ceyo-people-changed")); onBack(); }); }}><LogOut size={19} />{ar ? "خروج" : "Leave"}</button>}
        {!isGroup && other && <button type="button" onClick={() => void toggleBlock()}><Ban size={19} />{blocked ? "Unblock" : "Block"}</button>}
        <button type="button" data-danger="true" onClick={() => void deleteForAll()}><Trash2 size={19} />{isGroup ? "Delete for everyone" : "Delete for both"}</button>
      </div>}
    </header>

    {error && <div className="cx-toast" data-tone="error" role="alert"><span><strong>{userErrorText(error)}</strong></span></div>}

    <div className="cx-scroll pp-scroll" ref={scroller} {...peekProps} onScroll={() => { const el = scroller.current; if (el) followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; markVisibleRead(); }}>
      {!messages.length ? (
        <div className="cx-empty"><p className="pp-muted">{info.bots.length ? (ar ? "اكتب رسالتك وكل البوتات هترد" : "Send a message and every bot will reply") : ar ? "ابدأ الكلام" : "Say hi"}</p></div>
      ) : (
        <div className="cx-column" ref={column}>
          {messages.map((m, i) => {
            const mine = m.sender_id === me;
            const hit = m.bot_id ? bots.get(m.bot_id) : undefined;
            const person = m.sender_id ? people.get(m.sender_id) : null;
            const prev = messages[i - 1];
            const showDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString() || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 3600_000;
            const time = fmtTime(m.created_at);
            return <div key={m.id} className="cx-row-wrap">
              {m.id === firstUnread && <p className="pp-unread-divider" data-first-unread="true" role="separator">New messages</p>}
              {showDay && <p className="cx-day">{new Date(m.created_at).toDateString() === new Date().toDateString() ? (ar ? "النهارده " : "Today ") : ""}{time}</p>}
              {mine ? (
                <><div className="cx-row cx-row-user" {...rowProps(m)}>
                  <div data-no-translate className="cx-bubble cx-bubble-user" dir="auto"><MessageContent message={m} /><Reactions list={m.deleted_at ? [] : reactionsFor.get(m.id)} /></div>
                  <span className="cx-time">{time}</span>
                </div>
                <SeenLine people={seenBy.get(m.id)} group={isGroup} last={m.id === lastMine} /></>
              ) : (
                <div className="cx-row cx-row-agent" {...rowProps(m)}>
                  <div className="cx-avatar">{hit ? <BotAvatar agent={hit.agent} size={22} /> : <button type="button" className="pp-avatar-btn" aria-label={`Open ${personLabel(person)}'s profile`} onClick={() => person && setProfile(person)}><PersonAvatar person={person} size={22} /></button>}</div>
                  <div className="cx-agent-body">
                    {isGroup && <span className="cx-author" dir="auto">{hit ? hit.bot.name : personLabel(person)}</span>}
                    <div data-no-translate className="cx-bubble cx-bubble-agent" dir="auto">
                      {m.deleted_at ? <MessageContent message={m} /> : hit ? <FormattedAnswer text={m.content} onSend={(message) => { void send(message); }} /> : <MessageContent message={m} />}
                      <Reactions list={m.deleted_at ? [] : reactionsFor.get(m.id)} />
                    </div>
                  </div>
                  <span className="cx-time">{time}</span>
                </div>
              )}
            </div>;
          })}
          {botsBusy > 0 && <div className="cx-working">
            <span className="cx-stack">{shownBots.map((a) => <BotAvatar key={a.id} agent={a} size={24} state="thinking" />)}</span>
            <span dir="auto" className="cx-working-text"><span className="cx-shimmer">{ar ? "البوتات بترد…" : "Bots are replying…"}</span></span>
          </div>}
        </div>
      )}
    </div>

    <div className="cx-composer-wrap">
      {replyTo && <div className="cx-reply-preview"><Reply size={15} /><span dir="auto">{quoteFor(splitReply(replyTo.content).body)}</span><button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={15} /></button></div>}
      {blocked && <p className="pp-muted pp-blocked" role="status">You blocked this person. Unblock from the menu to send messages.</p>}
      {mentionMatches.length > 0 && <div className="cx-mentions" role="listbox">{mentionMatches.map((b) => <button type="button" role="option" key={b.id} onPointerDown={(e) => { e.preventDefault(); pickMention(b.name); }}><BotAvatar agent={bots.get(b.id)?.agent || botAgent(b)} size={26} /><span>{b.name}</span></button>)}</div>}
      {pending.length > 0 && <div className="cx-files">{pending.map((f, i) => <span key={`${f.name}-${i}`} className="cx-file-chip"><Paperclip size={13} /><span>{f.name}</span><button type="button" aria-label="Remove file" onClick={() => setPending((c) => c.filter((_, j) => j !== i))}><X size={13} /></button></span>)}</div>}
      <input ref={fileIn} type="file" multiple hidden accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={(e) => { const list = Array.from(e.target.files || []); e.target.value = ""; setPending((c) => [...c, ...list].slice(0, 10)); }} />
      <div className="cx-composer">
        <button type="button" className="cx-circle cx-plus" aria-label={ar ? "إرسال صورة أو ملف" : "Send photo or file"} disabled={blocked || uploading} onClick={() => fileIn.current?.click()}><Plus size={17} /></button>
        <textarea
          ref={textarea}
          rows={1}
          dir="auto"
          value={text}
          aria-label={ar ? "اكتب رسالة" : "Message"}
          placeholder={isGroup ? (ar ? "اكتب للجروب…" : "Message the group…") : ar ? `رسالة لـ ${title}` : `Message ${title}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (mentionMatches.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); pickMention(mentionMatches[0].name); return; }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
          }}
        />
        <button type="button" className="cx-circle cx-send" aria-label="Send" disabled={(!text.trim() && !pending.length) || blocked || uploading} onClick={() => void send()}><ArrowUp size={18} /></button>
      </div>
    </div>

    {actionFor && <>
      <div className="cx-sheet-scrim pp-action-scrim" onPointerDown={() => setActionFor(null)} />
      <div className="pp-actions" role="dialog" aria-label="Message actions">
        <div className="pp-react-bar">{QUICK_REACTIONS.map((e) => <button type="button" key={e} data-on={reactions.some((r) => r.message_id === actionFor.id && r.user_id === me && r.emoji === e)} onClick={() => react(actionFor, e)}>{e}</button>)}</div>
        <p className="pp-action-preview" dir="auto">{quoteFor(splitReply(actionFor.content).body)}</p>
        <div className="pp-action-menu">
          <button type="button" onClick={() => { setReplyTo(actionFor); setActionFor(null); textarea.current?.focus(); }}><Reply size={18} />Reply</button>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(parseAttachments(splitReply(actionFor.content).body).text); setActionFor(null); }}><Copy size={18} />Copy</button>
          {canChangeMessage(actionFor, me) && <>
            <Button variant="ghost" onClick={() => { setEditing(actionFor); setEditText(parseAttachments(splitReply(actionFor.content).body).text); setActionFor(null); }}><Pencil size={18} />Edit</Button>
            <Button variant="ghost" disabled={savingEdit} onClick={() => void changeMessage(actionFor, true)}><Trash2 size={18} />Delete for everyone</Button>
          </>}
          <span className="pp-action-time">{new Date(actionFor.created_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
        </div>
      </div>
    </>}
    {editing && <><div className="cx-sheet-scrim" onPointerDown={() => !savingEdit && setEditing(null)} /><section className="pp-edit-dialog" role="dialog" aria-modal="true" aria-label="Edit message"><header className="pp-detail-head"><h2>Edit message</h2><Button variant="ghost" size="icon" aria-label="Cancel editing" disabled={savingEdit} onClick={() => setEditing(null)}><X /></Button></header><textarea aria-label="Edited message" autoFocus rows={4} value={editText} maxLength={8000} onChange={(e) => setEditText(e.target.value)} />{error && <p className="pp-error" role="alert">{error}</p>}<Button disabled={savingEdit || (!editText.trim() && !parseAttachments(splitReply(editing.content).body).files.length)} onClick={() => void changeMessage(editing)}>Save changes</Button></section></>}
    {groupDetails && thread && <GroupDetails thread={thread} members={info.members} bots={info.bots} userId={me} onClose={() => setGroupDetails(false)} onSaved={() => { void peopleApi.thread(threadId).then(setThread); window.dispatchEvent(new Event("ceyo-people-changed")); }} onPerson={(p) => { setGroupDetails(false); setProfile(p); }} />}
    {profile && <PersonProfileSheet person={profile} messages={messages} onClose={() => setProfile(null)} />}
    {panel && <>
      <div className="cx-sheet-scrim" onPointerDown={() => setPanel("")} />
      <div className="cx-sheet pp-sheet" role="dialog" aria-label={panel === "people" ? (ar ? "ضيف شخص" : "Add person") : (ar ? "ضيف بوت" : "Add bot")}>
        <span className="cx-grip" />
        {panel === "people"
          ? <PeoplePicker lang={lang} picked={info.members} onPick={(p) => { void peopleApi.addMember(threadId, p.username || "").then(reloadInfo).catch((e) => setError(userErrorText(e))); }} />
          : <div className="pp-results">{agents.map((a) => {
              const on = info.bots.some((b) => b.id === a.id);
              return <button type="button" key={a.id} className="pp-result" data-on={on} disabled={on} onClick={() => { void peopleApi.addBot(threadId, a.id).then(reloadInfo).catch((e) => setError(userErrorText(e))); }}><BotAvatar agent={a} size={30} /><span><strong>{a.name}</strong></span>{on && <Check size={16} />}</button>;
            })}</div>}
      </div>
    </>}
  </section>;
}

function MessageContent({ message }: { message: PeopleMessage }) {
  if (message.deleted_at) return <p className="pp-deleted-message"><Ban size={14} />This message was deleted</p>;
  return <><ReplyBody content={message.content} />{message.edited_at && <small className="pp-edited-message">Edited</small>}</>;
}

function Reactions({ list }: { list?: PeopleReaction[] }) {
  if (!list?.length) return null;
  const counts = new Map<string, number>();
  for (const r of list) counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
  return <span className="pp-reactions">{[...counts].map(([e, n]) => <span key={e}>{e}{n > 1 && <small>{n}</small>}</span>)}</span>;
}

/** Instagram-style "Seen" under my message: the reader's photo in direct chats, stacked readers in groups. */
function SeenLine({ people, group, last }: { people?: PersonInfo[]; group: boolean; last: boolean }) {
  if (!people?.length) return last ? <p className="pp-seen"><Check size={13} />Sent</p> : null;
  return <p className="pp-seen" data-read="true">
    {group ? <span className="cx-stack">{people.slice(0, 5).map((p) => <PersonAvatar key={p.id} person={p} size={16} />)}</span> : <PersonAvatar person={people[0]} size={16} />}
    {group ? (people.length > 5 ? `Seen by ${people.length}` : "Seen") : <><CheckCheck size={13} />Seen</>}
  </p>;
}

/** A message body with an optional quoted reply on top and any photos or files sent with it. */
function ReplyBody({ content }: { content: string }) {
  const { quote, body } = splitReply(content);
  const { files, text } = parseAttachments(body);
  return <>
    {quote && <span className="cx-reply-quote" dir="auto">{quote}</span>}
    {files.length > 0 && <span className="pp-attachments">{files.map((f) => <Attachment key={f.path} file={f} />)}</span>}
    {text && <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{text}</p>}
  </>;
}

function Attachment({ file }: { file: PeopleAttachment }) {
  const url = useAttachmentUrl(file.path);
  if (file.type.startsWith("image/")) return <a className="pp-photo" href={url || undefined} target="_blank" rel="noopener noreferrer">{url ? <img src={url} alt={file.name} loading="lazy" /> : <span className="pp-photo-wait" />}</a>;
  if (file.type.startsWith("video/")) return url ? <video className="pp-video" src={url} controls preload="metadata" /> : <span className="pp-photo-wait" />;
  return <a className="pp-file" href={url || undefined} download={file.name} target="_blank" rel="noopener noreferrer"><FileText size={18} /><span dir="auto">{file.name}</span></a>;
}

const URL_RE = /https?:\/\/[^\s<>()]+/g;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;

/** Another person's profile: photo, username, and what was shared in this chat. */
function PersonProfileSheet({ person, messages, onClose }: { person: PersonInfo; messages: PeopleMessage[]; onClose: () => void }) {
  const shared = useMemo(() => {
    const seen = new Set<string>();
    const out: { url: string; image: boolean; at: string }[] = [];
    for (const m of [...messages].reverse()) for (const url of m.content.match(URL_RE) || []) {
      const clean = url.replace(/[.,!?]+$/, "");
      if (seen.has(clean)) continue;
      seen.add(clean); out.push({ url: clean, image: IMAGE_RE.test(clean), at: m.created_at });
    }
    return out;
  }, [messages]);
  const images = shared.filter((s) => s.image);
  const links = shared.filter((s) => !s.image);
  return <>
    <div className="cx-sheet-scrim" onPointerDown={onClose} />
    <div className="cx-sheet pp-sheet pp-profile" role="dialog" aria-label={`${personLabel(person)} profile`}>
      <span className="cx-grip" />
      <div className="pp-profile-head"><PersonAvatar person={person} size={84} /><strong dir="auto">{person.username ? `@${person.username}` : personLabel(person)}</strong></div>
      <h3 className="pp-sub">Shared in this chat</h3>
      {!shared.length && <p className="pp-muted">Nothing shared yet. Photos and links sent here will show up.</p>}
      {images.length > 0 && <div className="pp-shared-grid">{images.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"><img src={s.url} alt="" loading="lazy" /></a>)}</div>}
      {links.length > 0 && <div className="pp-results">{links.map((s) => <a key={s.url} className="pp-result" href={s.url} target="_blank" rel="noopener noreferrer"><Link2 size={16} /><span><strong dir="ltr">{s.url.replace(/^https?:\/\//, "").slice(0, 60)}</strong><small>{new Date(s.at).toLocaleDateString()}</small></span></a>)}</div>}
    </div>
  </>;
}
