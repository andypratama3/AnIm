import type { StoredMessage } from "@/lib/data/chat-store";
import { MAX_PROMPT_CHARS } from "@/lib/data/agent-chat";

/**
 * Carrying the conversation into the prompt.
 *
 * Each turn was a single question sent to a single process: `chatWithProfile`
 * was handed one string, so the agent woke up with no idea what had been asked
 * before, and "what did I ask it earlier" could only be answered by scrolling
 * the transcript. The transcript was durable and the agent was amnesiac.
 *
 * The history is built here, on the server, from the server's own record. The
 * client still posts `{ profile, prompt }` and still cannot influence what the
 * agent is told about the past: a caller that sent its own "history" would be
 * asking the agent to trust a transcript it could have written.
 *
 * Budget rules, because the wire has a hard limit:
 *  - The question is never truncated. It is what the operator just typed.
 *  - History is trimmed from the oldest end until the whole prompt fits
 *    `MAX_PROMPT_CHARS`, because exceeding it is a 400 from the caller, and a
 *    long conversation must degrade to a short one rather than break.
 *  - A failed delivery is skipped: its text is "Delivery failed: ...", which
 *    tells the agent nothing and spends budget that a real turn needed.
 */

/** How many prior turns to consider at most. */
export const MAX_HISTORY_TURNS = 8;
/** History is capped separately, so one long reply cannot crowd out the rest. */
export const MAX_HISTORY_CHARS = 2_500;
/** A single prior turn is trimmed so a wall of text cannot eat the budget. */
export const MAX_TURN_CHARS = 600;

const HEADER = "Earlier in this conversation (most recent last):";

function turnText(message: StoredMessage): string | null {
  if (message.failed) return null;
  const text = message.text.trim();
  if (!text) return null;
  const trimmed =
    text.length > MAX_TURN_CHARS ? `${text.slice(0, MAX_TURN_CHARS - 1)}…` : text;
  return `${message.from === "you" ? "You" : message.profile}: ${trimmed}`;
}

/**
 * What to actually send. Returns the bare question when there is no room or
 * nothing worth sending, so the common case is byte-identical to before.
 */
export function formatHistoryPrompt(history: StoredMessage[], question: string): string {
  const asked = question.trim();
  if (!asked) return asked;

  // A question alone plus the room the framing needs, so a near-limit question
  // still succeeds with no history rather than failing.
  let budget = Math.min(MAX_HISTORY_CHARS, MAX_PROMPT_CHARS - asked.length - 32);
  if (budget <= 0) return asked;

  const lines: string[] = [];
  // Walk newest to oldest so the trim drops the least relevant turns first.
  for (let i = history.length - 1; i >= 0 && lines.length < MAX_HISTORY_TURNS; i -= 1) {
    const line = turnText(history[i]);
    if (!line) continue;
    if (line.length + 2 > budget) break;
    budget -= line.length + 2;
    lines.unshift(line);
  }

  if (lines.length === 0) return asked;
  return `${HEADER}\n${lines.join("\n")}\n\n${asked}`;
}

/** How many prior turns the last prompt actually carried. */
export function historyTurnCount(prompt: string): number {
  if (!prompt.startsWith(HEADER)) return 0;
  const body = prompt.slice(HEADER.length).split("\n\n")[0];
  return body.split("\n").filter(Boolean).length;
}
