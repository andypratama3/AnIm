import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Guards get added one route at a time, and nothing in the type system notices
 * when a new write endpoint is left out. `/api/board` spent its whole life
 * accepting a create, a move and a delete from anyone who could reach it, while
 * four sibling routes were careful. This reads the routes as text and fails
 * when a mutating handler skips the check, so the gap cannot be reintroduced by
 * forgetting rather than by deciding.
 */

const API_DIR = new URL("../app/api/", import.meta.url);
const MUTATING = /export async function (POST|PATCH|PUT|DELETE)\s*\(/g;

/**
 * Handlers that are exempt, and why. Keep this list short and justified: a new
 * entry is a claim that an endpoint is safe, and it has to be earned.
 */
const EXEMPT = new Map([
  [
    "app/api/session/route.ts::DELETE",
    "sign-out only clears the cookie; it grants nothing and SameSite=Strict covers it",
  ],
  [
    // Login is the one write that cannot require the session it is creating. It
    // establishes authority by checking the token itself with `tokenIsValid`,
    // which is the stronger check, not a weaker one.
    "app/api/session/route.ts::POST",
    "login establishes the session; it validates the token directly with tokenIsValid",
  ],
]);

async function routeFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(entry.name, entry.isDirectory() ? "" : "route.ts");
    if (entry.isDirectory()) {
      found.push(...(await routeFiles(join(dir, entry.name))));
    } else if (entry.name === "route.ts") {
      found.push(join(dir, entry.name));
    } else {
      found.push(join(dir, path));
    }
  }
  return found.filter(Boolean);
}

/** Handlers in one file, with the body of each. */
function handlers(source) {
  const out = [];
  for (const match of source.matchAll(MUTATING)) {
    const name = match[1];
    const start = match.index + match[0].length;
    // The handler body runs to the next top-level export, or to the end.
    const rest = source.slice(start);
    const next = rest.search(/\nexport (?:async function|const|default)/);
    out.push({ name, body: next === -1 ? rest : rest.slice(0, next) });
  }
  return out;
}

const files = await routeFiles(API_DIR.pathname);
const routes = await Promise.all(
  files.map(async (file) => ({
    file: file.replace(`${API_DIR.pathname.replace(/\/$/, "")}/`, "app/api/"),
    handlers: handlers(await readFile(file, "utf8")),
  })),
);

const mutating = routes.flatMap((route) =>
  route.handlers.map((h) => ({ ...h, file: route.file })),
);

describe("every write endpoint is guarded", () => {
  test("the scan actually found the mutating routes", () => {
    assert.ok(
      mutating.length >= 8,
      `expected to find the write routes, found ${mutating.length}; the scanner is broken, not the code`,
    );
  });

  for (const handler of mutating) {
    const key = `${handler.file}::${handler.name}`;
    if (EXEMPT.has(key)) continue;

    test(`${key} checks the origin`, () => {
      assert.match(
        handler.body,
        /checkOrigin\(request\)/,
        `${key} accepts a state change without checking where it came from`,
      );
    });

    test(`${key} checks the session`, () => {
      assert.match(
        handler.body,
        /checkAuth\(request\)/,
        `${key} accepts a state change without checking who is asking`,
      );
    });
  }
});

describe("an exemption has to justify itself", () => {
  test("every exemption names a reason", () => {
    for (const [key, why] of EXEMPT) {
      assert.ok(why && why.length > 20, `${key} is exempt without saying why`);
    }
  });

  test("an exemption points at a handler that still exists", () => {
    for (const key of EXEMPT.keys()) {
      const [file, name] = key.split("::");
      const route = routes.find((r) => r.file === file);
      assert.ok(route, `${key} is exempt but ${file} no longer exists`);
      assert.ok(
        route.handlers.some((h) => h.name === name),
        `${key} is exempt but ${file} no longer has a ${name} handler`,
      );
    }
  });
});
