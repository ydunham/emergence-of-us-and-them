import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/lora/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Emergence of Us and Them",
  description: "An interactive classroom simulation of group genesis through reciprocity and transitivity.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${GeistSans.variable} ${GeistMono.variable}`}>{children}</body></html>;
}
