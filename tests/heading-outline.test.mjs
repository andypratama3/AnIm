import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ROUTES } from "../scripts/ui-audit.mjs";

/**
 * One <h1> per route, enforced in two places.
 *
 * `npm run audit:ui` fails a rendered page that has more than one, which is what
 * caught the topbar rendering the route label as an <h1> beside the page's own.
 * That check only runs against a served app, though, so nothing stopped the same
 * defect from landing in a commit that CI would have caught later — or from
 * hiding in a state the audit never visits, like a markdown note body that opens
 * with `# Title`.
 *
 * So this reads the source. The allowlist is the point: a new <h1> anywhere is a
 * deliberate edit, not an accident, and a second one in the chrome is refused
 * outright because it duplicates a heading the page already owns.
 */

const ROOT = join(import.meta.dirname, "..");

/** Only these may render an <h1>: the page heading, and the notes body (demoted). */
const H1_ALLOWED = new Set([
  "components/dashboard/page-header.tsx",
  "app/notes/page.tsx",
]);

/** Chrome wraps every route, so an <h1> here duplicates the page's own. */
const CHROME_DIRS = ["components/layout", "components/ui", "components/providers", "components/dashboard"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/**
 * Strip comments before looking for a tag.
 *
 * Otherwise this file documents why the topbar is not an <h1> and fails itself.
 * A comment is not markup, and prose about an element is not the element.
 */
function markup(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const files = [
  ...walk(join(ROOT, "app")),
  ...walk(join(ROOT, "components")),
].map((path) => ({ path, rel: path.slice(ROOT.length + 1) }));

const h1Files = files.filter(({ path }) => /<h1[\s>]/.test(markup(readFileSync(path, "utf8"))));

describe("the heading outline", () => {
  test("the scan found the files it is meant to scan", () => {
    // A walk that silently matched nothing would make every assertion below
    // pass for the wrong reason.
    assert.ok(files.length > 20, `only found ${files.length} tsx files; the walk is broken`);
    assert.ok(h1Files.length > 0, "no <h1> found at all; the tag pattern is wrong");
  });

  test("no <h1> in the chrome or in shared components", () => {
    const offenders = h1Files
      .map(({ rel }) => rel)
      .filter((rel) => CHROME_DIRS.some((dir) => rel.startsWith(`${dir}/`)))
      .filter((rel) => rel !== "components/dashboard/page-header.tsx");
    assert.deepEqual(offenders, [], `chrome must not render a second <h1>: ${offenders.join(", ")}`);
  });

  test("every <h1> is in the allowlist", () => {
    const unexpected = h1Files.map(({ rel }) => rel).filter((rel) => !H1_ALLOWED.has(rel));
    assert.deepEqual(
      unexpected,
      [],
      `an <h1> appeared outside the allowlist: ${unexpected.join(", ")}. ` +
        "A page owns exactly one heading; add the file here only if that is deliberate.",
    );
  });

  test("the notes body demotes its headings instead of adding a second <h1>", () => {
    const source = markup(readFileSync(join(ROOT, "app/notes/page.tsx"), "utf8"));
    // react-markdown maps markdown `#` through the `h1` key. Rendering that as
    // an <h1> gives /notes two headings the moment a note opens with a title,
    // which is how most vault notes are written.
    const h1Rule = /h1:\s*\(?\{[^)]*\)?\s*=?>[\s\S]{0,200}?<(\w+)/.exec(source);
    assert.ok(h1Rule, "could not find the markdown h1 mapping on /notes");
    assert.notEqual(h1Rule[1], "h1", "the markdown h1 mapping renders an <h1>; demote it");
  });

  test("the audited routes are the ones this repo serves", () => {
    for (const route of ROUTES) {
      const dir = route === "/" ? join(ROOT, "app") : join(ROOT, "app", route.replace(/^\//, ""));
      assert.ok(
        readdirSync(dir).some((name) => name === "page.tsx" || name === "page.jsx"),
        `${route} is audited but has no page file`,
      );
    }
  });
});
