"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Fullscreen control backed by the Fullscreen API.
 *
 * Notes on real behaviour, so the UI never claims something it cannot do:
 *  - `isFullscreen` is driven by the `fullscreenchange` event, not by the click,
 *    so it stays correct when the user presses Esc or F11 instead.
 *  - `supported` is false on iOS Safari, which has no Element.requestFullscreen.
 *    The caller renders a real, disabled-with-reason control rather than a
 *    button that silently does nothing.
 *  - The browser requires a user gesture, so `toggle` must be called from a
 *    click or key handler, never from an effect.
 */
type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
  webkitFullscreenEnabled?: boolean;
};

function readIsFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as FullscreenDoc;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null);
}

function readSupported(): boolean {
  if (typeof document === "undefined") return true;
  const doc = document as FullscreenDoc;
  return (
    typeof doc.exitFullscreen === "function" ||
    typeof doc.webkitExitFullscreen === "function"
  );
}

function subscribeFullscreen(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
  };
}

export function useFullscreen(target?: () => HTMLElement | null) {
  // Browser-owned state (fullscreen) is read through useSyncExternalStore so
  // the value stays correct when the user leaves fullscreen with Esc or F11,
  // and no setState-in-effect lint violation is introduced.
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    readIsFullscreen,
    () => false,
  );
  const supported = useSyncExternalStore(
    subscribeFullscreen,
    readSupported,
    () => true,
  );

  const enter = useCallback(async () => {
    const doc = document as FullscreenDoc;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
    const element = (target?.() ?? document.documentElement) as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen({ navigationUI: "hide" });
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
      }
    } catch {
      // A rejected request (permission policy, no user gesture) must not throw
      // into the click handler. State stays false, which is the truth.
    }
  }, [target]);

  const exit = useCallback(async () => {
    const doc = document as FullscreenDoc;
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // ignore: state follows the event, not the promise
    }
  }, []);

  const toggle = useCallback(async () => {
    const doc = document as FullscreenDoc;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      await exit();
    } else {
      await enter();
    }
  }, [enter, exit]);

  return { isFullscreen, supported, enter, exit, toggle };
}
