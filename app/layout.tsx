import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ElevateAI Coach Platform",
  description: "Your leads. Your voice. AI does the writing.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
