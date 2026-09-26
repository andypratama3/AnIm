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
    // The console still renders. Reads are open by design — `/api/mesh` and
    // `/api/mesh-live` carry no secrets — so replacing the app with a card
    // would hide the one thing an operator can still usefully look at, while
    // telling them to go and set a token they may not be allowed to set. The
    // server already refuses the writes; this says so where the work happens
    // rather than walling the page off.
    return (
      <div className="min-h-[100dvh]">
        <div
          role="status"
          className="border-b border-hairline bg-surface-2/70 px-4 py-2.5 sm:px-6"
        >
          <div className="mx-auto flex w-full max-w-[110rem] items-start gap-2.5">
            <WarningIcon
              size={17}
              weight="bold"
              className="mt-px shrink-0 text-destructive"
            />
            <p className="min-w-0 text-[13px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">Writes are disabled.</span> This
              deployment runs in production without <code>ANIM_API_TOKEN</code>, so every write is
              refused on purpose rather than left open. Reading the mesh still works. Set the token
              on the host to re-enable it.
            </p>
          </div>
        </div>
        {children}
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
