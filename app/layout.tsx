import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ConsoleProvider } from "@/components/providers/console-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { SessionGate } from "@/components/dashboard/session-gate";
import { AppShell } from "@/components/layout/app-shell";
import { BRAND } from "@/lib/brand";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `Overview · ${BRAND.name}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  keywords: ["agent mesh", "orchestration", "A2A", "observability", "AnIm", "multi-agent"],
  authors: [{ name: "Andy Pratama" }],
  openGraph: {
    title: `${BRAND.name} · ${BRAND.expansion}`,
    description: BRAND.description,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafc" },
    { media: "(prefers-color-scheme: dark)", color: "#14141a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
          themes={["dark", "light"]}
        >
          <ConsoleProvider>
            <SessionProvider>
              {/* Global, not per-page: a 401 from a task review or an agent probe
                  has to be able to put the whole console behind the sign-in card. */}
              <SessionGate>
                <AppShell>{children}</AppShell>
              </SessionGate>
            </SessionProvider>
          </ConsoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
