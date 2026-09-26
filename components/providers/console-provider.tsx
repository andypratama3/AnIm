"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

export type Density = "comfortable" | "compact";
export type Range = "15m" | "1h" | "6h" | "24h";

type Preferences = {
  live: boolean;
  interval: number;
  density: Density;
  range: Range;
};

type ConsoleState = Preferences & {
  paletteOpen: boolean;
  focusAgent: string | null;
  setLive: (value: boolean) => void;
  setInterval: (value: number) => void;
  setDensity: (value: Density) => void;
  setRange: (value: Range) => void;
  setPaletteOpen: (value: boolean) => void;
  setFocusAgent: (value: string | null) => void;
};

const ConsoleContext = createContext<ConsoleState | null>(null);

const STORAGE_KEY = "anim.console";

const DEFAULTS: Preferences = {
  live: true,
  interval: 5000,
  density: "comfortable",
  range: "1h",
};

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: Preferences = DEFAULTS;

function readPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  if (!raw) {
    cached = DEFAULTS;
    return cached;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    cached = {
      live: typeof parsed.live === "boolean" ? parsed.live : DEFAULTS.live,
      interval: typeof parsed.interval === "number" ? parsed.interval : DEFAULTS.interval,
      density: parsed.density === "compact" ? "compact" : DEFAULTS.density,
      range: parsed.range ?? DEFAULTS.range,
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    cached = DEFAULTS;
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): Preferences {
  return DEFAULTS;
}

function writePreferences(patch: Partial<Preferences>): void {
  if (typeof window === "undefined") return;
  const next = { ...readPreferences(), ...patch };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  cachedRaw = null;
  for (const listener of listeners) listener();
}

export function resetConsolePreferences(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  cachedRaw = null;
  for (const listener of listeners) listener();
}

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const preferences = useSyncExternalStore(subscribe, readPreferences, getServerSnapshot);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusAgent, setFocusAgent] = useState<string | null>(null);

  const setLive = useCallback((value: boolean) => writePreferences({ live: value }), []);
  const setInterval = useCallback(
    (value: number) => writePreferences({ interval: value }),
    [],
  );
  const setDensity = useCallback(
    (value: Density) => writePreferences({ density: value }),
    [],
  );
  const setRange = useCallback((value: Range) => writePreferences({ range: value }), []);

  const value = useMemo<ConsoleState>(
    () => ({
      ...preferences,
      paletteOpen,
      focusAgent,
      setLive,
      setInterval,
      setDensity,
      setRange,
      setPaletteOpen,
      setFocusAgent,
    }),
    [
      preferences,
      paletteOpen,
      focusAgent,
      setLive,
      setInterval,
      setDensity,
      setRange,
    ],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole(): ConsoleState {
  const context = useContext(ConsoleContext);
  if (!context) throw new Error("useConsole must be used inside ConsoleProvider");
  return context;
}
