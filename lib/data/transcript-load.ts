/**
 * Deciding what a transcript response is allowed to do to the screen.
 *
 * Two failure modes made this worth pulling out of the component. Switching
 * agents started a new request without cancelling the old one, so whichever
 * answered last won and the previous agent's conversation could appear under the
 * new agent's name. And a response the client did not recognise left the
 * previous agent's messages on screen untouched, which looks like a real
 * transcript for an agent that has none.
 *
 * Both are the same mistake: showing a confident answer the data does not
 * support.
 */

/** A stored turn, as the transcript endpoint returns it. */
export type StoredMessage = {
  id: string;
  from: "you" | "agent";
  profile: string;
  text: string;
  ts: number;
  elapsedMs?: number;
  failed?: boolean;
};

export type TranscriptOutcome =
  /** Render these messages for the agent just requested. */
  | { kind: "apply"; messages: StoredMessage[]; dropped: number }
  /** The response is not trustworthy; show nothing rather than something stale. */
  | { kind: "clear" }
  /** A newer request owns the state; leave the screen alone. */
  | { kind: "ignore" };

/**
 * Owns the in-flight transcript request for one component.
 *
 * `start` cancels the previous request, and `isCurrent` decides whether a
 * response that has already arrived is still the one the screen should show.
 */
export function createTranscriptLoader() {
  let current: AbortController | null = null;

  return {
    start(): AbortController {
      current?.abort();
      current = new AbortController();
      return current;
    },
    /** True when this controller is still the newest request and not aborted. */
    isCurrent(controller: AbortController): boolean {
      return current === controller && !controller.signal.aborted;
    },
    /** Called on unmount or profile change so no late response can land. */
    cancel(): void {
      current?.abort();
      current = null;
    },
  };
}

export function transcriptOutcome(input: {
  /** The request was superseded or cancelled. */
  superseded: boolean;
  status: number;
  body: unknown;
}): TranscriptOutcome {
  if (input.superseded) return { kind: "ignore" };
  // Only a successful response is allowed to paint the log. A 401 means the
  // reader is not authenticated and a 503 means the agent bridge is down; both
  // can arrive carrying a body that looks exactly like a transcript, and
  // rendering either one would invent a conversation nobody had.
  if (input.status < 200 || input.status >= 300) return { kind: "clear" };

  const body = input.body as { messages?: unknown; dropped?: unknown } | null;
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    // An unrecognised body means we do not know what this agent said.
    return { kind: "clear" };
  }

  return {
    kind: "apply",
    messages: body.messages as StoredMessage[],
    dropped: typeof body.dropped === "number" ? body.dropped : 0,
  };
}
