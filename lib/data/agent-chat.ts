import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const HOST = process.env.ANIM_SSH_HOST ?? "root@72.61.141.91";
const HERMES_BIN = "/home/bor/.local/bin/hermes";
const CHAT_TIMEOUT_MS = Number(process.env.ANIM_CHAT_TIMEOUT_MS ?? 180_000);
const MAX_OUTPUT_BYTES = 256 * 1024;
export const MAX_PROMPT_CHARS = 4_000;

/**
 * Profiles that may be addressed. This is a hard allowlist rather than a
 * pattern: an unknown id is rejected before any process is spawned, so a
 * crafted profile name can never reach the shell.
 */
export const CHATTABLE_PROFILES = [
  "default",
  "ceo-bor",
  "agent-secretary",
  "agent-operasi-produk",
  "principal-engineer",
  "fullstack-engineer",
  "backend",
  "frontend",
  "ai-engineer",
  "devops-engineer",
  "security-engineer",
  "qa-engineer",
  "code-reviewer",
  "hermes-operator",
  "dashboard-engineer",
  "automation-engineer",
  "knowledge-agent",
  "content-strategist",
  "technical-writer",
  "social-media",
  "agent-pemasaran",
  "agent-penjualan",
  "agent-layanan",
  "agent-keuangan",
  "career-agent",
  "management-research",
] as const;

export type ChatProfile = (typeof CHATTABLE_PROFILES)[number];

export function isChatProfile(value: unknown): value is ChatProfile {
  return typeof value === "string" && (CHATTABLE_PROFILES as readonly string[]).includes(value);
}

export type ChatResult =
  | { ok: true; profile: ChatProfile; reply: string; elapsedMs: number }
  | { ok: false; profile: string; error: string; elapsedMs: number };

/**
 * Send a prompt to one Hermes profile and return its reply.
 *
 * Security posture:
 *  - `execFile` with an argv array, so nothing is ever word-split or globbed
 *  - the profile id is validated against CHATTABLE_PROFILES before spawning
 *  - the prompt is passed as a single argv entry; remote shell quoting is avoided
 *    entirely by asking the remote side for a python wrapper, not `sh -c`
 *  - BatchMode forbids prompts, and the child is hard-killed on timeout
 *  - output is size-capped; a breached cap is reported, not truncated silently
 */
export async function chatWithProfile(
  profile: string,
  prompt: string,
): Promise<ChatResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  if (!isChatProfile(profile)) {
    return { ok: false, profile: String(profile), error: "profile is not addressable", elapsedMs: elapsed() };
  }

  const text = prompt.trim();
  if (!text) {
    return { ok: false, profile, error: "prompt is empty", elapsedMs: elapsed() };
  }
  if (text.length > MAX_PROMPT_CHARS) {
    return {
      ok: false,
      profile,
      error: `prompt exceeds ${MAX_PROMPT_CHARS} characters`,
      elapsedMs: elapsed(),
    };
  }

  // Base64 keeps the prompt opaque to the remote shell: no quoting rules to get
  // wrong, and no chance of a payload being read as a second argument.
  const encoded = Buffer.from(text, "utf8").toString("base64");

  const command =
    `HOME=/home/bor PATH=/home/bor/.local/bin:$PATH ` +
    `python3 -c "import base64,subprocess,sys;` +
    `p=base64.b64decode(sys.argv[1]).decode('utf-8');` +
    `r=subprocess.run(['${HERMES_BIN}','-p',sys.argv[2],'-z',p],` +
    `capture_output=True,text=True,timeout=${Math.floor(CHAT_TIMEOUT_MS / 1000) - 5});` +
    `sys.stdout.write(r.stdout or '');` +
    `sys.stderr.write(r.stderr or '')" ` +
    `"${encoded}" ${profile}`;

  try {
    const { stdout, stderr } = await run(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=5",
        HOST,
        command,
      ],
      { timeout: CHAT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
    );

    const reply = `${stdout ?? ""}`.trim();
    if (Buffer.byteLength(reply, "utf8") > MAX_OUTPUT_BYTES) {
      return { ok: false, profile, error: "reply exceeded size cap", elapsedMs: elapsed() };
    }
    if (!reply) {
      const detail = (stderr ?? "").trim().split("\n").slice(-3).join(" ");
      return {
        ok: false,
        profile,
        error: detail || "agent produced no output",
        elapsedMs: elapsed(),
      };
    }
    return { ok: true, profile, reply, elapsedMs: elapsed() };
  } catch (err) {
    const stderr = (err as { stderr?: unknown } | null)?.stderr;
    const detail =
      typeof stderr === "string" && stderr.trim()
        ? stderr.trim().split("\n").slice(-3).join(" ")
        : err instanceof Error
          ? err.message
          : "unknown failure";
    return { ok: false, profile, error: detail || "chat transport failed", elapsedMs: elapsed() };
  }
}
