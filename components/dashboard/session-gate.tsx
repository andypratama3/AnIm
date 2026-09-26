"use client";

import { useCallback, useState } from "react";
import { LockKeyIcon, WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSession } from "@/components/providers/session-provider";

/**
 * Sign-in gate for the console.
 *
 * The API token is exchanged for an HttpOnly cookie by `/api/session`, so the
 * token itself never enters React state beyond the moment of submission and is
 * never present in page JavaScript.
 *
 * This reads the shared session state rather than fetching for itself: a 401
 * from a task review or an agent probe has to be able to put the whole console
 * behind this card, otherwise the shell keeps claiming to be connected while
 * every action it offers is refused.
 */

export function SessionGate({ children }: { children: React.ReactNode }) {
  const { state, refresh } = useSession();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
          await refresh();
          return;
        }
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        setError(body.error ?? "sign in failed");
        if (body.code === "auth_misconfigured") await refresh();
      } catch {
        setError("sign in request failed");
      } finally {
        setBusy(false);
      }
    },
    [token, refresh],
  );

  if (state === "checking") {
    return <div className="p-8 text-sm text-muted-foreground">Checking session…</div>;
  }

  if (state === "misconfigured") {
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <Card className="grid gap-4">
          <div className="flex items-center gap-2">
            <WarningIcon size={20} weight="bold" className="text-destructive" />
            <h2 className="text-base font-semibold">Server is not configured for writes</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            This deployment runs in production without <code>ANIM_API_TOKEN</code>, so every
            write is refused on purpose rather than left open. Set the token on the host and
            restart it; reading the mesh still works without it.
          </p>
        </Card>
      </div>
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
            This console can start agents on the mesh, so it needs the dashboard API token.
            It is exchanged for a secure session cookie and never stored in the browser.
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
