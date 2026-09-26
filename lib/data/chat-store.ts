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

export type StoredMessage = {
  id: string;
  from: ChatRole;
  profile: string;
  text: string;
  ts: number;
  elapsedMs?: number;
  failed?: boolean;
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
  extra: { elapsedMs?: number; failed?: boolean } = {},
): StoredMessage {
  return {
    id: `${from}-${randomUUID()}`,
    from,
    profile,
    text: clamp(text),
    ts: Date.now(),
    ...extra,
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
  const all = parsed.messages.filter(isMessage);
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
 * Append one exchange and return the stored transcript.
 *
 * The user's message is written *before* the agent is called so a crash or a
 * timeout still leaves the question on record. Losing the reply is recoverable;
 * losing what was asked is not.
 */
export async function appendExchange(input: AppendInput): Promise<Transcript> {
  const current = await readTranscript(input.profile);
  const added = [input.outgoing, input.incoming].filter(
    (m): m is StoredMessage => m !== undefined,
  );

  const combined = [...current.messages, ...added];
  const overflow = Math.max(0, combined.length - MAX_MESSAGES);
  const kept = overflow ? combined.slice(overflow) : combined;
  const dropped = current.dropped + overflow;

  await writeTranscript(input.profile, kept, dropped);
  return { profile: input.profile, messages: kept, dropped };
}

export async function clearTranscript(profile: string): Promise<void> {
  await rm(pathFor(profile), { force: true });
}

/** Profiles that currently have a stored conversation, for diagnostics. */
export async function listTranscripts(): Promise<string[]> {
  try {
    const files = await readdir(ROOT);
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
