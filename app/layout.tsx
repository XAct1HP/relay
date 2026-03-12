import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/app/components/app-shell";

export const metadata: Metadata = {
  title: {
    default: "Relay",
    template: "%s | Relay",
  },
  description:
    "Relay is the professional platform for sneaker resellers — profiles, listings, messaging, offers, and low fees in one place.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/branding/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#06070a] text-white antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}