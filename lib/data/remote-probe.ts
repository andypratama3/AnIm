import { execMode, failureReason, runOnMesh } from "@/lib/data/exec-host";
import { CHATTABLE_PROFILES, type ChatProfile } from "@/lib/data/agent-chat";
import { portForProfile } from "@/lib/data/registry";

const PROBE_TIMEOUT_MS = Number(process.env.ANIM_PROBE_TIMEOUT_MS ?? 15_000);
const MAX_OUTPUT_BYTES = 8 * 1024;

export type ProbeResult = {
  profile: string;
  port: number;
  tcpConnected: boolean;
  connectMs: number | null;
  a2aStatus: number | null;
  a2aMs: number | null;
  error: string | null;
};

export function isProbeProfile(value: unknown): value is ChatProfile {
  return typeof value === "string" && (CHATTABLE_PROFILES as readonly string[]).includes(value);
}

/**
 * Measure a real round trip to one agent.
 *
 * The dashboard used to show a "ping" button that printed a number it already
 * had. This actually opens a TCP connection to the agent's port and issues an
 * HTTP request against its A2A endpoint, then reports what came back, so the
 * latency on screen is measured rather than asserted.
 *
 * The measured command is a fixed literal; the port comes from the registry and is
 * interpolated as a validated integer, never from request input. A profile the
 * registry has no port for is reported as unassigned rather than probed on a
 * guessed port, which would read as an outage.
 *
 * The probe dials `127.0.0.1`, so it only measures anything on the host that holds
 * the mesh. `lib/data/exec-host` therefore runs it here whenever the mesh is
 * local, and only reaches for SSH when this machine is not the mesh host.
 */
export async function probeAgent(profile: string): Promise<ProbeResult> {
  if (execMode() === "off") {
    return { profile, port: 0, tcpConnected: false, connectMs: null, a2aStatus: null, a2aMs: null, error: "ANIM_EXEC_MODE=off" };
  }

  const port = portForProfile(profile) ?? 0;
  const base: ProbeResult = {
    profile,
    port,
    tcpConnected: false,
    connectMs: null,
    a2aStatus: null,
    a2aMs: null,
    error: null,
  };
  if (!port) return { ...base, error: "no port assigned in the registry" };

  const script = [
    "import json,socket,time,urllib.request,urllib.error",
    `p=${port}`,
    "out={'tcpConnected':False,'connectMs':None,'a2aStatus':None,'a2aMs':None}",
    "s=socket.socket()",
    "s.settimeout(3)",
    "t=time.time()",
    "try:",
    "    s.connect(('127.0.0.1',p))",
    "    out['tcpConnected']=True",
    "    out['connectMs']=round((time.time()-t)*1000)",
    "except Exception as e:",
    "    out['error']=type(e).__name__",
    "finally:",
    "    s.close()",
    "if out['tcpConnected']:",
    "    t=time.time()",
    "    try:",
    "        r=urllib.request.urlopen(f'http://127.0.0.1:{p}/.well-known/agent.json',timeout=4)",
    "        out['a2aStatus']=r.status",
    "        out['a2aMs']=round((time.time()-t)*1000)",
    "    except urllib.error.HTTPError as e:",
    "        out['a2aStatus']=e.code",
    "        out['a2aMs']=round((time.time()-t)*1000)",
    "    except Exception as e:",
    "        out['error']=type(e).__name__",
    "print(json.dumps(out))",
  ].join("\n");

  const encoded = Buffer.from(script, "utf8").toString("base64");

  try {
    const { stdout } = await runOnMesh({
      // A reachable gateway port is the proof that the mesh is on this host, so
      // the probe prefers the local transport and needs no separate config.
      localPaths: [`/home/bor/.hermes/mesh-inventory.py`],
      localArgv: ["python3", "-c", script],
      sshCommand: `echo ${encoded} | base64 -d | python3`,
      timeoutMs: PROBE_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    });

    const parsed = JSON.parse(`${stdout}`.trim().split("\n").pop() ?? "{}") as Partial<ProbeResult>;
    return {
      ...base,
      tcpConnected: parsed.tcpConnected === true,
      connectMs: typeof parsed.connectMs === "number" ? parsed.connectMs : null,
      a2aStatus: typeof parsed.a2aStatus === "number" ? parsed.a2aStatus : null,
      a2aMs: typeof parsed.a2aMs === "number" ? parsed.a2aMs : null,
      error: typeof parsed.error === "string" ? parsed.error : null,
    };
  } catch (err) {
    return { ...base, error: failureReason(err) };
  }
}
