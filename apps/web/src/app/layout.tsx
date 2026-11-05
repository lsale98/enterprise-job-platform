import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import "./globals.css";
import { SessionControls } from "@/features/authentication/components/session-controls";

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
      <body>
        <header className="flex items-center justify-end px-6 py-4">
          <Suspense fallback={null}>
            <SessionControls />
          </Suspense>
        </header>

        {children}
      </body>
    </html>
  );
}
