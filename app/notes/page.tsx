"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "motion/react";
import {
  NotebookIcon,
  MagnifyingGlassIcon,
  FolderSimpleIcon,
  PushPinIcon,
  CopyIcon,
  CheckIcon,
  ArrowsOutSimpleIcon,
  TagIcon,
  HardDrivesIcon,
} from "@phosphor-icons/react";
import { useNotes } from "@/lib/hooks/use-data";
import { useCopyToClipboard, useDebouncedValue } from "@/lib/hooks/use-ui";
import { VAULT_PATH } from "@/lib/data/profiles";
import { formatBytes, formatRelative } from "@/lib/format";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Reader for one vault note. Keyed by note path at the call site, so
 * selecting another note remounts this component and its state resets
 * without any render-time setState. The listing carries metadata only;
 * the body is fetched from /api/notes?path= on mount.
 */
function NoteReader({ path }: { path: string }) {
  const [body, setBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, copy] = useCopyToClipboard();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/notes?path=${encodeURIComponent(path)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { note?: { body?: string } };
        if (!cancelled && typeof payload.note?.body === "string") {
          setBody(payload.note.body);
        } else if (!cancelled) {
          setBody(null);
        }
      } catch {
        if (!cancelled) setBody(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (loading) {
    return (
      <p className="px-5 py-10 text-center text-[12px] text-ink-subtle">
        Loading note from the vault…
      </p>
    );
  }

  if (body == null) {
    return (
      <EmptyState
        icon={<NotebookIcon size={22} />}
        title="Note unreadable"
        description="The listing is live but this body could not be read from disk."
      />
    );
  }

  return (
    <>
      <div className="flex justify-end px-5 pt-3 sm:px-7">
        <Button
          variant="primary"
          size="sm"
          onClick={async () => {
            await copy(body);
            toast.success("Markdown copied", { description: path });
          }}
        >
          {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
          Copy markdown
        </Button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      >
        <article className="prose-anim max-h-[46rem] overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Headings are demoted by one level on purpose. The page's own
            // <h1> is "Notes", so a note whose body opens with `# Title` —
            // which is how most vault notes are written — would otherwise
            // render a second <h1> and flatten the outline.
            h1: ({ children }) => (
              <h2 className="mt-0 text-[17px] font-semibold tracking-[-0.02em]">
                {children}
              </h2>
            ),
            h2: ({ children }) => (
              <h3 className="mt-7 text-[15px] font-semibold tracking-[-0.02em]">
                {children}
              </h3>
            ),
            h3: ({ children }) => (
              <h4 className="mt-5 text-[14px] font-semibold text-ink">{children}</h4>
            ),
            p: ({ children }) => (
              <p className="mt-3 text-[13.5px] leading-[1.75] text-ink-muted">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="mt-3 space-y-1.5 pl-1 text-[13.5px] text-ink-muted">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] text-ink-muted">
                {children}
              </ol>
            ),
            li: ({ children }) => <li className="leading-[1.7]">{children}</li>,
            code: ({ children }) => (
              <code className="rounded-lg bg-surface-3 px-1.5 py-0.5 font-mono text-[12px] text-ink">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-hairline bg-surface-2/70 p-4 font-mono text-[12px] leading-relaxed text-ink">
                {children}
              </pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="mt-4 border-l-2 border-brand/50 bg-brand/5 py-2 pl-4 text-[13px] italic text-ink-muted">
                {children}
              </blockquote>
            ),
            a: ({ children, href }) => (
              <a
                href={href}
                className="text-brand underline-offset-4 transition-colors hover:text-brand-2 hover:underline"
              >
                {children}
              </a>
            ),
            table: ({ children }) => (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px]">{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border-b border-hairline px-3 py-2 text-left font-semibold text-ink">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-b border-hairline px-3 py-2 text-ink-muted">
                {children}
              </td>
            ),
            hr: () => <hr className="my-6 border-hairline" />,
          }}
        >
          {body}
        </ReactMarkdown>
        </article>
      </motion.div>
    </>
  );
}

export default function NotesPage() {
  const [folder, setFolder] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const debounced = useDebouncedValue(query, 220);
  const { data, isLoading } = useNotes({ q: debounced });

  const notes = useMemo(() => data?.notes ?? [], [data]);
  const folders = useMemo(
    () => data?.folders ?? Array.from(new Set(notes.map((note) => note.folder))),
    [data, notes],
  );
  const live = (data as { source?: { live?: boolean } } | undefined)?.source?.live !== false;

  const visible = useMemo(
    () => (folder === "all" ? notes : notes.filter((note) => note.folder === folder)),
    [notes, folder],
  );

  const current = useMemo(
    () => notes.find((note) => note.id === (selected ?? visible[0]?.id)) ?? visible[0],
    [notes, selected, visible],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow"
        title="Notes"
        description="The real Hermes Obsidian vault on this host, read-only. Selecting a note loads its body from disk; search filters the live listing."
        meta={
          <>
            <Badge tone="brand">
              <HardDrivesIcon size={12} />
              <span className="font-mono">{VAULT_PATH}</span>
            </Badge>
            <Badge tone={live ? "ok" : "warn"}>{live ? "vault live" : "vault unreachable"}</Badge>
            <Badge tone="neutral">{notes.length} notes</Badge>
            <Badge tone="neutral">
              {formatBytes(notes.reduce((sum, note) => sum + note.bytes, 0))}
            </Badge>
          </>
        }
        actions={
          <Button
            variant="glass"
            size="sm"
            onClick={() => setWide(!wide)}
          >
            <ArrowsOutSimpleIcon size={15} />
            {wide ? "Narrow" : "Focus"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
        <SectionCard
          title="Notes"
          description="Newest first"
          padding="none"
          className={cn("h-fit", wide && "lg:hidden")}
        >
          <div className="space-y-2 px-3 pb-3">
            <div className="relative pt-3">
              <MagnifyingGlassIcon
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 translate-y-[6px] text-ink-subtle"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search titles, tags, body…"
                className="h-8 pl-8 text-[12px]"
              />
            </div>

            <SegmentedControl
              size="xs"
              value={folder}
              onChange={setFolder}
              options={[
                { value: "all", label: "All", count: notes.length },
                ...folders.map((item: string) => ({
                  value: item,
                  label: item,
                  count: notes.filter((note) => note.folder === item).length,
                })),
              ]}
            />

            {isLoading && !data ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-xl bg-surface-2/70" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <EmptyState
                icon={<NotebookIcon size={22} />}
                title="No notes match"
                description="Try a different folder or clear the search."
              />
            ) : (
              <ul className="max-h-[34rem] space-y-1 overflow-y-auto">
                <AnimatePresence initial={false} mode="popLayout">
                  {visible.map((note) => (
                    <motion.li
                      key={note.id}
                      layout="position"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(note.id)}
                        className="relative w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-300 hover:bg-surface-2/70"
                      >
                        {current?.id === note.id ? (
                          <motion.span
                            layoutId="note-active-glow"
                            className="absolute inset-0 rounded-xl bg-brand/10 ring-1 ring-brand/40 shadow-[0_0_32px_-8px_var(--brand)]"
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          />
                        ) : null}
                        <span className="relative">
                          <span className="flex items-center gap-1.5">
                            {note.pinned ? (
                              <PushPinIcon size={11} weight="fill" className="text-brand" />
                            ) : null}
                            <span className="truncate text-[13px] font-medium text-ink">
                              {note.title}
                            </span>
                          </span>
                          <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-ink-subtle">
                            {note.excerpt}
                          </p>
                          <span className="mt-1.5 flex items-center gap-2 text-[10px] text-ink-subtle">
                            <span className="inline-flex items-center gap-1">
                              <FolderSimpleIcon size={10} />
                              {note.folder}
                            </span>
                            <span className="font-mono">{formatRelative(note.updatedAt, data?.generatedAt)}</span>
                          </span>
                        </span>
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={current?.title ?? "Reader"}
          description={current?.path}
          padding="none"
          className={cn(
            current &&
              "shadow-[0_0_80px_-28px_var(--brand)] ring-1 ring-brand/25",
          )}
          actions={
            current ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {current.tags.map((tag) => (
                  <Badge key={tag} tone="neutral" size="sm">
                    <TagIcon size={10} />
                    {tag}
                  </Badge>
                ))}
                <Badge tone="neutral" size="sm" className="font-mono">
                  {formatBytes(current.bytes)}
                </Badge>
              </div>
            ) : null
          }
        >
          {current ? (
            <NoteReader key={current.id} path={current.path} />
          ) : (
            <EmptyState
              icon={<NotebookIcon size={22} />}
              title="Nothing to read"
              description="Select a note on the left to read it here."
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
