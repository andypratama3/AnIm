/**
 * Resolve hook that teaches plain Node the `@/` path alias used across the app.
 *
 * `tsconfig.json` maps `@/*` to the repo root, so tsc, ESLint and Next all agree.
 * The Node test runner does not read tsconfig paths, and adding a loader package
 * (tsconfig-paths, tsx, vitest) would mean a new dependency for a codebase that
 * currently builds with none. Node runs the TypeScript sources directly through
 * its own type stripping, so the only thing missing is this mapping.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

  const base = join(ROOT, specifier.slice(2));
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  // Let Node produce its own ERR_MODULE_NOT_FOUND with the real path.
  return nextResolve(pathToFileURL(`${base}.ts`).href, context);
}
