import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notes",
  description:
    "The real Hermes Obsidian vault on this host, read-only. Selecting a note streams its body from disk.",
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
