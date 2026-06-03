import type { Metadata } from "next";
import MobileTabBar from "@/components/MobileTabBar";
import CommandPalette from "@/components/CommandPalette";
import PersonPanelProvider from "@/components/ambient/PersonPanelProvider";
import DharaProvider from "@/components/dhara/DharaProvider";
import DharaBar from "@/components/dhara/DharaBar";
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
        <DharaProvider>
          <PersonPanelProvider>
            <div className="pb-16 md:pb-0">
              {children}
            </div>
            <MobileTabBar />
            <CommandPalette />
          </PersonPanelProvider>
          <DharaBar />
        </DharaProvider>
      </body>
    </html>
  );
}
