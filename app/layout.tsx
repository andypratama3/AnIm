import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Hermes Mesh Monitor", description: "Real-time multi-agent monitoring" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-neutral-950 text-neutral-50">
        <div className="flex h-screen overflow-hidden">
          <aside className="w-64 border-r bg-neutral-900 flex flex-col shrink-0">
            <div className="h-14 flex items-center px-4 font-bold">Hermes Mesh</div>
            <nav className="flex-1 p-3 space-y-1 text-sm">
              {["/","/agents","/kanban","/activity","/analytics","/notes","/settings"].map((h)=>{
                const label=h==="/"?"Overview":h.slice(1).replace("/"," ").replace(/\b\w/g,c=>c.toUpperCase());
                return <a key={h} href={h} className="block px-3 py-2 rounded hover:bg-neutral-800">{label}</a>;
              })}
            </nav>
            <div className="p-3 text-xs text-neutral-500">v1.0 · 7 profiles</div>
          </aside>
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="h-14 border-b bg-neutral-900 flex items-center justify-between px-6">
              <span className="text-sm font-medium">Multi-Agent Dashboard</span>
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Gateway Online</span>
            </header>
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
