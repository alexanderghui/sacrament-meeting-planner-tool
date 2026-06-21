import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Sacrament Meeting Planner",
  description:
    "Plan sacrament meeting speakers, prayers, and hymns, and track ward speaking history",
  applicationName: "Sacrament Planner",
  // Launch fullscreen (no Safari chrome) with a custom label when added to the
  // iOS/iPadOS home screen.
  appleWebApp: {
    capable: true,
    title: "Sacrament Planner",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#006184",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sourceSans.variable} antialiased`}>
      <body style={{ fontFamily: "var(--font-source-sans), sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
