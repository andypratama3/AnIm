import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);

const AUDIT_LOG = "/home/bor/.hermes/a2a_audit.jsonl";
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 256 * 1024;
const MAX_ROWS = 120;

export type A2AEntry = {
  ts: number;
  direction: "inbound" | "outbound";
  peer: string;
  taskId: string;
  summary: string;
};

export type A2AState =
  | { mode: "live"; entries: A2AEntry[]; total: number; latencyMs: number }
  | { mode: "unavailable"; reason: string; latencyMs: number };

const SCRIPT = [
  "import json",
  `path=${JSON.stringify(AUDIT_LOG)}`,
  `limit=${MAX_ROWS}`,
  "rows=[]",
  "try:",
  "    fh=open(path, encoding='utf-8', errors='replace')",
  "except OSError:",
  "    print(json.dumps({'rows':[],'total':0}))",
  "    raise SystemExit",
  "total=0",
  "for line in fh:",
  "    line=line.strip()",
  "    if not line: continue",
  "    total+=1",
  "    try: d=json.loads(line)",
  "    except Exception: continue",
  "    rows.append(d)",
  "rows=rows[-limit:]",
  "print(json.dumps({'rows':rows,'total':total}))",
].join("\n");

/**
 * Read-only tail of the Hermes A2A audit log on this host.
 * The log records peer, direction, task id and a short summary per exchange —
 * it is the only real A2A traffic record the host keeps.
 */
export async function readA2AAudit(): Promise<A2AState> {
  if (!existsSync(AUDIT_LOG)) {
    return { mode: "unavailable", reason: "a2a audit log not on this host", latencyMs: 0 };
  }
  const started = Date.now();
  try {
    const { stdout } = await run("python3", ["-c", SCRIPT], {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BYTES,
      encoding: "utf8",
    });
    const parsed = JSON.parse(stdout.trim()) as { rows: unknown[]; total: number };
    const entries: A2AEntry[] = [];
    for (const row of parsed.rows ?? []) {
      if (typeof row !== "object" || row === null) continue;
      const r = row as Record<string, unknown>;
      const direction = r.direction === "inbound" ? "inbound" : "outbound";
      if (typeof r.peer !== "string" || typeof r.task_id !== "string") continue;
      const ts = typeof r.ts === "number" ? r.ts * 1000 : Date.now();
      entries.push({
        ts,
        direction,
        peer: r.peer,
        taskId: r.task_id,
        summary: typeof r.summary === "string" ? r.summary.slice(0, 280) : "",
      });
    }
    return { mode: "live", entries, total: parsed.total ?? entries.length, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      mode: "unavailable",
      reason: err instanceof Error ? err.message : "a2a audit read failed",
      latencyMs: Date.now() - started,
    };
  }
}
