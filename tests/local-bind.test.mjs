import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// `next dev` and `next start` default to 0.0.0.0, which publishes the dashboard
// to every interface on the machine. On a laptop that means anything on the
// same Wi-Fi can reach a page that holds an SSH path to the production host and
// can dispatch work to 26 agent profiles. The hostname has to be pinned, and
// this test is here so dropping the flag is a failing build rather than a
// silent exposure.
test("dev and start bind to loopback, not every interface", () => {
  for (const name of ["dev", "start"]) {
    const script = pkg.scripts[name];
    assert.ok(script, `script '${name}' harus ada`);
    assert.match(
      script,
      /(-H|--hostname)\s+127\.0\.0\.1/,
      `script '${name}' harus pin hostname ke 127.0.0.1, bukan default 0.0.0.0 — dapat: ${script}`,
    );
  }
});

test("no script starts Next without an explicit hostname", () => {
  const offenders = Object.entries(pkg.scripts)
    .filter(([, script]) => /\bnext\s+(dev|start)\b/.test(script))
    .filter(([, script]) => !/(-H|--hostname)\s+127\.0\.0\.1/.test(script))
    .map(([name]) => name);
  assert.deepEqual(
    offenders,
    [],
    `script ini menjalankan next dev/start tanpa pin loopback: ${offenders.join(", ")}`,
  );
});

test("the port-exposure guard is wired to a runnable script", () => {
  assert.match(pkg.scripts["check:ports"], /check-port-exposure\.sh/);
});
