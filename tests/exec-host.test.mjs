import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * The bridge transport.
 *
 * The dashboard used to reach the mesh over SSH from every code path. It is now
 * deployed on the mesh host itself, where that hop was not just redundant but
 * broken: root holds an `authorized_keys` and no private key, so
 * `ssh root@72.61.141.91` from the host answered `Permission denied
 * (publickey,password)`. That took out every read route and every chat turn
 * while the UI reported simulated data.
 *
 * These tests pin the replacement: the transport is chosen from what is
 * actually reachable, `local` is available and preferred, and `off` is a typed
 * refusal rather than a silent fallback to a broken channel.
 */

const execHost = await import("../lib/data/exec-host.ts");

const ORIGINAL_MODE = process.env.ANIM_EXEC_MODE;

beforeEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.ANIM_EXEC_MODE;
  else process.env.ANIM_EXEC_MODE = ORIGINAL_MODE;
});

describe("exec mode", () => {
  test("defaults to auto", () => {
    delete process.env.ANIM_EXEC_MODE;
    assert.equal(execHost.execMode(), "auto");
  });

  test("recognises the four modes", () => {
    for (const mode of ["auto", "local", "ssh", "off"]) {
      process.env.ANIM_EXEC_MODE = mode;
      assert.equal(execHost.execMode(), mode);
    }
  });

  test("an unknown value falls back to auto instead of throwing", () => {
    process.env.ANIM_EXEC_MODE = "banana";
    assert.equal(execHost.execMode(), "auto");
  });

  test("mode is case and whitespace insensitive", () => {
    process.env.ANIM_EXEC_MODE = "  LOCAL  ";
    assert.equal(execHost.execMode(), "local");
  });
});

describe("transport selection", () => {
  test("auto prefers local when the target is on this filesystem", () => {
    delete process.env.ANIM_EXEC_MODE;
    // Stands in for the collector, but exists on any machine that runs the
    // suite. The hard-coded `/home/bor/...` paths this used made the assertion
    // pass only on the mesh host, so `npm test` failed on a laptop and in CI
    // while the transport logic was fine.
    const localTarget = new URL("./fixtures/agent-chat-stub.mjs", import.meta.url).pathname;
    assert.equal(execHost.resolveTransport([localTarget]), "local");
  });

  test("auto falls back to ssh when nothing is local", () => {
    delete process.env.ANIM_EXEC_MODE;
    assert.equal(execHost.resolveTransport(["/nonexistent/mesh-inventory.py"]), "ssh");
  });

  test("local is forced even when the target is absent, so it fails closed", () => {
    process.env.ANIM_EXEC_MODE = "local";
    assert.equal(execHost.resolveTransport(["/nonexistent/mesh-inventory.py"]), "local");
  });

  test("ssh is forced for a laptop pointed at a remote mesh host", () => {
    process.env.ANIM_EXEC_MODE = "ssh";
    assert.equal(
      execHost.resolveTransport(["/home/bor/.hermes/mesh-inventory.py"]),
      "ssh",
    );
  });
});

describe("runOnMesh", () => {
  test("off refuses before spawning anything", async () => {
    process.env.ANIM_EXEC_MODE = "off";
    await assert.rejects(
      execHost.runOnMesh({
        localPaths: ["/home/bor/.hermes/mesh-inventory.py"],
        localArgv: ["false"],
        sshCommand: "false",
        timeoutMs: 1000,
        maxBuffer: 1024,
      }),
      (err) => err instanceof execHost.ExecUnavailable && err.message === "ANIM_EXEC_MODE=off",
    );
  });

  test("a local call runs the argv it was given, with no shell", async () => {
    process.env.ANIM_EXEC_MODE = "local";
    const { stdout } = await execHost.runOnMesh({
      localPaths: ["/bin/echo"],
      localArgv: ["/bin/echo", "a b; rm -rf /", "$HOME", "&& echo pwned"],
      sshCommand: "should-not-run",
      timeoutMs: 5000,
      maxBuffer: 4096,
    });
    // Every argument survives verbatim: no word splitting, no expansion, no shell.
    assert.equal(stdout, "a b; rm -rf / $HOME && echo pwned\n");
  });

  test("a local call passes the pinned env through to the child", async () => {
    process.env.ANIM_EXEC_MODE = "local";
    const { stdout } = await execHost.runOnMesh({
      localPaths: ["/usr/bin/env"],
      localArgv: ["/usr/bin/env"],
      sshCommand: "should-not-run",
      timeoutMs: 5000,
      maxBuffer: 8192,
      env: { HOME: "/home/bor", ANIM_TEST_PIN: "pinned" },
    });
    const lines = stdout.split("\n");
    assert.ok(lines.includes("HOME=/home/bor"), `HOME not pinned: ${stdout}`);
    assert.ok(lines.includes("ANIM_TEST_PIN=pinned"), `env not applied: ${stdout}`);
  });
});

describe("failure reporting", () => {
  test("an unavailable transport keeps its own reason", () => {
    assert.equal(execHost.failureReason(new execHost.ExecUnavailable("ANIM_EXEC_MODE=off")), "ANIM_EXEC_MODE=off");
  });

  test("stderr is preferred over a generic message, as one line", () => {
    const err = Object.assign(new Error("Command failed"), {
      stderr: "root@72.61.141.91: Permission denied (publickey,password).\nsecond line\n",
    });
    assert.equal(
      execHost.failureReason(err),
      "root@72.61.141.91: Permission denied (publickey,password).",
    );
  });

  test("a non-Error still yields a reason instead of undefined", () => {
    assert.equal(execHost.failureReason("boom"), "unknown transport failure");
  });
});
