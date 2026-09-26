import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kanban",
  description: "Backlog, in-progress, review and done work routed through the mesh.",
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
