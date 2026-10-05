import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { isChatProfile, type ChatProfile } from "@/lib/data/agent-chat";

/**
 * File-backed transcripts, one file per profile.
 *
 * The conversation log used to live in a single `useState` array, so a reload
 * erased it and switching profiles mixed every agent into one list. Anyone
 * auditing "what did this agent say" had nothing to read, which is the one thing
 * a supervision console exists to provide.
 *
 * Per-profile files also mean one agent's log cannot be corrupted by a write to
 * another, and a profile can be cleared without touching the rest.
 */

const ROOT =
  process.env.ANIM_CHAT_STORE ?? join(process.cwd(), ".data", "chat");

/** Older turns are dropped, not the file rewritten on every read. */
const MAX_MESSAGES = Number(process.env.ANIM_CHAT_MAX_MESSAGES ?? 200);
/** A single stored message. Agent replies are capped at 256KB upstream. */
const MAX_MESSAGE_CHARS = 32_000;

export type ChatRole = "you" | "agent";

/**
 * The message a turn is answering, quoted inside its bubble.
 *
 * Only display metadata: it is a local convenience for reading the thread and
 * is never sent to the agent, so a stale or hand-edited reference can mislead
 * on screen but cannot change what the model is asked.
 */
export type ReplyRef = {
  id: string;
  from: ChatRole;
  profile: string;
  snippet: string;
};

export type StoredMessage = {
  id: string;
  from: ChatRole;
  profile: string;
  text: string;
  ts: number;
  elapsedMs?: number;
  failed?: boolean;
  replyTo?: ReplyRef;
};

export type Transcript = {
  profile: string;
  messages: StoredMessage[];
  /** Set when older turns were dropped, so the UI can say so rather than lie. */
  dropped: number;
};

/**
 * The profile is checked against the chattable allowlist before it ever reaches
 * the filesystem. That is what makes this safe as a path segment: no `..`, no
 * separators and no absolute paths can get through.
 */
export class UnsafeProfileError extends Error {
  constructor(profile: string) {
    super(`refusing to build a path for a non-addressable profile: ${profile}`);
    this.name = "UnsafeProfileError";
  }
}

function pathFor(profile: string): string {
  if (!isChatProfile(profile)) throw new UnsafeProfileError(profile);
  return join(ROOT, `${profile}.json`);
}

function isMessage(value: unknown): value is StoredMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    (m.from === "you" || m.from === "agent") &&
    typeof m.text === "string" &&
    typeof m.ts === "number"
  );
}

function clamp(text: string): string {
  return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}\u2026` : text;
}

/** Atomic write, so a crash mid-save cannot truncate an existing transcript. */
async function writeTranscript(
  profile: string,
  messages: StoredMessage[],
  dropped: number,
): Promise<void> {
  const file = pathFor(profile);
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ profile, messages, dropped }, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

export function newMessage(
  from: ChatRole,
  profile: string,
  text: string,
  extra: { elapsedMs?: number; failed?: boolean; replyTo?: ReplyRef } = {},
): StoredMessage {
  const message: StoredMessage = {
    id: `${from}-${randomUUID()}`,
    from,
    profile,
    text: clamp(text),
    ts: Date.now(),
    ...extra,
  };
  // Normalise on the way in as well as on the way out, so what is stored is
  // exactly what will later be rendered.
  const reply = normalizeReply(message.replyTo);
  if (reply) message.replyTo = reply;
  else delete message.replyTo;
  return message;
}

/** Cap a quoted snippet; a quote is a pointer, not a second copy of the text. */
const MAX_SNIPPET = 240;

/** Drop a malformed `replyTo` rather than rendering whatever the file claims. */
function sanitiseMessage(m: StoredMessage): StoredMessage {
  if (m.replyTo === undefined) return m;
  const reply = normalizeReply(m.replyTo);
  if (!reply) {
    // Copy rather than delete, so no field is read only to be discarded.
    const cleaned: StoredMessage = { ...m };
    delete cleaned.replyTo;
    return cleaned;
  }
  return { ...m, replyTo: reply };
}

/**
 * Accept a reply reference only if it is well formed.
 *
 * `isMessage` deliberately ignores unknown fields, so a hand-edited transcript
 * could otherwise carry a `replyTo` of any shape and have it rendered straight
 * into the thread. Anything unrecognised is dropped, leaving the message
 * readable without its quote.
 */
function normalizeReply(value: unknown): ReplyRef | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (r.from !== "you" && r.from !== "agent") return null;
  if (typeof r.profile !== "string" || !r.profile) return null;
  if (typeof r.snippet !== "string") return null;
  return {
    id: r.id.slice(0, 200),
    from: r.from,
    profile: r.profile.slice(0, 200),
    snippet: clamp(r.snippet.slice(0, MAX_SNIPPET)),
  };
}

/** Read one profile's transcript. A missing file is an empty conversation. */
export async function readTranscript(profile: string): Promise<Transcript> {
  let raw: string;
  try {
    raw = await readFile(pathFor(profile), "utf8");
  } catch (err) {
    // An unroutable profile is a caller error and must not look like an empty log,
    // otherwise a typo silently wipes the operator's view of the conversation.
    if (err instanceof UnsafeProfileError) throw err;
    return { profile, messages: [], dropped: 0 };
  }

  let parsed: { messages?: unknown; dropped?: unknown };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    // A corrupt log must not take the endpoint down; the operator sees an empty
    // conversation rather than an error page.
    return { profile, messages: [], dropped: 0 };
  }

  if (!Array.isArray(parsed.messages)) return { profile, messages: [], dropped: 0 };

  // Re-trim defensively: a hand-edited or older file may exceed the cap.
  const all = parsed.messages.filter(isMessage).map(sanitiseMessage);
  const overflow = Math.max(0, all.length - MAX_MESSAGES);
  const carried = typeof parsed.dropped === "number" && parsed.dropped > 0 ? parsed.dropped : 0;

  return {
    profile,
    messages: overflow ? all.slice(overflow) : all,
    dropped: carried + overflow,
  };
}

export type AppendInput = {
  profile: string;
  outgoing: StoredMessage;
  incoming?: StoredMessage;
};

/**
 * Serialise read-modify-write per profile.
 *
 * Every write is read-modify-write, so two requests landing together both read
 * the same file and the second rename silently discards the first turn. An
 * audit log that loses a turn under concurrency is worse than useless, because
 * it looks complete. Keying by profile keeps one agent's slow write from
 * blocking another's.
 *
 * This is an in-process lock, which matches how the dashboard is served (a
 * single `next` process). Running several workers would need a lock file.
 */
const locks = new Map<string, Promise<void>>();

function withProfileLock<T>(profile: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(profile) ?? Promise.resolve();
  // Run whether or not the previous write settled: a failed write must not
  // wedge the queue for every later turn on that profile.
  const run = previous.then(fn, fn);
  locks.set(
    profile,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/** Merge new messages into a transcript, trimming the oldest turns. */
function merge(
  profile: string,
  current: Transcript,
  added: StoredMessage[],
): { kept: StoredMessage[]; dropped: number } {
  const combined = [...current.messages, ...added];
  const overflow = Math.max(0, combined.length - MAX_MESSAGES);
  return {
    kept: overflow ? combined.slice(overflow) : combined,
    dropped: current.dropped + overflow,
  };
}

/**
 * Append a single message and return the stored transcript.
 *
 * This is what makes the question durable: the route records the prompt here
 * *before* contacting the agent, so a crashed process, a killed tab or a host
 * that never answers still leaves "what was asked" on the record. The reply is
 * appended separately once it arrives, which means a transcript can legitimately
 * end on a question with no answer, and that gap is real information.
 */
export async function appendMessage(
  profile: string,
  message: StoredMessage,
): Promise<Transcript> {
  return withProfileLock(profile, async () => {
    const current = await readTranscript(profile);
    const { kept, dropped } = merge(profile, current, [message]);
    await writeTranscript(profile, kept, dropped);
    return { profile, messages: kept, dropped };
  });
}

/**
 * Append one exchange and return the stored transcript.
 *
 * Prefer `appendMessage` for a live turn: this writes both halves at once, so
 * the question is only on record once the agent has already finished.
 */
export async function appendExchange(input: AppendInput): Promise<Transcript> {
  return withProfileLock(input.profile, async () => {
    const current = await readTranscript(input.profile);
    const added = [input.outgoing, input.incoming].filter(
      (m): m is StoredMessage => m !== undefined,
    );
    const { kept, dropped } = merge(input.profile, current, added);
    await writeTranscript(input.profile, kept, dropped);
    return { profile: input.profile, messages: kept, dropped };
  });
}

export async function clearTranscript(profile: string): Promise<void> {
  // Under the same lock as appends: clearing mid-turn would otherwise let a
  // late reply resurrect a transcript the operator just deleted.
  await withProfileLock(profile, () => rm(pathFor(profile), { force: true }));
}

/** Profiles that currently have a stored conversation, for diagnostics. */
export async function listTranscripts(): Promise<string[]> {
  try {
    // turbopackIgnore: ROOT comes from ANIM_CHAT_STORE, so the bundler cannot
    // scope it. Without the opt-out it traces the whole project into the server
    // output, which buries the warnings that do matter.
    const files = await readdir(/*turbopackIgnore: true*/ ROOT);
    return files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length))
      .filter(isChatProfile);
  } catch {
    return [];
  }
}

export const CHAT_LIMITS = { maxMessages: MAX_MESSAGES, maxMessageChars: MAX_MESSAGE_CHARS };

export type { ChatProfile };
