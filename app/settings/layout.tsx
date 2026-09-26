import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Runtime configuration, appearance, density, refresh and gateway status.",
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
