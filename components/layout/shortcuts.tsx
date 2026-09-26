"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useConsole } from "@/components/providers/console-provider";
import { useMesh } from "@/lib/hooks/use-data";
import { useKeyCombo } from "@/lib/hooks/use-ui";
import { useFullscreen } from "@/lib/hooks/use-fullscreen";
import { toast } from "sonner";

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7"] as const;

/**
 * Global single-key shortcuts, mounted once in the shell so the same bindings
 * work on every route. Keys are ignored while typing or while a native control
 * has focus, so Space and Enter still activate buttons normally.
 */
export function GlobalShortcuts() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const {
    live,
    setLive,
    interval,
    density,
    setDensity,
    setPaletteOpen,
    setFocusAgent,
  } = useConsole();
  const { data, mutate } = useMesh();
  const fullscreen = useFullscreen();

  const agents = data?.agents ?? [];

  // Close the inspector whenever the route changes.
  useEffect(() => {
    setFocusAgent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blocked = (target: EventTarget | null): boolean => {
    const element = target as HTMLElement | null;
    if (!element) return false;
    const tag = element.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "OPTION") return true;
    if (element.isContentEditable) return true;
    if (element.getAttribute("role") === "button") return true;
    if (element.closest("[data-native-keys]")) return true;
    if (element.closest("[cmdk-root]")) return true;
    return false;
  };

  useKeyCombo([
    {
      combo: (event) =>
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key === " " &&
        !blocked(event.target),
      handler: () => {
        setLive(!live);
        toast(live ? "Live updates held" : "Live updates resumed", {
          description: live ? "The mesh snapshot is frozen." : `Polling every ${interval / 1000}s.`,
        });
      },
    },
    {
      combo: (event) =>
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "r" &&
        !blocked(event.target),
      handler: () => {
        void mutate();
        toast.success("Snapshot pulled");
      },
    },
    {
      combo: (event) =>
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "t" &&
        !blocked(event.target),
      handler: () => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        toast(`Theme: ${next}`);
      },
    },
    {
      combo: (event) =>
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "d" &&
        !blocked(event.target),
      handler: () => {
        const next = density === "comfortable" ? "compact" : "comfortable";
        setDensity(next);
        toast(`Density: ${next}`);
      },
    },
    {
      combo: (event) =>
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key === "/" &&
        !blocked(event.target),
      handler: () => setPaletteOpen(true),
    },
    ...DIGIT_KEYS.map((digit) => ({
      combo: (event: KeyboardEvent) =>
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key === digit &&
        !blocked(event.target),
      handler: () => {
        const agent = agents[Number(digit) - 1];
        if (!agent) return;
        setFocusAgent(agent.id);
        toast.message(`Inspecting ${agent.id}`, { description: agent.role });
      },
    })),
    {
      combo: (event) =>
        !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "g",
      handler: () => {
        router.push("/");
        toast("Overview");
      },
    },
    {
      // F toggles fullscreen. The browser requires a key press to count as a
      // user gesture, which is what makes requestFullscreen legal here.
      combo: (event) =>
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "f" &&
        !blocked(event.target),
      handler: () => {
        if (!fullscreen.supported) {
          toast.error("Fullscreen unavailable", {
            description: "This browser does not expose the Fullscreen API.",
          });
          return;
        }
        const entering = !fullscreen.isFullscreen;
        void fullscreen.toggle();
        toast(entering ? "Fullscreen on" : "Fullscreen off");
      },
    },
  ]);

  return null;
}
