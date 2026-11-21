/**
 * @doc Live voice call over the Deepgram Voice Agent (speech-to-speech, barge-in).
 * The server returns a short-lived token and the full Settings; mic PCM streams in, agent PCM
 * plays out. Nothing is written to the chat conversation.
 * Startup is bounded and cancellable: mic permission and the grant run together, every network
 * step has a deadline, and an abort releases everything this attempt acquired.
 */
import { supabase } from "@/integrations/supabase/client";
import { sharedAudioContext } from "./voiceClient";
import { createPcmResampler } from "./callInput";
import type { RealtimeCall, RealtimeCallOptions } from "./realtimeCall";

const OUT_RATE = 24000;
export const CALL_TIMEOUTS = { microphone: 15000, grant: 8000, open: 8000, settings: 8000 };

export type LiveCallOptions = RealtimeCallOptions & { signal?: AbortSignal };

export async function startLiveAgentCall(opts: LiveCallOptions): Promise<RealtimeCall> {
  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  let ended = false, connected = false, muted = false, ready = false, dropAudio = false;

  const dispose = (reason: unknown = new DOMException("Call cancelled", "AbortError")) => {
    if (ended) return;
    ended = true;
    controller.abort(reason);
    for (const cleanup of cleanups.reverse()) { try { cleanup(); } catch { /* keep releasing */ } }
    cleanups.length = 0;
  };
  const cancel = () => dispose();
  opts.signal?.addEventListener("abort", cancel, { once: true });
  cleanups.push(() => opts.signal?.removeEventListener("abort", cancel));

  /** Rejects on abort, or disposes the whole attempt when the step takes too long. */
  const bounded = <T,>(work: Promise<T>, ms: number, message: string) => new Promise<T>((resolve, reject) => {
    const signal = controller.signal;
    if (signal.aborted) { reject(signal.reason); return; }
    const onAbort = () => { finish(); reject(signal.reason); };
    const timer = setTimeout(() => dispose(new Error(message)), ms);
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", onAbort); };
    signal.addEventListener("abort", onAbort, { once: true });
    work.then((v) => { finish(); resolve(v); }, (e) => { finish(); reject(e); });
  });
  const fail = (message: string) => {
    if (ended) return;
    dispose(new Error(message));
    if (connected) opts.onError(message);
  };
  const phase = (p: Parameters<RealtimeCallOptions["onPhase"]>[0]) => { if (!ended) opts.onPhase(p); };

  try {
    if (opts.signal?.aborted) { dispose(); throw controller.signal.reason; }
    phase("connecting");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone is unavailable in this browser.");
    const ctx = sharedAudioContext();
    if (!ctx) throw new Error("Audio is unavailable in this browser.");

    // Both start now. Permission prompts can't be aborted, so a late stream is stopped on arrival.
    const microphone = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then((stream) => {
      if (ended) { stream.getTracks().forEach((t) => t.stop()); throw controller.signal.reason; }
      cleanups.push(() => stream.getTracks().forEach((t) => t.stop()));
      return stream;
    });
    const grant = (async () => {
      const { data } = await supabase.auth.getSession();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!data.session) throw new Error("Please sign in");
      const res = await fetch("/api/voice-call", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ action: "agent", agentName: opts.agentName, agentPrompt: opts.agentPrompt, reason: opts.reason || "", voiceId: opts.voiceId, language: opts.language }),
      });
      const j = await res.json().catch(() => ({})) as { token?: string; settings?: unknown; error?: string };
      if (!res.ok || !j.token || !j.settings) throw new Error(j.error || "Voice service unavailable. Please retry.");
      return j as { token: string; settings: unknown };
    })();
    // Avoid unhandled rejections when the other branch fails first.
    microphone.catch(() => {}); grant.catch(() => {});
    const [stream, credentials] = await Promise.all([
      bounded(microphone, CALL_TIMEOUTS.microphone, "Microphone permission timed out. Please retry."),
      bounded(grant, CALL_TIMEOUTS.grant, "Voice connection timed out. Please retry."),
    ]);
    if (ended) throw controller.signal.reason;

    // ---- playback ----
    let nextTime = 0;
    const sources = new Set<AudioBufferSourceNode>();
    const stopPlayback = () => {
      for (const s of sources) { s.onended = null; try { s.stop(); } catch { /* stopped */ } try { s.disconnect(); } catch { /* gone */ } }
      sources.clear(); nextTime = 0;
    };
    cleanups.push(stopPlayback);
    const play = (buf: ArrayBuffer) => {
      const pcm = new Int16Array(buf, 0, Math.floor(buf.byteLength / 2));
      if (!pcm.length) return;
      const f = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) f[i] = (pcm[i] ?? 0) / 32768;
      const b = ctx.createBuffer(1, f.length, OUT_RATE); b.copyToChannel(f, 0);
      const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination);
      const at = Math.max(ctx.currentTime + 0.03, nextTime);
      src.start(at); nextTime = at + b.duration; sources.add(src);
      src.onended = () => { try { src.disconnect(); } catch { /* gone */ } sources.delete(src); if (!sources.size) phase("listening"); };
      phase("speaking");
    };

    // ---- socket ----
    const ws = new WebSocket("wss://agent.deepgram.com/v1/agent/converse", ["bearer", credentials.token]);
    ws.binaryType = "arraybuffer";
    cleanups.push(() => { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; try { ws.close(); } catch { /* closed */ } });
    let resolveOpen!: () => void, resolveSettings!: () => void;
    const opened = new Promise<void>((r) => { resolveOpen = r; });
    const configured = new Promise<void>((r) => { resolveSettings = r; });
    ws.onopen = () => {
      if (ended) return;
      try { ws.send(JSON.stringify(credentials.settings)); resolveOpen(); }
      catch { fail("Could not set up the call. Please retry."); }
    };
    ws.onerror = () => fail("Call connection failed. Please retry.");
    ws.onclose = (e) => fail(e.code === 1008 || e.code === 4001 ? "Voice service refused the call." : "Call connection dropped. Try again.");
    ws.onmessage = (ev) => {
      if (ended) return;
      if (typeof ev.data !== "string") { if (!dropAudio) { try { play(ev.data as ArrayBuffer); } catch { /* skip a bad chunk */ } } return; }
      let msg: { type?: string; description?: string; role?: string; content?: string };
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case "ConversationText":
          if ((msg.role === "user" || msg.role === "assistant") && msg.content?.trim() && !msg.content.startsWith("(I just")) opts.onTurn?.({ role: msg.role, text: msg.content });
          break;
        case "SettingsApplied":
          if (ready) break;
          ready = true; phase("listening");
          ws.send(JSON.stringify({ type: "InjectUserMessage", content: opts.reason ? "(I just answered your call.)" : "(I just called you. Greet me.)" }));
          resolveSettings();
          break;
        case "UserStartedSpeaking": dropAudio = false; stopPlayback(); phase("listening"); break;
        case "AgentThinking": phase("thinking"); break;
        case "AgentStartedSpeaking": dropAudio = false; break;
        case "Error": fail(msg.description || "Voice agent error"); break;
      }
    };

    // ---- mic ----
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    const sink = ctx.createGain(); sink.gain.value = 0;
    cleanups.push(() => { processor.onaudioprocess = null; try { source.disconnect(); processor.disconnect(); sink.disconnect(); } catch { /* gone */ } });
    source.connect(processor); processor.connect(sink); sink.connect(ctx.destination);
    const resampler = createPcmResampler(ctx.sampleRate, 16000);
    processor.onaudioprocess = (ev) => {
      if (ended || !ready || ws.readyState !== WebSocket.OPEN) return;
      const pcm = resampler.push(muted ? new Float32Array(ev.inputBuffer.length) : ev.inputBuffer.getChannelData(0));
      if (pcm.length) { try { ws.send(pcm.buffer); } catch { /* socket closing */ } }
    };

    await bounded(opened, CALL_TIMEOUTS.open, "Call connection timed out. Please retry.");
    await bounded(configured, CALL_TIMEOUTS.settings, "Call setup timed out. Please retry.");
    if (ended) throw controller.signal.reason;
    const keepAlive = setInterval(() => { if (!ended && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({ type: "KeepAlive" })); } catch { /* closing */ } } }, 8000);
    cleanups.push(() => clearInterval(keepAlive));
    connected = true;

    return {
      async resumeAudio() {
        if (ended) return false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          // A WebView's resume() may never settle without a gesture: never hang the caller.
          await Promise.race([ctx.resume(), new Promise<void>((r) => { timer = setTimeout(r, 3000); })]);
          return !ended && ctx.state === "running";
        } catch { return false; } finally { clearTimeout(timer); }
      },
      setMuted(next) { muted = next; },
      interrupt() { if (ended) return; dropAudio = true; stopPlayback(); phase("listening"); },
      end: () => dispose(),
    };
  } catch (error) {
    dispose(error);
    throw error;
  }
}
