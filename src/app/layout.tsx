import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/layout/AuthProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Relay | The Sneaker Marketplace",
  description: "Buy and sell authentic sneakers with low fees. Relay is the premier marketplace for sneaker enthusiasts.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/branding/apple-touch-icon.png",
  },
  openGraph: {
    title: "Relay | The Sneaker Marketplace",
    description: "Buy and sell authentic sneakers with low fees. Build your brand, grow your audience, and keep more of your profit.",
    images: ["/branding/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay | The Sneaker Marketplace",
    description: "Buy and sell authentic sneakers with low fees. Build your brand, grow your audience, and keep more of your profit.",
    images: ["/branding/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen overflow-x-hidden`}>
        <div className="relay-site-bg" />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
