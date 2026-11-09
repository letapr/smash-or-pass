import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crush Club — Smash or Pass",
  description: "Meet fictional crushes, make your choice, and join the conversation.",
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
