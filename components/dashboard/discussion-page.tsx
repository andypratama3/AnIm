"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChatCircleDotsIcon,
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
  phase: Phase;
  updatedAt: number;
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

/** Owner inbox: only VERIFIED work is allowed to reach Andy. */
// Fixed epoch keeps the seed deterministic: Date.now() at module scope would make
// the server HTML and the client render disagree and break hydration.
const SEED_EPOCH = 1758800000000;

const OWNER_INBOX_SEED: WorkItem[] = [
  { id: "V-1", title: "19 new profiles created with 25 A2A peers each", owner: "hermes-operator", reviewer: "dashboard-engineer", phase: "VERIFIED", updatedAt: SEED_EPOCH - 1000 * 60 * 18 },
  { id: "V-2", title: "Pair-token matrix 26x25 rotated, 46 live pairs preserved", owner: "security-engineer", reviewer: "code-reviewer", phase: "VERIFIED", updatedAt: SEED_EPOCH - 1000 * 60 * 42 },
  { id: "V-3", title: "Dashboard throughput fabricated-metric defect", owner: "dashboard-engineer", reviewer: "code-reviewer", phase: "VERIFIED", updatedAt: SEED_EPOCH - 1000 * 60 * 6 },
  { id: "V-4", title: "Activation runbook for 19 stopped gateways", owner: "hermes-operator", reviewer: "devops-engineer", phase: "PEER_REVIEWED", updatedAt: SEED_EPOCH - 1000 * 60 * 95 },
  { id: "V-5", title: "Vault seed for 26 self-improvement logs", owner: "knowledge-agent", reviewer: "content-strategist", phase: "IN_PROGRESS", updatedAt: SEED_EPOCH - 1000 * 60 * 3 },
];

export function DiscussionPage() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [target, setTarget] = useState("default");
  const [profileQuery, setProfileQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logQuery, setLogQuery] = useState("");
  const [work, setWork] = useState<WorkItem[]>(OWNER_INBOX_SEED);
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
      id: `you-${Date.now()}`,
      from: "you",
      profile: target,
      text,
      ts: Date.now(),
    };
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setSending(true);

    try {
      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: target, prompt: text }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        reply?: string;
        error?: string;
        elapsedMs?: number;
      };

      setMessages((current) => [
        ...current,
        {
          id: `agent-${Date.now()}`,
          from: "agent",
          profile: target,
          text: body.ok ? (body.reply ?? "") : `Delivery failed: ${body.error ?? "unknown error"}`,
          ts: Date.now(),
          elapsedMs: body.elapsedMs,
          failed: !body.ok,
        },
      ]);

      if (body.ok) {
        toast.success(`${target} replied`, { description: `${((body.elapsedMs ?? 0) / 1000).toFixed(1)}s round trip` });
      } else {
        toast.error("No reply", { description: body.error });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "network failure";
      setMessages((current) => [
        ...current,
        {
          id: `agent-${Date.now()}`,
          from: "agent",
          profile: target,
          text: `Transport error: ${reason}`,
          ts: Date.now(),
          failed: true,
        },
      ]);
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
        item.phase.toLowerCase().includes(q),
    );
  }, [work, logQuery]);

  const verified = useMemo(() => visibleWork.filter((item) => item.phase === "VERIFIED"), [visibleWork]);
  const pending = useMemo(() => visibleWork.filter((item) => item.phase !== "VERIFIED"), [visibleWork]);

  const advance = useCallback((id: string) => {
    setWork((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const ladder: Phase[] = ["PROPOSED", "IN_PROGRESS", "SELF_CHECKED", "PEER_REVIEWED", "VERIFIED"];
        const index = ladder.indexOf(item.phase);
        const next = ladder[Math.min(index + 1, ladder.length - 1)];
        if (next === item.phase) return item;
        return { ...item, phase: next, updatedAt: Date.now() };
      }),
    );
    toast("Verification advanced", {
      description: "Owner only receives work once it reaches VERIFIED.",
    });
  }, []);

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
              <Button variant="primary" size="sm" onClick={() => void send()} disabled={sending || !prompt.trim()}>
                <PaperPlaneTiltIcon size={14} />
                {sending ? "waiting for agent…" : "Send"}
              </Button>
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
              {visibleMessages.length === 0 ? (
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
              <Button variant="ghost" size="xs" onClick={() => setWork(OWNER_INBOX_SEED.map((item) => ({ ...item })))}>
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
                    <Badge tone={PHASE_TONE[item.phase] as "ok"}>
                      <Dot tone="var(--ink-subtle)" />
                      {item.phase}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-ink-subtle">
                      {item.owner} → {item.reviewer}
                    </span>
                    <Button variant="subtle" size="xs" onClick={() => advance(item.id)}>
                      advance
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
        description="Peer discussion and delegation, read from the mesh event stream."
      >
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <ChatCircleDotsIcon size={22} className="text-ink-subtle" />
          <p className="text-[12.5px] text-ink-muted">
            Live A2A discussion capture is not wired to the event bus yet.
          </p>
          <p className="max-w-lg text-[11.5px] text-ink-subtle">
            The Activity route shows the current event stream. Once the gateway publishes A2A
            envelopes to a readable sink, this panel becomes the transcript view instead of a
            placeholder.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
