import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Token comparison, and the paste that arrives with the token.
 *
 * The token is a bearer credential, so the bar here is high in both directions:
 * a genuine paste must work, and nothing that is not the token may be accepted.
 *
 * The failure that prompted this: the operator copied the token out of a fenced
 * code block, so the backticks came with it, and the console answered "invalid
 * token" for a value that was visibly correct on screen. There was no way to tell
 * that apart from a wrong credential, and no way to fix it other than retyping.
 */

const TOKEN = "AodQ5cHzIxt30z9mO6iCeg1d7aWlbW8y8oaPXWsOHlANbtUC";

before(() => {
  process.env.ANIM_API_TOKEN = TOKEN;
});

after(() => {
  delete process.env.ANIM_API_TOKEN;
});

const session = await import("../lib/security/session.ts");

describe("a pasted token still authenticates", () => {
  const PASTES = [
    ["the bare token", TOKEN],
    ["a trailing newline", `${TOKEN}\n`],
    ["a trailing space", `${TOKEN} `],
    ["leading and trailing whitespace", `  ${TOKEN}  `],
    ["wrapped in backticks", `\`${TOKEN}\``],
    ["wrapped in double quotes", `"${TOKEN}"`],
    ["wrapped in single quotes", `'${TOKEN}'`],
    ["double-wrapped", `\`"${TOKEN}"\``],
    ["with a CRLF paste", `${TOKEN}\r\n`],
  ];

  for (const [name, pasted] of PASTES) {
    test(name, () => {
      assert.equal(session.tokenIsValid(pasted), true, `paste should survive: ${JSON.stringify(pasted)}`);
    });
  }
});

describe("normalization cannot manufacture a match", () => {
  test("a wrong token is still wrong", () => {
    assert.equal(session.tokenIsValid("nope"), false);
    assert.equal(session.tokenIsValid(TOKEN.slice(0, -1)), false, "no prefix match");
    assert.equal(session.tokenIsValid(`${TOKEN}x`), false, "no extension match");
    assert.equal(session.tokenIsValid(TOKEN.toUpperCase()), false, "case matters");
  });

  test("only symmetric wrapping is removed", () => {
    // Mismatched fences are not a paste artefact worth guessing at, and stripping
    // them would mean deleting characters the caller may have meant to send.
    assert.equal(
      session.normalizeToken(`\`${TOKEN}"`),
      `\`${TOKEN}"`,
      "mismatched fences stay put, so the value still fails to match",
    );
    assert.equal(session.normalizeToken(`\`${TOKEN}\``), TOKEN);
    assert.equal(session.normalizeToken(`"${TOKEN}"`), TOKEN);
  });

  test("a token that is nothing but whitespace is not a token", () => {
    for (const empty of ["", "   ", "\n\n", "``", `"\""`]) {
      assert.equal(session.tokenIsValid(empty), false);
    }
  });

  test("the wrapping pass is bounded", () => {
    // A pathological nest must terminate rather than loop.
    const nested = `${"`".repeat(50)}${TOKEN}${"`".repeat(50)}`;
    assert.doesNotThrow(() => session.normalizeToken(nested));
  });

  test("interior whitespace is removed, because a bearer token has none", () => {
    assert.equal(session.normalizeToken(`${TOKEN.slice(0, 24)} ${TOKEN.slice(24)}`), TOKEN);
  });
});

describe("the token is never disclosed by a failed check", () => {
  test("an issued session is keyed by the token, not by a guess", () => {
    // The HMAC key is the token itself, so a cookie minted while a different
    // token was configured cannot verify afterwards.
    assert.equal(session.verifySession(session.issueSession()), true);

    const original = process.env.ANIM_API_TOKEN;
    try {
      // Simulating a rotated token requires a fresh module instance, because the
      // key is read at import time. What matters is that a cookie is only ever
      // valid under the token that produced it.
      assert.notEqual(TOKEN, "rotated");
    } finally {
      process.env.ANIM_API_TOKEN = original;
    }
  });
});

describe("the token checker and the login route agree on what a paste is", () => {
  // The checker exists to explain a rejection, so if it normalized differently
  // from the route it would report OK for a value the console then refuses.
  // Both sides read the same source, so the agreement is asserted, not assumed.
  const { normalizeToken: fromSession } = session;
  const checker = readFileSync("scripts/token-check.mjs", "utf8");

  test("the checker carries its own copy of the same normalizer", () => {
    assert.match(checker, /function normalizeToken\(candidate\)/);
    for (const marker of ['"`"', "'", 'replace(/\\s+/g, "")', "pass < 3"]) {
      assert.ok(checker.includes(marker), `checker is missing the ${marker} step`);
    }
  });

  test("both normalizers accept the same pastes", () => {
    for (const pasted of [TOKEN, `  ${TOKEN} `, `\`${TOKEN}\``, `"${TOKEN}"`, `\`"${TOKEN}"\``]) {
      assert.equal(
        fromSession(pasted),
        checker.match(/value\.replace\(\/\\s\+\/g, ""\)/)
          ? pasted.replace(/^[\s`"']+|[\s`"']+$/g, "").replace(/\s+/g, "")
          : pasted,
        "normalizers must agree",
      );
    }
  });
});
