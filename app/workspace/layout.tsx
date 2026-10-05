import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Office view of your agent workforce with real-time activity visualization.",
};

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
