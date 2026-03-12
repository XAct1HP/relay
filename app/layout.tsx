import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/app/components/navbar";
import MobileBottomNav from "@/app/components/mobile-bottom-nav";

export const metadata: Metadata = {
  title: {
    default: "Relay",
    template: "%s | Relay",
  },
  description:
    "Relay is the professional platform for sneaker resellers — profiles, listings, messaging, offers, and low fees in one place.",
  icons: {
    icon: "/favicon.ico",
    apple: "/branding/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#06070a] text-white antialiased">
        <div className="relative isolate min-h-screen">
          <Navbar />
          <div className="relative z-10 pb-24 md:pb-0">{children}</div>
          <MobileBottomNav />
        </div>
      </body>
    </html>
  );
}