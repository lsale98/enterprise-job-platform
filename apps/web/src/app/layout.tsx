import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Enterprise Job Platform",
    template: "%s | Enterprise Job Platform",
  },
  description: "Enterprise platform for secure asynchronous job processing.",
  robots: {
    index: false,
    follow: false,
  },
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
