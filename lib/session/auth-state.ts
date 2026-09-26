/**
 * Session state transitions, with no React in sight.
 *
 * This lives apart from the provider so the escalation rules can be tested
 * directly: node's type stripping reads `.ts` but not the JSX in a `.tsx`, and
 * more importantly these are rules about *when the console is allowed to claim
 * to be connected*, which deserve to be stated once.
 */

export type SessionState =
  /** Still asking the server whether a session is needed. */
  | "checking"
  /** No token is configured, or a valid session cookie is held. */
  | "open"
  /** A token is configured and this browser has no session. */
  | "required"
  /** Production without `ANIM_API_TOKEN`: writes are refused by design. */
  | "misconfigured";

type Escalate = (state: SessionState) => void;

let escalate: Escalate | null = null;

/**
 * Registered by the provider, and by tests, so plain functions can escalate an
 * auth failure without a React hook in scope.
 */
export function setSessionEscalation(fn: Escalate | null): void {
  escalate = fn;
}

/**
 * Turn a refused write into the state the console should show.
 *
 * The `misconfigured` flag is explicit because 503 is overloaded: the rate
 * limiter and the concurrency ceiling both return it, and neither is a reason
 * to sign the operator out.
 */
export function nextStateForFailure(status: number, misconfigured: boolean): SessionState | null {
  if (misconfigured) return "misconfigured";
  if (status === 401 || status === 403) return "required";
  return null;
}

/** Tell the console that a write was refused because of session state. */
export function reportAuthFailure(status: number, misconfigured = false): void {
  const next = nextStateForFailure(status, misconfigured);
  if (next) escalate?.(next);
}

/** True when the console can perform writes right now. */
export function canWrite(state: SessionState): boolean {
  return state === "open";
}

/**
 * Decide what the console should show from one `/api/session` response.
 *
 * With no token configured the answer is always "open": that is a legitimate
 * local-development state, not a failure to authenticate.
 */
export function stateFromProbe(body: {
  authRequired?: boolean;
  authenticated?: boolean;
  misconfigured?: boolean;
}): SessionState {
  if (body.misconfigured) return "misconfigured";
  if (body.authRequired && !body.authenticated) return "required";
  return "open";
}
