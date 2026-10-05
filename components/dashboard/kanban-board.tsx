"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import {
  CheckIcon,
  FlagIcon,
  PlusIcon,
  TrashIcon,
  ClockCounterClockwiseIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { COLUMNS, PRIORITY_TONE } from "@/lib/data/board";
import {
  useBoard,
  useCreateTask,
  useDeleteTask,
  useMoveTask,
} from "@/lib/hooks/use-data";
import { formatRelative } from "@/lib/format";
import { Badge, Kbd } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/menus";
import { SegmentedControl } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

const PRIORITIES: ReadonlyArray<{ value: TaskPriority; label: string }> = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

function priorityTone(priority: TaskPriority): "danger" | "warn" | "brand" | "neutral" {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warn";
  if (priority === "normal") return "brand";
  return "neutral";
}

function TaskCard({
  task,
  onOpen,
  onDelete,
  overlay,
  now,
}: {
  task: Task;
  onOpen: () => void;
  onDelete: () => void;
  overlay?: boolean;
  now?: number;
}) {
  // dnd-kit's documented pattern: the returned handle exposes a ref setter plus
  // transform/transition/attributes/listeners that must be read during render.
  const sortable = useSortable({ id: task.id, disabled: overlay });
  const style = overlay
    ? undefined
    : {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.35 : 1,
      };

  return (
    /* eslint-disable react-hooks/refs */
    <motion.article
      ref={sortable.setNodeRef}
      style={style}
      {...sortable.attributes}
      {...sortable.listeners}
      /* eslint-enable react-hooks/refs */
      layout={overlay ? false : "position"}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "plate-nested group relative cursor-grab rounded-xl p-3 active:cursor-grabbing",
        overlay && "rotate-2 shadow-lift",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">
            {task.title}
          </p>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="iconXs"
          onClick={onDelete}
          aria-label="Delete task"
          className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        >
          <TrashIcon size={13} />
        </Button>
      </div>

      {task.brief ? (
        <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-subtle">
          {task.brief}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={priorityTone(task.priority)} size="sm">
          <FlagIcon size={10} weight="fill" />
          {PRIORITY_TONE[task.priority].label}
        </Badge>
        <Badge tone="neutral" size="sm" className="font-mono">
          {task.agent}
        </Badge>
        {task.tags.slice(0, 2).map((tag) => (
          <Badge key={tag} tone="neutral" size="sm">
            {tag}
          </Badge>
        ))}
        {task.tags.length > 2 ? (
          <Badge tone="neutral" size="sm">
            +{task.tags.length - 2}
          </Badge>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-hairline pt-2 text-[10px] text-ink-subtle">
        <span className="inline-flex items-center gap-1">
          <ClockCounterClockwiseIcon size={11} />
          {formatRelative(task.updatedAt, now)}
        </span>
        <span className="inline-flex items-center gap-1 font-mono">
          {task.comments > 0 ? `${task.comments} notes · ` : ""}
          {task.estimate}h
        </span>
      </div>
    </motion.article>
  );
}

function Column({
  id,
  tasks,
  onOpen,
  onDelete,
  onCreate,
  now,
}: {
  id: TaskStatus;
  tasks: Task[];
  onOpen: (task: Task) => void;
  onDelete: (task: Task) => void;
  onCreate: () => void;
  now?: number;
}) {
  const column = COLUMNS.find((item) => item.id === id)!;
  const { setNodeRef, isOver } = useDroppable({ id: `column-${id}` });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-w-[17rem] flex-1 flex-col rounded-[1.5rem] border p-3 transition-colors duration-500",
        isOver ? "border-brand/40 bg-brand/5" : "border-hairline bg-surface-2/40",
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full" style={{ background: column.accent }} />
          <h2 className="text-[13px] font-semibold tracking-[-0.01em]">{column.label}</h2>
          <Badge tone="neutral" size="sm" className="font-mono">
            {tasks.length}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="iconXs"
          onClick={onCreate}
          aria-label="Add task"
        >
          <PlusIcon size={14} />
        </Button>
      </header>

      <p className="mb-3 px-1 text-[10.5px] leading-snug text-ink-subtle">{column.hint}</p>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              now={now}
              onOpen={() => onOpen(task)}
              onDelete={() => onDelete(task)}
            />
          ))}
          {tasks.length === 0 ? (
            <button
              type="button"
              onClick={onCreate}
              className="grid h-24 place-items-center rounded-xl border border-dashed border-hairline-strong text-[11px] text-ink-subtle transition-colors hover:border-brand/40 hover:text-ink"
            >
              drop here or add
            </button>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}

export function KanbanBoard({
  initialAgent,
  autoCreate,
}: {
  initialAgent?: string;
  autoCreate?: boolean;
}) {
  const { data, isLoading } = useBoard();
  const { move } = useMoveTask();
  const { create } = useCreateTask();
  const { remove } = useDeleteTask();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState<TaskStatus | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | TaskPriority>("all");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Deep link support: /kanban?new=1 (overview button, command palette) opens the
  // compose dialog. The flag is consumed once so a later refresh does not
  // re-open the dialog over the top of whatever the user is now doing.
  const autoCreateRef = useRef(autoCreate);
  useEffect(() => {
    if (autoCreateRef.current) {
      autoCreateRef.current = false;
      setCreating((current) => current ?? "backlog");
    }
  }, [autoCreate]);

  const allTasks = data?.tasks ?? [];
  const tasks = filter === "all"
    ? allTasks
    : filter === "mine"
      ? allTasks.filter((task) => task.agent === initialAgent)
      : allTasks.filter((task) => task.priority === filter);

  const active = allTasks.find((task) => task.id === activeId);

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith("column-")) return;
    setActiveId(id);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active: dragging, over } = event;
    if (!over) return;
    const dragId = String(dragging.id);
    if (dragId.startsWith("column-")) return;

    const overId = String(over.id);
    const targetStatus = overId.startsWith("column-")
      ? (overId.replace("column-", "") as TaskStatus)
      : allTasks.find((task) => task.id === overId)?.status;

    if (!targetStatus) return;
    const current = allTasks.find((task) => task.id === dragId);
    if (!current || current.status === targetStatus) return;

    const result = await move(dragId, targetStatus);
    const label = COLUMNS.find((c) => c.id === targetStatus)?.label ?? targetStatus;
    if (!result.ok) {
      // Hermes moves its own work; the console only holds the one transition it
      // exposes. Say so plainly rather than leaving the card where it was with
      // no explanation.
      toast.error(`Cannot move to ${label}`, {
        description: result.detail ?? result.reason,
      });
      return;
    }
    toast.success(`${current.title} → ${label}`, {
      description: `Assigned to ${current.agent}.`,
    });
  };

  const confirmDelete = async (task: Task) => {
    const result = await remove(task.id);
    if (!result.ok) {
      // Hermes keeps work in flight on its own board; the console refuses to
      // make a task look deleted when it is still running somewhere.
      toast.error("Cannot remove task", { description: result.detail ?? result.reason });
      return;
    }
    toast.success("Task removed", { description: task.title });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: allTasks.length },
            ...PRIORITIES.map((priority) => ({
              value: priority.value,
              label: priority.label,
              count: allTasks.filter((task) => task.priority === priority.value).length,
            })),
          ]}
        />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-subtle">
          <Kbd>drag</Kbd> to move
          <Kbd>click</Kbd> to inspect
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((column) => (
            <Column
              key={column.id}
              id={column.id}
              now={data?.generatedAt}
              tasks={tasks.filter((task) => task.status === column.id)}
              onOpen={setEditing}
              onDelete={(task) => void confirmDelete(task)}
              onCreate={() => setCreating(column.id)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.32,0.72,0,1)" }}>
          {active ? (
            <div className="w-[17rem]">
              <TaskCard task={active} overlay onOpen={() => undefined} onDelete={() => undefined} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {isLoading && !data ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-72 animate-pulse rounded-[1.5rem] bg-surface-2/60" />
          ))}
        </div>
      ) : null}

      <TaskDialog
        open={Boolean(editing)}
        task={editing}
        onClose={() => setEditing(null)}
        onDelete={async () => {
          if (editing) await confirmDelete(editing);
          setEditing(null);
        }}
      />

      <TaskDialog
        open={Boolean(creating)}
        status={creating ?? "backlog"}
        agents={allTasks.map((task) => task.agent)}
        defaultAgent={initialAgent}
        onClose={() => setCreating(null)}
        onSubmit={async (input) => {
          const result = await create(input);
          setCreating(null);
          if (!result.ok) {
            toast.error("Task not created", { description: result.reason });
            return;
          }
          toast.success("Task created", { description: input.title });
        }}
      />
    </>
  );
}

function TaskDialog({
  open,
  task,
  status,
  agents = [],
  defaultAgent,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  task?: Task | null;
  status?: TaskStatus;
  agents?: string[];
  defaultAgent?: string;
  onClose: () => void;
  onSubmit?: (input: {
    title: string;
    brief: string;
    priority: TaskPriority;
    agent: string;
    status: TaskStatus;
    tags: string[];
    estimate: number;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [agent, setAgent] = useState(defaultAgent ?? "default");
  const [column, setColumn] = useState<TaskStatus>(status ?? "backlog");
  const [tags, setTags] = useState("");
  const [estimate, setEstimate] = useState(2);
  const [busy, setBusy] = useState(false);

  const seed = task?.title ?? "";
  const isNew = !task;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTitle("");
          setBrief("");
          setTags("");
          setPriority("normal");
          setEstimate(2);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "New task" : task?.title}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Dispatch work to a peer. It appears on the board immediately."
              : task?.brief || "Inspect and re-route this unit of work."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Title">
            <Input
              id="task-title"
              value={isNew ? title : seed}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Reconcile vault notes with mesh state"
              readOnly={!isNew}
            />
          </Field>

          <Field label="Brief">
            <Textarea
              id="task-brief"
              value={isNew ? brief : (task?.brief ?? "")}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="What should the peer do, and what does done look like?"
              rows={3}
              readOnly={!isNew}
            />
          </Field>

          <div className="grid grid-cols-1 grid gap-3 sm:grid-cols-2">
            <Field label="Priority">
              <Select
                value={isNew ? priority : task?.priority}
                onValueChange={(value) => setPriority(value as TaskPriority)}
                disabled={!isNew}
              >
                <SelectTrigger>
                  <FlagIcon size={14} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Column">
              <Select
                value={isNew ? column : task?.status}
                onValueChange={(value) => setColumn(value as TaskStatus)}
                disabled={!isNew}
              >
                <SelectTrigger>
                  <CheckIcon size={14} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMNS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Peer">
              <Select value={isNew ? agent : task?.agent} onValueChange={setAgent} disabled={!isNew}>
                <SelectTrigger>
                  <UserCircleIcon size={14} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(agents.length > 0 ? agents : ["default"]).map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Estimate (hours)">
              <Input
                type="number"
                min={1}
                max={40}
                value={isNew ? estimate : (task?.estimate ?? 2)}
                onChange={(event) => setEstimate(Number(event.target.value))}
                disabled={!isNew}
              />
            </Field>
          </div>

          <Field label="Tags" hint="comma separated">
            <Input
              value={isNew ? tags : (task?.tags.join(", ") ?? "")}
              onChange={(event) => setTags(event.target.value)}
              placeholder="vault, audit"
              readOnly={!isNew}
            />
          </Field>

          {isNew ? (
            <Button
              variant="primary"
              className="w-full"
              disabled={!title.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSubmit?.({
                    title: title.trim(),
                    brief: brief.trim(),
                    priority,
                    agent,
                    status: column,
                    tags: tags
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                    estimate,
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <PlusIcon size={15} weight="bold" />
              {busy ? "Creating…" : "Create task"}
            </Button>
          ) : null}
        </div>

        {!isNew && onDelete ? (
          <DialogFooter>
            <Button variant="danger" size="sm" onClick={() => void onDelete()}>
              <TrashIcon size={14} />
              Delete
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function KanbanBoardPage() {
  return <KanbanBoard />;
}
