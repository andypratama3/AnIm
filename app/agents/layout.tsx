import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents",
  description: "Inspect every node in the mesh: status, model, port, tools and health.",
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
