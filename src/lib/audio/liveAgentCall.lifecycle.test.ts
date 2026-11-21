import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  context: { state: "running", sampleRate: 48000, currentTime: 0, destination: {}, resume: vi.fn().mockResolvedValue(undefined), createMediaStreamSource: vi.fn(), createScriptProcessor: vi.fn(), createGain: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.session } } }));
vi.mock("./voiceClient", () => ({ sharedAudioContext: () => mocks.context }));

import { startLiveAgentCall } from "./liveAgentCall";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0; binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; });
  constructor() { Socket.instances.push(this); }
}
const options = () => ({ voiceId: "voice", language: "en", agentName: "Bot", agentPrompt: "", onPhase: vi.fn(), onError: vi.fn() });
let stop: ReturnType<typeof vi.fn>, microphone: ReturnType<typeof vi.fn>, fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Socket.instances = [];
  stop = vi.fn();
  microphone = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: microphone } });
  mocks.session.mockResolvedValue({ data: { session: { access_token: "session" } } });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  mocks.context.createMediaStreamSource.mockImplementation(node);
  mocks.context.createScriptProcessor.mockImplementation(() => ({ ...node(), onaudioprocess: null }));
  mocks.context.createGain.mockImplementation(() => ({ ...node(), gain: { value: 1 } }));
  fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ token: "token", settings: { type: "Settings" } })));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("WebSocket", Socket);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("asks for the call grant while the microphone prompt is still open, and stops a late microphone after hang-up", async () => {
  let grantMic!: (s: MediaStream) => void;
  microphone.mockImplementation(() => new Promise<MediaStream>((r) => { grantMic = r; }));
  const controller = new AbortController();
  const result = startLiveAgentCall({ ...options(), signal: controller.signal }).catch((e) => e);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  controller.abort();
  expect((await result).name).toBe("AbortError");
  grantMic({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  await vi.advanceTimersByTimeAsync(0);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(Socket.instances).toHaveLength(0);
});

it("gives up after 8 seconds when the call grant never answers", async () => {
  fetcher.mockImplementation(() => new Promise(() => {}));
  const result = startLiveAgentCall(options()).catch((e) => e);
  await vi.advanceTimersByTimeAsync(8000);
  expect((await result).message).toMatch(/timed out/i);
  expect(fetcher.mock.calls[0]?.[1].signal.aborted).toBe(true);
  expect(stop).toHaveBeenCalledTimes(1);
});

it("gives up when the call connection never opens", async () => {
  const result = startLiveAgentCall(options()).catch((e) => e);
  await vi.advanceTimersByTimeAsync(8000);
  expect((await result).message).toMatch(/connection timed out/i);
  expect(Socket.instances[0]?.close).toHaveBeenCalledTimes(1);
  expect(stop).toHaveBeenCalledTimes(1);
});

it("hangs up instantly while still connecting", async () => {
  const controller = new AbortController();
  const result = startLiveAgentCall({ ...options(), signal: controller.signal }).catch((e) => e);
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  expect((await result).name).toBe("AbortError");
  expect(Socket.instances[0]?.close).toHaveBeenCalledTimes(1);
  expect(stop).toHaveBeenCalledTimes(1);
});

it("connects once the voice service confirms its settings", async () => {
  const result = startLiveAgentCall(options());
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances[0]!;
  socket.readyState = Socket.OPEN;
  socket.onopen?.();
  socket.onmessage?.({ data: JSON.stringify({ type: "SettingsApplied" }) });
  const call = await result;
  expect(typeof call.end).toBe("function");
  call.end();
  expect(socket.close).toHaveBeenCalled();
  expect(stop).toHaveBeenCalledTimes(1);
});
