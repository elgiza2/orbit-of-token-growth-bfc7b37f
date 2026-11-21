/** @doc Decides when an agent step's text may be shown while it is still being written. A short prefix is held so refusals, technical asks and printed tool calls can still be retried unseen; afterwards text streams live, except an unfinished ``` block, which waits until it closes. */
import { looksLikeFakeToolCall, looksLikeRefusal, looksLikeTechnicalAsk } from "./selfHealing";

export const LIVE_PREFIX_CHARS = 140;

/** True once the visible text is long enough and looks like a genuine answer. */
export function liveStreamReady(text: string, toolNames: readonly string[] = [], sawToolCall = false): boolean {
  const t = text.trimStart();
  if (sawToolCall || t.length < LIVE_PREFIX_CHARS) return false;
  if (/^[{<[]/.test(t)) return false;
  return !looksLikeFakeToolCall(t, toolNames) && !looksLikeRefusal(t) && !looksLikeTechnicalAsk(t);
}

/** How much of the text can be shown now: everything except an unclosed ``` block. */
export function safeVisibleLength(text: string): number {
  let count = 0, last = -1, i = -1;
  while ((i = text.indexOf("```", i + 1)) >= 0) { count++; last = i; i += 2; }
  return count % 2 === 1 ? last : text.length;
}
