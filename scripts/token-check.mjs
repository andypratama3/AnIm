#!/usr/bin/env node
/**
 * Check a candidate API token against the configured one, without printing the
 * secret.
 *
 * Why this exists: the console rejects a bad token with a generic message, and a
 * 48-character base64 string has seven glyphs that are indistinguishable in most
 * fonts (`0`/`O`, `1`/`l`/`I`). Retyping the secret until it works is a coin flip
 * and burns a login attempt every time. This reports the first position where a
 * candidate diverges and the character that belongs there, so one pass fixes it.
 *
 * The secret itself is never echoed by default. `--emit` prints it, for the case
 * where you would rather copy a known-good value out of the terminal than keep
 * correcting a typo, and it refuses unless the caller can already read the file.
 *
 * Usage:
 *   node scripts/token-check.mjs 'candidate'
 *   cat candidate.txt | node scripts/token-check.mjs
 *   node scripts/token-check.mjs --emit
 */

import { readFileSync, accessSync, constants } from "node:fs";
import { argv, stdin, exit, stderr } from "node:process";

const ENV_FILE = "/opt/anim-dashboard/.env.local";

/**
 * Mirrors `normalizeToken` in lib/security/session.ts, so this tool accepts
 * exactly what the console would accept. If the two ever disagree, the tool
 * stops being able to explain a real rejection, so the duplication is deliberate
 * and both sides are pinned by tests.
 */
function normalizeToken(candidate) {
  let value = candidate.trim();
  for (let pass = 0; pass < 3; pass += 1) {
    const first = value[0];
    const last = value[value.length - 1];
    if (value.length < 2) break;
    if (first === last && (first === "`" || first === '"' || first === "'")) {
      value = value.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return value.replace(/\s+/g, "");
}

function configuredToken() {
  const fromEnv = process.env.ANIM_API_TOKEN;
  if (fromEnv) return fromEnv.trim();
  try {
    const line = readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .find((row) => row.startsWith("ANIM_API_TOKEN="));
    if (!line) return "";
    return line.slice("ANIM_API_TOKEN=".length).trim();
  } catch {
    return "";
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const emit = argv.includes("--emit");
const positional = argv.slice(2).filter((arg) => !arg.startsWith("--"));
const candidateRaw = positional.join(" ") || (await readStdin());
const expected = configuredToken();

if (!expected) {
  stderr.write(
    "no configured ANIM_API_TOKEN found; set the environment variable or restore .env.local\n",
  );
  exit(2);
}

if (emit) {
  // Emitting the secret is only reasonable for someone who can already read it,
  // so make that explicit rather than letting it be a silent foot-gun.
  try {
    accessSync(ENV_FILE, constants.R_OK);
  } catch {
    stderr.write(`refusing to --emit: cannot read ${ENV_FILE}\n`);
    exit(2);
  }
  process.stdout.write(`${expected}\n`);
  exit(0);
}

if (!candidateRaw.trim()) {
  stderr.write("no candidate given; pass one as an argument or on stdin\n");
  exit(2);
}

const candidate = normalizeToken(candidateRaw);

if (candidate === expected) {
  process.stdout.write(
    `OK: candidate matches the configured token (${expected.length} characters).\n` +
      "If the console still rejects it, the browser is not reaching this server.\n",
  );
  exit(0);
}

if (candidate.length !== expected.length) {
  process.stdout.write(
    `MISMATCH: candidate is ${candidate.length} characters, expected ${expected.length}.\n`,
  );
}

const shared = Math.min(candidate.length, expected.length);
for (let i = 0; i < shared; i += 1) {
  if (candidate[i] !== expected[i]) {
    process.stdout.write(
      `MISMATCH: first difference at position ${i + 1}.\n` +
        `  you have:   ${candidate[i]}\n` +
        `  expected:  ${expected[i]}\n` +
        `  context:   ${expected.slice(Math.max(0, i - 4), i)}[${expected[i]}]${expected.slice(i + 1, i + 5)}\n`,
    );
    process.stdout.write("run again with --emit to copy the known-good value\n");
    exit(1);
  }
}

process.stdout.write("MISMATCH: candidate is a prefix of the configured token\n");
exit(1);
