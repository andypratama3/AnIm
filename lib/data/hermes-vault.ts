import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);

const VAULT_ROOT = "/home/bor/Documents/Obsidian/Hermes-Agent";
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 256 * 1024;

export type VaultDoc = {
  id: string;
  title: string;
  path: string;
  folder: string;
  bytes: number;
  updatedAt: number;
  body: string;
};

export type VaultState =
  | { mode: "live"; docs: VaultDoc[]; latencyMs: number }
  | { mode: "unavailable"; reason: string; latencyMs: number };

const SCRIPT = [
  "import json,os,time",
  `root=${JSON.stringify(VAULT_ROOT)}`,
  "out=[]",
  "for dp,dn,fn in os.walk(root):",
  "    dn[:] = [d for d in dn if not d.startswith('.')]",
  "    for f in sorted(fn):",
  "        if not f.endswith('.md'): continue",
  "        p = os.path.join(dp,f)",
  "        try:",
  "            st = os.stat(p)",
  "            rel = os.path.relpath(p,root)",
  "            top = rel.split(os.sep)[0]",
  "            folder = top if os.path.isdir(os.path.join(root,top)) and '.' not in top else 'Notes'",
  "            title = os.path.splitext(f)[0].replace('-',' ').replace('_',' ')",
  "            out.append({'id':rel.replace('/','__'),'title':title,'path':rel,'folder':folder,'bytes':st.st_size,'updatedAt':int(st.st_mtime*1000)})",
  "        except OSError:",
  "            pass",
  "print(json.dumps(out))",
].join("\n");

function metaOnly(): VaultState {
  return { mode: "unavailable", reason: "vault not on this host", latencyMs: 0 };
}

/**
 * Read-only listing of the real Hermes Obsidian vault on this host.
 * Bodies are read separately per note (capped); this lists metadata only.
 */
export async function listVaultDocs(): Promise<VaultState> {
  if (!existsSync(VAULT_ROOT)) return metaOnly();
  const started = Date.now();
  try {
    const { stdout } = await run("python3", ["-c", SCRIPT], {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BYTES,
      encoding: "utf8",
    });
    const docs = JSON.parse(stdout.trim()) as VaultDoc[];
    if (!Array.isArray(docs)) {
      return { mode: "unavailable", reason: "vault listing malformed", latencyMs: Date.now() - started };
    }
    return {
      mode: "live",
      docs: docs.map((d) => ({ ...d, body: "" })),
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      mode: "unavailable",
      reason: err instanceof Error ? err.message : "vault listing failed",
      latencyMs: Date.now() - started,
    };
  }
}

const BODY_CAP = 24_000;

/**
 * Read one vault note body by repo-relative path. The path is validated
 * against the live listing first, so `..` and absolute paths never reach
 * the filesystem.
 */
export async function readVaultDoc(rel: string): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  const listing = await listVaultDocs();
  if (listing.mode === "unavailable") return { ok: false, error: listing.reason };
  const match = listing.docs.find((d) => d.path === rel);
  if (!match) return { ok: false, error: "note not in the vault listing" };
  const script = [
    "import json",
    `root=${JSON.stringify(VAULT_ROOT)}`,
    `rel=${JSON.stringify(rel)}`,
    `cap=${BODY_CAP}`,
    "p = __import__('os').path.join(root, rel)",
    "data = open(p, encoding='utf-8', errors='replace').read()",
    "print(json.dumps(data[:cap]))",
  ].join("\n");
  try {
    const { stdout } = await run("python3", ["-c", script], {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BYTES,
      encoding: "utf8",
    });
    return { ok: true, body: JSON.parse(stdout.trim()) as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "note read failed" };
  }
}
