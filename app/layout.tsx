import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

import AuthNav from "@/app/components/AuthNav";
import { LanguageButton } from "@/app/components/LanguageButton";

export const metadata: Metadata = {
  title: "Sidetick V0",
  description:
    "Sidetick V0 — billetterie Web2 anti-fraude avec revente officielle et fan score.",
};

function SiteHeader() {
  return (
    <header className="flex items-center justify-between">
      <Link
        href="/"
        className="text-xl font-semibold tracking-wide hover:opacity-90"
      >
        Sidetick <span className="text-[#7A3CFF]">V0</span>
      </Link>

      <nav className="flex items-center gap-4 text-sm text-white/70">
        <LanguageButton />
        <AuthNav />
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-white/10 pt-6 text-xs text-white/60">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>© {new Date().getFullYear()} Sidetick</div>
        <div className="flex gap-4">
          <span className="hover:text-white/80">Terms</span>
          <span className="hover:text-white/80">Privacy</span>
          <span className="hover:text-white/80">Contact</span>
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-[#1B003B] text-white">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6">
          <SiteHeader />
          <main className="flex-1 pt-8">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}