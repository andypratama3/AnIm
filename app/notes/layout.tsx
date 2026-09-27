import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notes",
  description:
    "Working notes for this console. Seeded in-process: not the Hermes vault and not written to disk.",
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
