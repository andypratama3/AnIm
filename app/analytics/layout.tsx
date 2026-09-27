import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics",
  description:
    "Per-peer scores and roster composition. Series the host does not export stay empty rather than simulated.",
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
