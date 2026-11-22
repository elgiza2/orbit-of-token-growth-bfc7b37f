import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Camera, Check, ChevronLeft, Copy, Link2, RefreshCw, Share2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toAvatar } from "@/lib/profile/avatar";
import { userErrorText } from "@/lib/errors";
import { askConfirm } from "@/components/common/CeyoConfirm";
import { peopleApi, personLabel, type PeopleThread, type PersonInfo, type ThreadBot, type InvitePreview } from "@/lib/people/peopleApi";
import { clearGroupInvite, pendingGroupInvite } from "@/lib/people/inviteState";

export function GroupDetails({ thread, members, bots, userId, onClose, onSaved, onPerson }: {
  thread: PeopleThread; members: PersonInfo[]; bots: ThreadBot[]; userId: string;
  onClose: () => void; onSaved: () => void; onPerson: (p: PersonInfo) => void;
}) {
  const owner = thread.created_by === userId;
  const [name, setName] = useState(thread.name || "");
  const [description, setDescription] = useState(thread.description || "");
  const [photo, setPhoto] = useState(thread.avatar_url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { const escape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, [onClose]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); try { await action(); } catch (e) { setError(userErrorText(e)); } finally { setBusy(false); } };
  const invite = async (reset = false) => {
    if (reset && !await askConfirm({ title: "Reset invitation link?", body: "The old link and QR code will stop working.", confirm: "Reset" })) return;
    await run(async () => { const token = await peopleApi.invite(thread.id, reset); setLink(`${window.location.origin}/index?groupInvite=${token}`); setCopied(false); });
  };
  return <>
    <div className="cx-sheet-scrim" onPointerDown={onClose} />
    <section className="pp-group-details" role="dialog" aria-modal="true" aria-label="Group information">
      <header className="pp-detail-head"><Button variant="ghost" size="icon" aria-label="Close group information" onClick={onClose}><ChevronLeft /></Button><h2>Group information</h2>{owner && <Button variant="ghost" size="icon" aria-label="Save group information" disabled={busy || !name.trim()} onClick={() => void run(async () => { await peopleApi.saveGroup(thread.id, name, description, photo); onSaved(); onClose(); })}><Check /></Button>}</header>
      <div className="pp-group-identity">
        <Button variant="ghost" className="pp-group-photo" aria-label="Change group photo" disabled={!owner || busy} onClick={() => file.current?.click()}>{photo ? <img src={photo} alt="Group" /> : <Users />}{owner && <span className="pp-camera"><Camera size={16} /></span>}</Button>
        <input hidden type="file" accept="image/jpeg,image/png,image/webp" ref={file} onChange={(e) => { const selected = e.target.files?.[0]; e.target.value = ""; if (selected) void run(async () => { if (selected.size > 10 * 1024 * 1024) throw new Error("Choose a photo smaller than 10 MB"); setPhoto(await toAvatar(selected)); }); }} />
        {owner && photo && <Button variant="link" size="sm" onClick={() => setPhoto(null)}>Remove photo</Button>}
        {owner ? <label className="pp-detail-field">Group name<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label> : <h3 dir="auto">{name}</h3>}
        <p className="pp-muted">{members.length} people · {bots.length} bots</p>
      </div>
      <label className="pp-detail-field">Description{owner ? <textarea value={description} maxLength={1000} rows={3} onChange={(e) => setDescription(e.target.value)} /> : <p dir="auto">{description || "No description"}</p>}</label>
      {owner && <div className="pp-invite-controls"><Button variant="ghost" disabled={busy} onClick={() => void invite()}><Link2 />Invite via link & QR</Button>{link && <>
        <div className="pp-invite-qr"><QRCodeSVG value={link} size={180} fgColor="currentColor" bgColor="transparent" marginSize={3} /></div>
        <input className="pp-invite-url" aria-label="Group invitation link" readOnly value={link} onFocus={(e) => e.target.select()} />
        <div className="pp-detail-tools"><Button variant="outline" disabled={busy} onClick={() => void run(async () => { await navigator.clipboard.writeText(link); setCopied(true); })}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button><Button variant="outline" disabled={busy} onClick={() => void run(async () => { if (navigator.share) await navigator.share({ title: name, url: link }); else { await navigator.clipboard.writeText(link); setCopied(true); } })}><Share2 />Share</Button><Button variant="ghost" size="icon" title="Reset invitation link" aria-label="Reset invitation link" disabled={busy} onClick={() => void invite(true)}><RefreshCw /></Button></div>
      </>}</div>}
      {error && <p className="pp-error" role="alert">{error}</p>}
      <h3 className="pp-sub">Members · {members.length + bots.length}</h3>
      <div className="pp-results">{members.map((p) => <Button variant="ghost" key={p.id} className="pp-result" onClick={() => onPerson(p)}><span className="pp-member-photo">{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : personLabel(p).slice(0, 1)}</span><span><strong dir="auto">{p.id === userId ? "You" : personLabel(p)}</strong><small>{p.username ? `@${p.username}` : ""}</small></span>{p.id === thread.created_by && <small>Creator</small>}</Button>)}{bots.map((b) => <div className="pp-result" key={b.id}><span className="pp-member-photo"><Users size={18} /></span><span><strong>{b.name}</strong><small>Bot</small></span></div>)}</div>
    </section>
  </>;
}

export function PendingGroupInvitation({ onJoined }: { onJoined: (id: string) => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = pendingGroupInvite(); setToken(t); if (!t) { setLoading(false); return; } let alive = true; void peopleApi.previewInvite(t).then((p) => { if (alive) { setPreview(p); if (!p) setError("This invitation is no longer available."); } }).catch((e) => alive && setError(userErrorText(e))).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, []);
  const close = () => { clearGroupInvite(); setToken(null); };
  if (!token) return null;
  return <><div className="cx-sheet-scrim" onPointerDown={() => !busy && close()} /><section className="pp-invite-dialog" role="dialog" aria-modal="true" aria-label="Group invitation"><Button variant="ghost" size="icon" className="pp-invite-close" aria-label="Close invitation" onClick={close} disabled={busy}><X /></Button>{preview?.avatarUrl ? <img className="pp-invite-photo" src={preview.avatarUrl} alt="Group" /> : <Users size={48} />}<h2 dir="auto">{preview?.name || "Group invitation"}</h2>{loading ? <p role="status">Loading invitation…</p> : <>{preview && <><p className="pp-muted">{preview.memberCount} members</p><p dir="auto">{preview.description}</p></>}{error && <p className="pp-error" role="alert">{error}</p>}<Button disabled={busy || !preview} onClick={() => { setBusy(true); setError(""); void peopleApi.joinInvite(token).then((id) => { close(); window.dispatchEvent(new Event("ceyo-people-changed")); onJoined(id); }).catch((e) => setError(userErrorText(e))).finally(() => setBusy(false)); }}>Join group</Button></>}</section></>;
}