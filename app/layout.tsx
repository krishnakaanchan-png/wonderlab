import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WonderLab — pictures into possibilities",
  description:
    "Turn explanatory pictures into detailed animated cutaways and interactive explorations with Meta Muse.",
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
      <body>{children}</body>
    </html>
  );
}
