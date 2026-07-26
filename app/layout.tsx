import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reel Studio — AI-Powered Reel Generator",
  description:
    "Upload one photo + a one-line hook. Get back a finished, ready-to-post 9:16 reel — motion, voiceover, music, captions — in under 2 minutes.",
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
