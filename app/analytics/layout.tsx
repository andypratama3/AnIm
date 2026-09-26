import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Throughput, load distribution and latency trends over time.",
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
