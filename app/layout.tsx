import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/Nav";
import { ChatProvider } from "@/components/ChatContext";
import { ChatDrawer } from "@/components/ChatDrawer";

export const metadata: Metadata = {
  title: "prism",
  description: "Local control surface for the job-application workflow.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ChatProvider>
          <TopNav />
          {children}
          <ChatDrawer />
        </ChatProvider>
      </body>
    </html>
  );
}
