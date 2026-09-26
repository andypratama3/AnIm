"use client";

import { useCallback, useEffect, useState } from "react";
import { LockKeyIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Sign-in gate for the write-capable dashboard.
 *
 * The API token is exchanged for an HttpOnly cookie by `/api/session`, so the
 * token itself never enters React state beyond the moment of submission and is
 * never present in page JavaScript. Children only render once a session exists.
 */

type GateProps = {
  children: React.ReactNode;
};

export function SessionGate({ children }: GateProps) {
  const [state, setState] = useState<"checking" | "open" | "required">("checking");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const body = (await response.json()) as { authRequired?: boolean };
      // With no token configured the server does not require a session, so the
      // dashboard stays usable in local development.
      setState(body.authRequired ? "required" : "open");
    } catch {
      setState("open");
    }
  }, []);

  useEffect(() => {
    // Deferred so the effect body performs no synchronous setState.
    const kick = window.setTimeout(() => void check(), 0);
    return () => window.clearTimeout(kick);
  }, [check]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (response.ok) {
          setToken("");
          setState("open");
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "sign in failed");
      } catch {
        setError("sign in request failed");
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  if (state === "checking") {
    return (
      <div className="p-8 text-sm text-muted-foreground">Checking session…</div>
    );
  }

  if (state === "required") {
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <Card className="grid gap-4">
          <div className="flex items-center gap-2">
            <LockKeyIcon size={20} weight="bold" className="text-muted-foreground" />
            <h2 className="text-base font-semibold">Sign in required</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            This console can start agents on the mesh, so it needs the dashboard API
            token. It is exchanged for a secure session cookie and never stored in the
            browser.
          </p>
          <form onSubmit={submit} className="grid gap-3">
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="API token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              aria-label="API token"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={busy || !token.trim()}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
