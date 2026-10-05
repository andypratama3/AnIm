import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, describe } from "node:test";

/**
 * A refused board write must not escape as an unhandled rejection.
 *
 * Dragging a card produced this in the browser:
 *
 *   Failed to load resource: the server responded with a status of 409 ()
 *   Uncaught (in promise) Error: Move rejected
 *       at e.mutate.optimisticData.e
 *
 * Three things were wrong, and only the first was visible in the console.
 *
 *  1. `useMoveTask` let SWR's `mutate` rejection propagate. Nothing awaited it
 *     with a `catch`, so every refusal became an uncaught promise.
 *  2. `move` returned `void`, so `onDragEnd` could not tell a refusal from a
 *     success and fired the success toast either way — the card snapped back to
 *     its old column under a toast claiming it had moved.
 *  3. The refusal body was discarded. The server explains *why* ("Hermes
 *     advances a task through triage/todo/... itself"), and that explanation is
 *     the only useful thing to show the operator.
 *
 * `useDeleteTask` had the same shape against a route that refuses every call
 * with a 405, so deleting a card was guaranteed to throw.
 *
 * These read the sources, because the defect is a promise that escapes into the
 * browser's global handler; nothing server-side can observe it.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [hooksRaw, boardRaw] = await Promise.all([
  read("lib/hooks/use-data.ts"),
  read("components/dashboard/kanban-board.tsx"),
]);

describe("a refused board mutation is reported, not thrown", () => {
  test("useMoveTask catches the rejection and returns the reason", () => {
    const fn = hooksRaw.slice(
      hooksRaw.indexOf("export function useMoveTask"),
      hooksRaw.indexOf("export function useCreateTask"),
    );
    assert.match(fn, /catch \(error\)/, "the SWR rejection must be caught");
    assert.match(
      fn,
      /return \{ ok: false, reason:/,
      "move must report the refusal to its caller instead of returning void",
    );
    // The server's explanation is the point of the refusal; dropping it leaves
    // the operator with a bare status code.
    assert.match(fn, /detail: payload\?\.detail/, "the server's detail must survive");
    assert.doesNotMatch(
      fn,
      /throw new Error\("Move rejected"\)/,
      "the opaque error string is what hid the cause",
    );
  });

  test("useDeleteTask catches too, even though the route always refuses", () => {
    const fn = hooksRaw.slice(
      hooksRaw.indexOf("export function useDeleteTask"),
      hooksRaw.indexOf("export function useAgent"),
    );
    assert.match(fn, /catch \(error\)/, "delete must not throw into the drag handler");
    assert.match(fn, /return \{ ok: false, reason:/, "delete must report the refusal");
  });

  test("the drag handler checks the result before claiming success", () => {
    const handler = boardRaw.slice(
      boardRaw.indexOf("const onDragEnd"),
      boardRaw.indexOf("const confirmDelete"),
    );
    assert.match(handler, /const result = await move\(/, "onDragEnd must read the result");
    const guard = handler.indexOf("if (!result.ok)");
    const toast = handler.indexOf("toast.success");
    assert.ok(guard !== -1, "onDragEnd must branch on the failure");
    assert.ok(
      guard < toast,
      "the refusal toast must come before the success toast can be reached",
    );
  });

  test("deleting reports the refusal instead of a phantom removal", () => {
    const fn = boardRaw.slice(
      boardRaw.indexOf("const confirmDelete"),
      boardRaw.indexOf("return (", boardRaw.indexOf("const confirmDelete")),
    );
    assert.match(fn, /if \(!result\.ok\)/, "confirmDelete must branch on the failure");
    assert.match(fn, /toast\.error\("Cannot remove task"/, "the refusal must be visible");
  });
});
