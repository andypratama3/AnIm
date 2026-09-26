"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  canWrite,
  reportAuthFailure,
  setSessionEscalation,
  stateFromProbe,
  type SessionState,
} from "@/lib/session/auth-state";

export { reportAuthFailure, type SessionState };

/**
 * Session state for the whole console, in one place.
 *
 * The gate used to live inside the discussion page, so a 401 from any other
 * write — reviewing a task, probing an agent — left the UI reporting itself as
 * connected while every action failed. A supervision console that looks
 * connected but cannot act is worse than one that admits it is signed out.
 *
 * Non-React code (the fetch helpers) reports failures through
 * `reportAuthFailure`, which is why this module keeps a module-level hook
 * rather than relying on context alone.
 */

type SessionContextValue = {
  state: SessionState;
  /** Re-ask the server. Called after a successful sign-in. */
  refresh: () => Promise<void>;
  /** True when the console can perform writes right now. */
  canWrite: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>("checking");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const body = (await response.json()) as {
        authRequired?: boolean;
        authenticated?: boolean;
        misconfigured?: boolean;
      };
      setState(stateFromProbe(body));
    } catch {
      // If the session endpoint itself is unreachable there is nothing to sign
      // in to; let the page render and let the individual reads surface it.
      setState("open");
    }
  }, []);

  useEffect(() => {
    setSessionEscalation(setState);
    return () => setSessionEscalation(null);
  }, []);

  useEffect(() => {
    // Deferred so the effect body performs no synchronous setState.
    const kick = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(kick);
  }, [refresh]);

  const value = useMemo<SessionContextValue>(
    () => ({ state, refresh, canWrite: canWrite(state) }),
    [state, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
