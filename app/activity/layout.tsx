import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activity",
  description: "Streaming A2A, tool, heartbeat and lifecycle events from every peer.",
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
