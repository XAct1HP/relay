import "./globals.css";
import Navbar from "@/app/components/navbar";
import MobileBottomNav from "@/app/components/mobile-bottom-nav";

export const metadata = {
  title: "Relay",
  description: "Sneaker marketplace",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#06070a] text-white">
        <Navbar />

        {/* page content */}
        <main className="pb-20 md:pb-0">
          {children}
        </main>

        {/* mobile bottom nav */}
        <MobileBottomNav />
      </body>
    </html>
  );
}