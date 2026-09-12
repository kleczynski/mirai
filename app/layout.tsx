import type { Metadata } from "next";
import "./globals.css";
import "./modern-ui.css";
import MiraiClerkProvider from "./clerk-provider";

export const metadata: Metadata = {
  title: "Mirai — From conversation to a working product",
  description: "Your workspace for client discovery, tailored demos and feedback.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased mirai-modern">
        <MiraiClerkProvider>{children}</MiraiClerkProvider>
      </body>
    </html>
  );
}
