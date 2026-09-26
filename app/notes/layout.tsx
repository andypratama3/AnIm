import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vault",
  description: "Markdown notes and decision records stored in your local vault.",
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
