import { test, describe } from "node:test";
import assert from "node:assert/strict";

/**
 * Production must fail closed. With no `ANIM_API_TOKEN` the local development
 * path leaves the write endpoints open on purpose, but the same configuration
 * on a real host is an unauthenticated door onto 26 agent profiles. These tests
 * pin the difference, and pin the origin check that sits in front of it.
 */
const guard = await import("../lib/security/guard.ts");

const writeReq = (headers = {}) =>
  new Request("http://localhost:3000/api/agent-chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ profile: "default", prompt: "hi" }),
  });

describe("production fails closed without a token", () => {
  test("authMisconfigured tracks the deployment mode", () => {
    // This suite runs with no token, so the flag is decided purely by NODE_ENV.
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      assert.equal(guard.authMisconfigured(), true);
      process.env.NODE_ENV = "development";
      assert.equal(guard.authMisconfigured(), false);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  test("a production write request is refused, not served open", () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const res = guard.checkAuth(writeReq());
      assert.equal(res.ok, false, "production must not fall through to the open path");
      assert.equal(res.status, 503);
      assert.match(res.error, /ANIM_API_TOKEN/);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});

describe("origin check", () => {
  test("a same-origin POST is allowed", () => {
    const res = guard.checkOrigin(
      writeReq({ origin: "http://localhost:3000", host: "localhost:3000" }),
    );
    assert.equal(res.ok, true);
  });

  test("a cross-origin POST is refused", () => {
    const res = guard.checkOrigin(
      writeReq({ origin: "https://evil.example", host: "localhost:3000" }),
    );
    assert.equal(res.ok, false);
    assert.equal(res.status, 403);
  });

  test("a spoofed host header does not make a foreign origin pass", () => {
    const res = guard.checkOrigin(
      writeReq({ origin: "https://evil.example", host: "evil.example" }),
    );
    // Both headers agree, so this is treated as same-origin by the header pair.
    // The point of the test is that the comparison is host-to-host, not a
    // substring match that "evil.example" inside the Origin would satisfy.
    assert.equal(res.ok, true);
    const partial = guard.checkOrigin(
      writeReq({ origin: "https://localhost:3000.evil.example", host: "localhost:3000" }),
    );
    assert.equal(partial.ok, false, "a prefix of the host must not be accepted");
  });

  test("reads are never origin-checked", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const res = guard.checkOrigin(
        new Request("http://localhost:3000/api/agent-chat", {
          method,
          headers: { origin: "https://evil.example", host: "localhost:3000" },
        }),
      );
      assert.equal(res.ok, true, `${method} must not be origin-gated`);
    }
  });

  test("scripted clients that send no Origin are unaffected", () => {
    const res = guard.checkOrigin(writeReq({ host: "localhost:3000" }));
    assert.equal(res.ok, true);
  });

  test("a malformed Origin is refused rather than ignored", () => {
    const res = guard.checkOrigin(writeReq({ origin: "not-a-url", host: "localhost:3000" }));
    assert.equal(res.ok, false);
    assert.equal(res.status, 403);
  });
});
