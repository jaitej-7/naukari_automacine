import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Naukri Automachine",
  description: "Dashboard for Naukri Automachine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-300">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
              <div className="flex items-center space-x-6 text-sm font-medium">
                <Link href="/" className="flex items-center space-x-2 text-primary font-semibold text-lg">
                  <span>Naukri Bot</span>
                </Link>
                <nav className="flex items-center space-x-6 text-sm font-medium">
                  <Link href="/" className="transition-colors hover:text-foreground/80 text-foreground/60">
                    Dashboard
                  </Link>
                  <Link href="/settings" className="transition-colors hover:text-foreground/80 text-foreground/60">
                    Settings
                  </Link>
                </nav>
              </div>
              <div className="flex items-center justify-end space-x-4">
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="flex-1 container mx-auto max-w-screen-xl px-4 py-8">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
