/**
 * Test double for `lib/data/agent-chat`.
 *
 * The real `chatWithProfile` shells out over SSH to the agent host, which a unit
 * test must never do. The stub keeps the real profile allowlist so the route
 * still validates addresses, and replaces only the remote call with one the test
 * can hold open — which is what makes "was the question on disk before the
 * agent was contacted?" an observable question rather than a guess.
 */
import * as real from "../../lib/data/agent-chat.ts";

export const CHATTABLE_PROFILES = real.CHATTABLE_PROFILES;
export const isChatProfile = real.isChatProfile;

/** Test-controlled behaviour of the stubbed agent call. */
export const agent = {
  /** When set, `chatWithProfile` waits on this before answering. */
  gate: null,
  /** Called the moment the agent is contacted, before the gate is awaited. */
  onContacted: null,
  reply: "the deploy finished at 14:02",
  throwWith: null,
  elapsedMs: 42,
};

export async function chatWithProfile(profile, prompt) {
  if (agent.onContacted) agent.onContacted({ profile, prompt });
  if (agent.gate) await agent.gate.promise;
  if (agent.throwWith) throw new Error(agent.throwWith);
  return {
    ok: true,
    profile,
    reply: agent.reply,
    elapsedMs: agent.elapsedMs,
  };
}

/** A deferred the test can resolve to release the agent call. */
export function gate() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return {
    promise,
    open: () => resolve(),
  };
}
