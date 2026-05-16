import type { Metadata } from "next";
import { ThemeManager } from "@/components/ThemeManager";
import "./globals.css";

export const metadata: Metadata = {
  title: "Abhi's Daily Digest",
  description: "Your personalized daily information command center",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-stone-50 text-stone-900 transition-colors dark:bg-stone-950 dark:text-stone-100">
        <ThemeManager />
        {children}
      </body>
    </html>
  );
}
