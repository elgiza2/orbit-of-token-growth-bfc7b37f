/** @doc Dynamic-island style notice: a black pill at the top that springs open to show who finished and a short preview. */
import { toast } from "sonner";
import { Check, AlertTriangle } from "lucide-react";
import "@/styles/island-notice.css";

export function showIsland(opts: { id: string; title: string; body?: string; tone?: "done" | "error"; onOpen?: () => void }) {
  toast.custom((t) => (
    <button type="button" className="island-notice" data-tone={opts.tone || "done"} onClick={() => { toast.dismiss(t); opts.onOpen?.(); }}>
      <span className="island-notice-icon">{opts.tone === "error" ? <AlertTriangle size={16} /> : <Check size={16} />}</span>
      <span className="island-notice-copy"><strong dir="auto">{opts.title}</strong>{opts.body && <small dir="auto">{opts.body}</small>}</span>
      <span className="island-notice-dot" aria-hidden />
    </button>
  ), { id: opts.id, duration: 5000, unstyled: true });
}
