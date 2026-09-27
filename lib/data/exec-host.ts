import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Where the mesh calls are executed from.
 *
 * The dashboard was designed to run on a laptop and reach the Hermes host over
 * SSH. It is now deployed *on* that host, and the SSH hop was not merely
 * redundant there — it was broken, because root holds an `authorized_keys` but
 * no private key, so `ssh root@72.61.141.91` from the host itself answered
 * `Permission denied (publickey,password)`. Every read route degraded to
 * simulated data and every chat turn failed at the transport.
 *
 * So the transport is chosen from what is actually reachable:
 *
 *   auto  (default)  run locally when the target exists on this filesystem,
 *                    otherwise over SSH. Correct on both the laptop and the host.
 *   local             always local. Fails closed if the target is not here.
 *   ssh               always SSH. For a laptop pointed at a remote host.
 *   off               no bridge at all; callers report a typed unavailable state.
 *
 * Both paths run a *fixed* command. Nothing caller-supplied is ever interpolated
 * into a shell string, the collector and the CLI are read-only in intent, output
 * is size-capped, and the child is hard-killed on timeout. Dropping SSH removes
 * a privileged channel; it does not widen what the bridge can reach.
 */

export type ExecMode = "auto" | "local" | "ssh" | "off";

export function execMode(): ExecMode {
  const raw = (process.env.ANIM_EXEC_MODE ?? "auto").trim().toLowerCase();
  if (raw === "local" || raw === "ssh" || raw === "off") return raw;
  return "auto";
}

const SSH_HOST = process.env.ANIM_SSH_HOST ?? "root@72.61.141.91";

export type ExecResult = { stdout: string; stderr: string };

/** Raised when no transport can serve the call, so callers can label the mode. */
export class ExecUnavailable extends Error {}

function localExists(paths: string[]): boolean {
  return paths.some((path) => existsSync(path));
}

/**
 * Pick a transport for a command that has a local and a remote form.
 *
 * `localPaths` is what proves the mesh is on this machine: the collector script
 * or the `hermes` binary. If it is here, the SSH round trip buys nothing.
 */
export function resolveTransport(localPaths: string[]): Exclude<ExecMode, "off"> {
  const mode = execMode();
  if (mode === "ssh") return "ssh";
  if (mode === "local") return "local";
  return localExists(localPaths) ? "local" : "ssh";
}

/**
 * Run `localArgv` here, or `sshCommand` on the mesh host, with one bounded call.
 *
 * The SSH branch keeps `BatchMode=yes` so a missing key fails closed instead of
 * hanging on an interactive prompt.
 */
export async function runOnMesh(options: {
  /** Files whose presence proves the mesh is on this host. */
  localPaths: string[];
  /** argv for the local process. Never passed through a shell. */
  localArgv: string[];
  /** Fixed command line for the SSH branch. */
  sshCommand: string;
  timeoutMs: number;
  maxBuffer: number;
  /** Overlay merged onto the server's own environment, not a replacement for it. */
  env?: Record<string, string>;
}): Promise<ExecResult> {
  const { localPaths, localArgv, sshCommand, timeoutMs, maxBuffer, env } = options;

  if (execMode() === "off") {
    throw new ExecUnavailable("ANIM_EXEC_MODE=off");
  }

  if (resolveTransport(localPaths) === "local") {
    const { stdout, stderr } = await run(localArgv[0], localArgv.slice(1), {
      timeout: timeoutMs,
      maxBuffer,
      encoding: "utf8",
      env: env ? { ...process.env, ...env } : process.env,
    });
    return { stdout: `${stdout ?? ""}`, stderr: `${stderr ?? ""}` };
  }

  const { stdout, stderr } = await run(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=5",
      "-o",
      "StrictHostKeyChecking=accept-new",
      SSH_HOST,
      sshCommand,
    ],
    { timeout: timeoutMs, maxBuffer, encoding: "utf8" },
  );
  return { stdout: `${stdout ?? ""}`, stderr: `${stderr ?? ""}` };
}

/** The single-line reason a bridge failure should be reported with. */
export function failureReason(err: unknown): string {
  if (err instanceof ExecUnavailable) return err.message;
  const stderr = (err as { stderr?: unknown } | null)?.stderr;
  if (typeof stderr === "string" && stderr.trim()) {
    return stderr.trim().split("\n")[0];
  }
  return err instanceof Error ? err.message : "unknown transport failure";
}

export const MESH_HOST = SSH_HOST;
