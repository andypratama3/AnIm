import { registerHooks } from "node:module";

import { resolve } from "./ts-alias.mjs";

// `registerHooks` runs in-thread and is not deprecated (Node 22.15+). Older
// runtimes only have the async `register`, so fall back rather than fail.
if (typeof registerHooks === "function") {
  registerHooks({ resolve });
} else {
  const { register } = await import("node:module");
  register("./ts-alias.mjs", import.meta.url);
}
