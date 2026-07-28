import type { Metadata } from "next";
import "./globals.css";
import DashboardLayout from "./components/DashboardLayout";

export const metadata: Metadata = {
  title: "HarNug Studio",
  description: "AI Creator Studio for YouTube Shorts",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <DashboardLayout>{children}</DashboardLayout>
      </body>
    </html>
  );
}
