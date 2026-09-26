"use client";

import { useEffect, useState } from "react";

function usePointer() {
  const [point, setPoint] = useState({ x: 50, y: 30 });

  useEffect(() => {
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setPoint({
          x: (event.clientX / window.innerWidth) * 100,
          y: (event.clientY / window.innerHeight) * 100,
        });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return point;
}

export function AuroraBackground() {
  const point = usePointer();

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-canvas" />

      <div
        className="absolute -top-[28vh] -left-[18vw] size-[62vw] rounded-full opacity-[0.55] blur-[110px] animate-drift"
        style={{
          background:
            "radial-gradient(circle at 40% 40%, color-mix(in oklab, var(--brand) 62%, transparent), transparent 68%)",
        }}
      />
      <div
        className="absolute -top-[12vh] right-[-14vw] size-[52vw] rounded-full opacity-45 blur-[120px] animate-drift-slow"
        style={{
          background:
            "radial-gradient(circle at 55% 45%, color-mix(in oklab, var(--brand-2) 58%, transparent), transparent 66%)",
        }}
      />
      <div
        className="absolute bottom-[-30vh] left-[24vw] size-[58vw] rounded-full opacity-35 blur-[130px] animate-drift"
        style={{
          animationDelay: "-8s",
          background:
            "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--brand-3) 52%, transparent), transparent 68%)",
        }}
      />

      <div
        className="absolute inset-0 opacity-[0.55] transition-[background] duration-1000"
        style={{
          background: `radial-gradient(60rem 40rem at ${point.x}% ${point.y}%, color-mix(in oklab, var(--brand) 9%, transparent), transparent 70%)`,
        }}
      />

      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--hairline) 1px, transparent 1px), linear-gradient(to bottom, var(--hairline) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, black 20%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, black 20%, transparent 78%)",
        }}
      />

    </div>
  );
}

export function GrainOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 opacity-[0.045] mix-blend-overlay"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
  );
}
