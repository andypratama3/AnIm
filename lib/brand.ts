export const BRAND = {
  name: "AnIm",
  full: "AnIm Mesh",
  expansion: "Agent Intelligence Mesh",
  tagline: "Real-time multi-agent orchestration console",
  description:
    "AnIm is a real-time console for supervising a mesh of autonomous agents: live topology, A2A traffic, task flow, vault knowledge and model spend.",
  version: "2.0.0",
  edge: 42,
} as const;

export const NAV_GROUPS = [
  {
    label: "Command",
    items: [
      { href: "/", label: "Overview", icon: "SquaresFour", hint: "Mesh pulse" },
      { href: "/agents", label: "Agents", icon: "Robot", hint: "26 profiles" },
      { href: "/activity", label: "Activity", icon: "Pulse", hint: "Live stream" },
    ],
  },
  {
    label: "Workflow",
    items: [
      { href: "/kanban", label: "Kanban", icon: "Kanban", hint: "Task flow" },
      { href: "/discussion", label: "Discussion", icon: "ChatDots", hint: "Agent channel" },
      { href: "/analytics", label: "Analytics", icon: "ChartLineUp", hint: "Trends" },
      { href: "/notes", label: "Vault", icon: "Notebook", hint: "Obsidian" },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: "GearSix", hint: "Config" }],
  },
] as const;

export type NavItem = (typeof NAV_GROUPS)[number]["items"][number];
export type NavHref = NavItem["href"];
