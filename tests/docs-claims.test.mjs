import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url);

/**
 * Markdown files quote test counts — "18 passing" — as evidence that a suite
 * exists and has depth. A count is also the easiest number in the repo to rot:
 * add one test and the prose is quietly wrong, which is the same class of bug
 * this whole audit is about. So the claim is checked against the suite instead
 * of trusted.
 *
 * Counting `test(` calls in the source is not an option: `chat-history` builds
 * tests inside a loop, so a static count reads 14 where the runner reports 20.
 * The suite is therefore executed and its own tally parsed. That costs a few
 * seconds for the handful of files that carry a claim.
 */
function countTests(file) {
  // The parent is itself a test runner, so it exports NODE_TEST_CONTEXT. A child
  // that sees it decides it is a test worker and reports over IPC instead of
  // stdout, which yields an empty capture and a "could not read" failure. Clear
  // it so the child runs as an ordinary process and prints a tally.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;

  const out = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      "./tests/register.mjs",
      "--test",
      file,
    ],
    {
      cwd: new URL(".", ROOT).pathname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env,
    },
  );
  const pass = /^# pass (\d+)$/m.exec(out) ?? /^ℹ pass (\d+)$/m.exec(out);
  if (!pass) throw new Error(`could not read a test count from ${file}`);
  return { pass: Number(pass[1]) };
}

const docFiles = () => {
  const out = ["AGENTS.md", "README.md"];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".md")) out.push(`${dir}${entry.name}`);
    }
  };
  walk("docs/", "docs/");
  return out;
};

const CLAIM = /`(tests\/[\w.-]+\.test\.mjs)`[^`\n]*\((\d+) passing\)/g;

describe("documented test counts are true", () => {
  test("every (N passing) claim matches the suite it names", () => {
    const claims = [];
    for (const file of docFiles()) {
      const text = readFileSync(new URL(file, ROOT), "utf8");
      for (const match of text.matchAll(CLAIM)) {
        claims.push({ doc: file, suite: match[1], claimed: Number(match[2]) });
      }
    }

    assert.ok(claims.length > 0, "no documented test counts found — the regex is stale");

    const wrong = [];
    for (const { doc, suite, claimed } of claims) {
      const { pass } = countTests(suite);
      if (pass !== claimed) wrong.push(`${doc}: ${suite} claims ${claimed}, suite runs ${pass}`);
    }
    assert.deepEqual(wrong, [], `documented test counts are stale:\n${wrong.join("\n")}`);
  });

  test("the suites carrying a claim are all still present", () => {
    for (const suite of [
      "tests/ui-audit-bridge.test.mjs",
      "tests/mesh-layout.test.mjs",
      "tests/chat-history.test.mjs",
      "tests/activity-feed.test.mjs",
      "tests/session-gate-render.test.mjs",
    ]) {
      assert.doesNotThrow(() => readFileSync(new URL(suite, ROOT), "utf8"), suite);
    }
  });
});
