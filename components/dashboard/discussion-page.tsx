"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PaperPlaneTiltIcon,
  SealCheckIcon,
  ShieldWarningIcon,
  ArrowsClockwiseIcon,
  UserCircleIcon,
  CpuIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge, Dot } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/menus";
import { SectionCard, PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { writeJson } from "@/lib/api/write";
import { createTranscriptLoader, transcriptOutcome } from "@/lib/data/transcript-load";

/** Mirrors the acceptance ladder in agents/registry.json. */
type Phase = "PROPOSED" | "IN_PROGRESS" | "SELF_CHECKED" | "PEER_REVIEWED" | "VERIFIED" | "BLOCKED" | "FAILED";

type Message = {
  id: string;
  from: "you" | "agent";
  profile: string;
  text: string;
  ts: number;
  elapsedMs?: number;
  failed?: boolean;
};

type WorkItem = {
  id: string;
  title: string;
  owner: string;
  reviewer: string;
  state: Phase;
  updatedAt: number;
};

/**
 * The single legal next step for each phase. Mirrors TRANSITIONS in
 * lib/data/task-store.ts, which is the authority: the client only proposes, and
 * the server rejects anything else.
 */
const NEXT_PHASE: Record<Phase, Phase | undefined> = {
  PROPOSED: "IN_PROGRESS",
  IN_PROGRESS: "SELF_CHECKED",
  SELF_CHECKED: "PEER_REVIEWED",
  PEER_REVIEWED: "VERIFIED",
  VERIFIED: undefined,
  BLOCKED: "IN_PROGRESS",
  FAILED: "IN_PROGRESS",
};

const PHASE_TONE: Record<Phase, string> = {
  PROPOSED: "neutral",
  IN_PROGRESS: "brand",
  SELF_CHECKED: "neutral",
  PEER_REVIEWED: "warn",
  VERIFIED: "ok",
  BLOCKED: "warn",
  FAILED: "danger",
};

type A2AEntry = {
  ts: number;
  direction: "inbound" | "outbound";
  peer: string;
  taskId: string;
  summary: string;
};

function A2ATraffic() {
  const [entries, setEntries] = useState<A2AEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/a2a?limit=30", { cache: "no-store" });
        const body = (await response.json()) as {
          entries?: A2AEntry[];
          total?: number;
          reason?: string;
        };
        if (cancelled) return;
        if (Array.isArray(body.entries)) {
          setEntries(body.entries);
          setTotal(body.total ?? body.entries.length);
          setReason(null);
        } else {
          setReason(body.reason ?? "unavailable");
        }
      } catch {
        if (!cancelled) setReason("unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (reason) {
    return (
      <p className="py-6 text-center text-[12px] text-ink-subtle">
        A2A traffic unavailable: {reason}.
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-ink-subtle">
        No A2A exchanges recorded yet. Send two agents a task and it appears here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-ink-subtle">
        Last {entries.length} of {total} recorded exchanges, newest first.
      </p>
      <ul className="max-h-80 space-y-1.5 overflow-y-auto">
        {entries.map((entry) => (
          <li
            key={`${entry.taskId}-${entry.ts}`}
            className="flex items-start gap-2.5 rounded-xl border border-hairline bg-surface-2/50 px-3 py-2"
          >
            <span
              className={`mt-1 size-1.5 shrink-0 rounded-full ${
                entry.direction === "inbound" ? "bg-brand" : "bg-ok"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-[12px]">
                <span className="font-mono font-medium">{entry.peer}</span>
                <span className="text-ink-subtle">{entry.direction}</span>
                <span className="font-mono text-[10.5px] text-ink-subtle">
                  {new Date(entry.ts).toLocaleString("en-GB")}
                </span>
              </p>
              <p className="mt-0.5 break-words text-[12px] text-ink-muted">
                {entry.summary || entry.taskId}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}


function DiscussionConsole() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [target, setTarget] = useState("default");
  const [profileQuery, setProfileQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dropped, setDropped] = useState(0);
  const [loadingLog, setLoadingLog] = useState(false);
  const [logQuery, setLogQuery] = useState("");
  const [work, setWork] = useState<WorkItem[]>([]);
  const [queueBusy, setQueueBusy] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/agent-chat", { cache: "no-store" });
        const body = (await response.json()) as { profiles?: string[] };
        if (!cancelled && Array.isArray(body.profiles)) setProfiles(body.profiles);
      } catch {
        if (!cancelled) setProfiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The server owns the transcript, so switching agents loads that agent's
   * history instead of showing whatever the last one said. A 401 or an
   * unreadable body leaves the log empty rather than replaying another agent's
   * messages to an unauthenticated reader.
   *
   * Each load cancels the previous one. Switching agents quickly used to start
   * two requests, and whichever answered last won — so clicking through a few
   * profiles could leave the previous agent's conversation on screen under the
   * new agent's name. That is a wrong answer presented confidently, which is the
   * one thing an audit view must never do.
   */
  // useState with a lazy initialiser, not useRef(...).current: a ref read
  // during render is how a component ends up holding a stale loader.
  const [loader] = useState(createTranscriptLoader);

  const loadTranscript = useCallback(
    async (profile: string) => {
      const controller = loader.start();
      setLoadingLog(true);
      try {
        const response = await fetch(
          `/api/agent-chat?profile=${encodeURIComponent(profile)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await response.json().catch(() => ({}));
        const outcome = transcriptOutcome({
          superseded: !loader.isCurrent(controller),
          status: response.status,
          body,
        });
        if (outcome.kind === "ignore") return;
        if (outcome.kind === "clear") {
          setMessages([]);
          setDropped(0);
          return;
        }
        setMessages(outcome.messages as Message[]);
        setDropped(outcome.dropped);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!loader.isCurrent(controller)) return;
        setMessages([]);
        setDropped(0);
      } finally {
        if (loader.isCurrent(controller)) setLoadingLog(false);
      }
    },
    [loader],
  );

  useEffect(() => {
    // Deferred for the same reason as the queue below: the effect body itself
    // must not perform a synchronous setState.
    const kick = window.setTimeout(() => void loadTranscript(target), 0);
    return () => {
      window.clearTimeout(kick);
      loader.cancel();
    };
  }, [loadTranscript, target, loader]);

  const clearLog = useCallback(async () => {
    const profile = target;
    try {
      const response = await writeJson(
        `/api/agent-chat?profile=${encodeURIComponent(profile)}`,
        { method: "DELETE" },
      );
      if (!response.ok) return;
      setMessages([]);
      setDropped(0);
      toast.success(`Conversation with ${profile} cleared`);
    } catch {
      toast.error("Could not clear the conversation");
    }
  }, [target]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const filteredProfiles = useMemo(() => {
    const all = profiles.length ? profiles : ["default"];
    const q = profileQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((profile) => profile.includes(q));
  }, [profiles, profileQuery]);

  const send = useCallback(async () => {
    const text = prompt.trim();
    if (!text || sending) return;

    const userMessage: Message = {
      id: `pending-${Date.now()}`,
      from: "you",
      profile: target,
      text,
      ts: Date.now(),
    };
    // Shown immediately; replaced by the stored transcript once the server has
    // actually written it, so the log never disagrees with the file.
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setSending(true);

    /** Failures the server never stored are shown locally and flagged. */
    const appendLocalFailure = (label: string) =>
      setMessages((current) => [
        ...current,
        {
          id: `local-${Date.now()}`,
          from: "agent",
          profile: target,
          text: label,
          ts: Date.now(),
          failed: true,
        },
      ]);

    try {
      const response = await writeJson("/api/agent-chat", {
        json: { profile: target, prompt: text },
      });

      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        reply?: string;
        error?: string;
        elapsedMs?: number;
        transcript?: { messages: Message[]; dropped: number };
      };

      // Anything the server accepted and recorded replaces local state outright.
      if (body.transcript) {
        setMessages(body.transcript.messages);
        setDropped(body.transcript.dropped ?? 0);
      }

      // A 401 means the session expired rather than the agent failing, so say so
      // instead of reporting it as a delivery failure.
      if (response.status === 401) {
        const reason = "session expired - reload and sign in again";
        appendLocalFailure(`Not delivered: ${reason}`);
        toast.error("Sign in required", { description: reason });
        return;
      }

      if (response.status === 429 || response.status === 503) {
        const reason = body.error ?? "throttled";
        if (!body.transcript) appendLocalFailure(`Not delivered: ${reason}`);
        toast.error("Not delivered", { description: reason });
        return;
      }

      if (body.ok) {
        toast.success(`${target} replied`, {
          description: `${((body.elapsedMs ?? 0) / 1000).toFixed(1)}s round trip`,
        });
      } else {
        if (!body.transcript) {
          appendLocalFailure(`Delivery failed: ${body.error ?? "unknown error"}`);
        }
        toast.error("No reply", { description: body.error });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "network failure";
      appendLocalFailure(`Transport error: ${reason}`);
      toast.error("Transport error", { description: reason });
    } finally {
      setSending(false);
    }
  }, [prompt, sending, target]);

  const visibleMessages = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (message) =>
        message.text.toLowerCase().includes(q) || message.profile.toLowerCase().includes(q),
    );
  }, [messages, logQuery]);

  const visibleWork = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    if (!q) return work;
    return work.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.owner.toLowerCase().includes(q) ||
        item.reviewer.toLowerCase().includes(q) ||
        item.state.toLowerCase().includes(q),
    );
  }, [work, logQuery]);

  const verified = useMemo(() => visibleWork.filter((item) => item.state === "VERIFIED"), [visibleWork]);
  const pending = useMemo(() => visibleWork.filter((item) => item.state !== "VERIFIED"), [visibleWork]);

  const loadQueue = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      if (response.status === 401) return;
      const body = (await response.json()) as { tasks?: WorkItem[] };
      if (Array.isArray(body.tasks)) setWork(body.tasks);
    } catch {
      // Leave the queue empty rather than showing rows we cannot stand behind.
    }
  }, []);

  useEffect(() => {
    // Deferred so the effect body performs no synchronous setState.
    const kick = window.setTimeout(() => void loadQueue(), 0);
    return () => window.clearTimeout(kick);
  }, [loadQueue]);

  /**
   * Move one item along the ladder. The server owns the rules: it rejects a jump
   * that skips peer review, and it refuses to let the owner verify their own
   * work. The button names the exact next state instead of advancing blindly.
   */
  const advance = useCallback(
    async (id: string) => {
      const item = work.find((entry) => entry.id === id);
      if (!item || queueBusy) return;
      const next = NEXT_PHASE[item.state];
      if (!next) return;
      setQueueBusy(true);
      try {
        const response = await writeJson(`/api/tasks/${encodeURIComponent(id)}`, {
          method: "PATCH",
          json: { state: next, actor: item.reviewer },
        });
        const body = (await response.json()) as WorkItem & { error?: string };
        if (!response.ok) {
          toast.error("Transition rejected", { description: body.error ?? "unknown reason" });
          return;
        }
        setWork((current) => current.map((entry) => (entry.id === id ? body : entry)));
        toast.success(`${id} → ${next}`, {
          description:
            next === "VERIFIED"
              ? `Attributed to ${item.reviewer}. Named by the operator, not independently verified — this console holds one shared session.`
              : `Attributed to ${item.reviewer}, declared by the operator.`,
        });
      } catch {
        toast.error("Transition failed", { description: "could not reach the review store" });
      } finally {
        setQueueBusy(false);
      }
    },
    [work, queueBusy],
  );

  const resetQueue = useCallback(async () => {
    setQueueBusy(true);
    try {
      const response = await writeJson("/api/tasks", { method: "DELETE" });
      if (!response.ok) {
        toast.error("Reset rejected");
        return;
      }
      await loadQueue();
      toast.success("Review queue reset");
    } finally {
      setQueueBusy(false);
    }
  }, [loadQueue]);


  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Oversight"
        title="Discussion"
        description="Talk to any agent on the mesh, watch peer-to-peer work progress, and keep the owner inbox limited to independently verified results."
        meta={
          <>
            <Badge tone="ok">
              <SealCheckIcon size={12} />
              {verified.length} verified
            </Badge>
            <Badge tone="warn">{pending.length} awaiting review</Badge>
            <Badge tone="neutral">{profiles.length} addressable agents</Badge>
          </>
        }
      />

      <div className="grid grid-cols-1 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <SectionCard
          title="Agent channel"
          description="A real one-shot prompt against the profile's own SOUL, skills and peer wiring."
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div>
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                  Address
                </span>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="w-full font-mono text-[12.5px]" aria-label="Choose an agent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProfiles.map((profile) => (
                      <SelectItem key={profile} value={profile} className="font-mono text-[12.5px]">
                        {profile}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                  Find agent
                </span>
                <Input
                  value={profileQuery}
                  onChange={(event) => setProfileQuery(event.target.value)}
                  placeholder="filter by name…"
                  aria-label="Filter agents by name"
                />
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                Message
              </span>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={`Ask ${target} to report status, restate its task, or hand work to a peer…`}
                rows={4}
                className="w-full resize-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-ink-subtle">
                <kbd className="font-mono">⌘</kbd> + <kbd className="font-mono">Enter</kbd> to send
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => void clearLog()}
                  disabled={messages.length === 0}
                >
                  Clear log
                </Button>
                <Button variant="primary" size="sm" onClick={() => void send()} disabled={sending || !prompt.trim()}>
                  <PaperPlaneTiltIcon size={14} />
                  {sending ? "waiting for agent…" : "Send"}
                </Button>
              </div>
            </div>

            <Input
              value={logQuery}
              onChange={(event) => setLogQuery(event.target.value)}
              placeholder="search this conversation and the review queue…"
              aria-label="Search conversation and work items"
            />

            <div
              ref={logRef}
              className="max-h-[26rem] min-h-[12rem] space-y-2.5 overflow-y-auto rounded-2xl border border-hairline bg-surface-2/50 p-3"
            >
              {dropped > 0 ? (
                <p className="mb-1 rounded-lg bg-warn/8 px-2.5 py-1.5 text-[11px] text-warn">
                  {dropped} earlier {dropped === 1 ? "message was" : "messages were"} dropped to
                  keep this log bounded.
                </p>
              ) : null}
              {loadingLog ? (
                <p className="px-1 py-6 text-center text-[12px] text-ink-subtle">
                  Loading conversation with {target}…
                </p>
              ) : visibleMessages.length === 0 ? (
                <p className="px-1 py-6 text-center text-[12px] text-ink-subtle">
                  {logQuery.trim()
                    ? "Nothing in this conversation matches your search."
                    : "No messages yet. Ask an agent what it is working on, or ask it to review a peer's result."}
                </p>
              ) : (
                visibleMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-2.5 ${message.from === "you" ? "flex-row-reverse" : ""}`}
                  >
                    <span
                      className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
                        message.from === "you" ? "bg-brand/15 text-brand" : "bg-surface-3 text-ink-muted"
                      }`}
                    >
                      {message.from === "you" ? (
                        <UserCircleIcon size={15} />
                      ) : (
                        <CpuIcon size={15} />
                      )}
                    </span>
                    <div
                      className={`min-w-0 max-w-[85%] rounded-2xl px-3 py-2 ${
                        message.from === "you"
                          ? "bg-brand/12 text-ink"
                          : message.failed
                            ? "border border-danger/30 bg-danger/8 text-danger"
                            : "bg-surface-3 text-ink-muted"
                      }`}
                    >
                      <p className="mb-1 flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
                        <span className="font-mono">{message.profile}</span>
                        {message.elapsedMs ? (
                          <span className="font-mono">
                            {new Date(message.ts).toLocaleTimeString("en-GB")} · {(message.elapsedMs / 1000).toFixed(1)}s
                          </span>
                        ) : (
                          <span className="font-mono">{new Date(message.ts).toLocaleTimeString("en-GB")}</span>
                        )}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed">
                        {message.text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard
            title="Owner inbox"
            description="Only independently verified work is deliverable to Andy. Everything else stays here."
            actions={
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void resetQueue()}
                disabled={queueBusy}
              >
                <ArrowsClockwiseIcon size={13} />
                reset
              </Button>
            }
          >
            <div className="space-y-2">
              {verified.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-ok/25 bg-ok/6 px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-medium text-ink">{item.title}</p>
                    <Badge tone="ok">
                      <SealCheckIcon size={11} weight="fill" />
                      VERIFIED
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-ink-subtle">
                    {item.owner} → reviewed by {item.reviewer}
                  </p>
                </div>
              ))}
              {verified.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-ink-subtle">
                  Nothing verified yet. Owner stays empty until a peer reviewer signs off.
                </p>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="In review"
            description="Work that has not cleared peer review yet, so it is not deliverable."
          >
            <div className="space-y-2">
              {pending.map((item) => (
                <div key={item.id} className="rounded-2xl border border-hairline bg-surface-2/60 px-3.5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-[12.5px] text-ink-muted">{item.title}</p>
                    <Badge tone={PHASE_TONE[item.state] as "ok"}>
                      <Dot tone="var(--ink-subtle)" />
                      {item.state}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-ink-subtle">
                      {item.owner} → {item.reviewer}
                    </span>
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={() => void advance(item.id)}
                      disabled={queueBusy || !NEXT_PHASE[item.state]}
                    >
                      {NEXT_PHASE[item.state]
                        ? `advance to ${NEXT_PHASE[item.state]}`
                        : "terminal"}
                    </Button>
                  </div>
                </div>
              ))}
              {pending.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-ink-subtle">
                  Review queue is clear.
                </p>
              ) : null}
            </div>
          </SectionCard>

          <div className="flex items-start gap-2.5 rounded-2xl border border-hairline bg-surface-2/50 px-4 py-3.5 text-[11.5px] text-ink-subtle">
            <ShieldWarningIcon size={15} className="mt-0.5 shrink-0" />
            <p>
              A task is only deliverable after a named peer reproduces the result and marks it VERIFIED.
              SELF_CHECKED and PEER_REVIEWED are working states, not sign-off.
            </p>
          </div>
        </div>
      </div>

      <SectionCard
        title="What the agents are doing"
        description="Real A2A exchanges from the Hermes audit log on this host."
      >
        <A2ATraffic />
      </SectionCard>
    </div>
  );
}

export function DiscussionPage() {
  // The sign-in gate now wraps the whole console in the root layout, so a
  // refused write anywhere puts the operator back in front of that card.
  return <DiscussionConsole />;
}
