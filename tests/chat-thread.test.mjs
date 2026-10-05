import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, describe } from "node:test";

/**
 * The thread must read as a messenger, and must not move under the reader.
 *
 * Two defects, both invisible to a type checker.
 *
 * The outgoing bubble was `bg-brand/12` - a 12% tint - against an incoming
 * `bg-surface-3`. Both sides were pale and near-identical, so the one thing a
 * messenger exists to convey, who said what, was invisible. Solid fill plus a
 * paired foreground token is the whole point; the bubble also needed a tail
 * that points at its sender, and runs from one sender had to group instead of
 * repeating an avatar and a timestamp on every line.
 *
 * `text-on-brand` was used against a token that did not exist, so on a solid
 * fill the text inherited the default colour and had no guaranteed contrast.
 *
 * The polling added for realtime made a second bug: `loadTranscript` replaced
 * the message array on every poll, and the scroll effect keyed on `messages`
 * therefore smooth-scrolled to the bottom several times a minute, so scrolling
 * back through history was impossible.
 *
 * These read the sources; the contrast failure and the scroll hijack are only
 * observable in a browser.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [pageRaw, cssRaw] = await Promise.all([
  read("components/dashboard/discussion-page.tsx"),
  read("app/globals.css"),
]);

const page = pageRaw;
const css = cssRaw;

describe("the outgoing bubble is a solid fill with readable text", () => {
  test("it is not a low-opacity tint of the brand", () => {
    // A tint is indistinguishable from the incoming surface, which is the
    // failure this replaced.
    assert.doesNotMatch(
      page,
      /bg-brand\/\d+[^"]*"[\s\S]{0,80}?from === "you"/,
      "the outgoing bubble is a translucent tint again",
    );
    assert.match(page, /bg-brand text-on-brand/, "the outgoing bubble must be a solid brand fill");
  });

  test("the paired foreground token actually exists", () => {
    // `text-on-brand` was referenced while `--on-brand` was undefined, which
    // left solid bubbles with no guaranteed contrast.
    assert.match(css, /--on-brand:/, "--on-brand is referenced but never defined");
    assert.match(css, /--color-on-brand:\s*var\(--on-brand\)/, "the token is not exposed to Tailwind");
  });

  test("both themes define it, and not with the same value", () => {
    const values = [...css.matchAll(/--on-brand:\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.ok(values.length >= 2, "the token must be defined for light and dark");
    assert.notEqual(
      values[0],
      values[1],
      "one value cannot be readable on both a dark and a light brand fill",
    );
  });

  test("bubbles carry a tail pointing at their sender", () => {
    // Bottom-right for our own messages, bottom-left for the agent's. Asserted
    // as the four-value shorthand that replaced the old `rounded-br-md` pair:
    // the project redefines the radius scale, so a single `rounded-2xl` body
    // resolved to 36px and read as a stadium.
    assert.match(page, /RADIUS_MINE = "rounded-\[18px_18px_6px_18px\]"/, "the outgoing bubble needs its tail");
    assert.match(page, /RADIUS_THEIRS = "rounded-\[18px_18px_18px_6px\]"/, "the incoming bubble needs its tail");
    assert.match(page, /endsGroup \? \(mine \? RADIUS_MINE : RADIUS_THEIRS\)/, "the tail belongs to the last message in a run");
  });
});

describe("runs from one sender are grouped", () => {
  test("a group shows one avatar and one timestamp", () => {
    assert.match(page, /startsGroup/, "grouping must be computed, not per-message");
    assert.match(page, /endsGroup/, "the tail and timestamp belong to the last message in a run");
  });

  test("the avatar is the agent's identity, not a generic chip", () => {
    assert.match(page, /function AgentAvatar/, "agents need a real avatar");
    assert.doesNotMatch(page, /<CpuIcon\s*\/?>/, "a generic chip makes every agent look identical");
  });
});

describe("a slow agent is visibly working", () => {
  test("an in-flight turn shows a typing indicator in the thread", () => {
    assert.match(page, /function TypingBubble/, "no typing indicator in the thread");
    assert.match(page, /\{sending \? <TypingBubble/, "the indicator is never shown while sending");
  });
});

describe("the thread does not move under the reader", () => {
  test("an unchanged poll does not replace the message array", () => {
    // A fresh array from `response.json()` on every poll re-fires the scroll
    // effect, which drags the view to the bottom mid-read.
    assert.match(page, /function sameMessages/, "no change detection for polled transcripts");
    assert.match(
      page,
      /setMessages\(\(current\) => \(sameMessages\(current, next\) \? current : next\)\)/,
      "an unchanged poll still replaces state and re-scrolls",
    );
  });

  test("the thread follows the tail only when the reader is already there", () => {
    assert.match(page, /atBottomRef/, "scroll position is not tracked");
    assert.match(page, /onScroll=/, "the scroll container does not report its position");
  });

  test("sending always brings your own message into view", () => {
    assert.match(page, /forceScrollRef\.current = true/, "sending from scrolled-back must still reveal the message");
  });
});
