import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { CHATTABLE_PROFILES, type ChatProfile } from "@/lib/data/agent-chat";

const run = promisify(execFile);

const HOST = process.env.ANIM_SSH_HOST ?? "root@72.61.141.91";
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

const PORTS: Record<string, number> = {
  default: 9900,
  "ceo-bor": 9901,
  "agent-secretary": 9902,
  "agent-operasi-produk": 9903,
  "principal-engineer": 9904,
  "fullstack-engineer": 9905,
  backend: 9906,
  frontend: 9907,
  "ai-engineer": 9908,
  "devops-engineer": 9909,
  "security-engineer": 9910,
  "qa-engineer": 9911,
  "code-reviewer": 9912,
  "hermes-operator": 9913,
  "dashboard-engineer": 9914,
  "automation-engineer": 9915,
  "knowledge-agent": 9916,
  "content-strategist": 9917,
  "technical-writer": 9918,
  "social-media": 9919,
  "agent-pemasaran": 9920,
  "agent-penjualan": 9921,
  "agent-layanan": 9922,
  "agent-keuangan": 9923,
  "career-agent": 9924,
  "management-research": 9925,
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
 * The remote command is a fixed literal; the port comes from a fixed table and is
 * interpolated as a validated integer, never from request input.
 */
export async function probeAgent(profile: string): Promise<ProbeResult> {
  const port = PORTS[profile];
  const base: ProbeResult = {
    profile,
    port,
    tcpConnected: false,
    connectMs: null,
    a2aStatus: null,
    a2aMs: null,
    error: null,
  };
  if (!port) return { ...base, error: "unknown profile" };

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
    const { stdout } = await run(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=5",
        HOST,
        `echo ${encoded} | base64 -d | python3`,
      ],
      { timeout: PROBE_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
    );

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
    const detail =
      err instanceof Error ? err.message.split("\n")[0] : "probe transport failed";
    return { ...base, error: detail };
  }
}
