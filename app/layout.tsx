import type { Metadata } from "next";
import MobileTabBar from "@/components/MobileTabBar";
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
      <body>
        <div className="pb-16 md:pb-0">
          {children}
        </div>
        <MobileTabBar />
      </body>
    </html>
  );
}
