import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activity",
  description:
    "Task transitions and agent exchanges this console has recorded, newest first.",
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
