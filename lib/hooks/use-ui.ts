"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const neverChanges = () => () => {};

export function useMounted(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function useTicker(intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return tick;
}

export function useInterval(callback: () => void, delay: number | null): void {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = window.setInterval(() => saved.current(), delay);
    return () => window.clearInterval(id);
  }, [delay]);
}

export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    const delta = target - origin;

    if (Math.abs(delta) < 0.0001) {
      setValue(target);
      return;
    }

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(origin + delta * eased);
      if (t < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        from.current = target;
      }
    };

    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = target;
    };
  }, [target, durationMs]);

  return value;
}

export function useCopyToClipboard(resetMs = 1600): [boolean, (value: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), resetMs);
    return () => window.clearTimeout(id);
  }, [copied, resetMs]);

  const copy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, []);

  return [copied, copy];
}

type Combo = { combo: (event: KeyboardEvent) => boolean; handler: () => void };

export function useKeyCombo(combos: Combo[]): void {
  const saved = useRef(combos);
  useEffect(() => {
    saved.current = combos;
  }, [combos]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      for (const { combo, handler } of saved.current) {
        if (combo(event)) {
          if (typing && !event.metaKey && !event.ctrlKey) continue;
          event.preventDefault();
          handler();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function useDebouncedValue<T>(value: T, delay = 220): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

