import type { Metadata } from "next";
import { DiscussionPage } from "@/components/dashboard/discussion-page";

export const metadata: Metadata = {
  title: "Discussion",
  description:
    "Address any agent on the mesh, follow peer review, and keep the owner inbox limited to verified work.",
};

export default function Page() {
  return <DiscussionPage />;
}
