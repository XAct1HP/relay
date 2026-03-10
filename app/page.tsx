import HeroSection from "@/components/home/hero-section";
import ValueProps from "@/components/home/value-props";
import MarketplacePreview from "@/components/home/marketplace-preview";
import NetworkSection from "@/components/home/network-section";
import FeeComparison from "@/components/home/fee-comparison";
import HowItWorks from "@/components/home/how-it-works";
import FinalCta from "@/components/home/final-cta";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-transparent text-white">
      <div className="relay-site-bg" />
      <HeroSection />
      <ValueProps />
      <MarketplacePreview />
      <NetworkSection />
      <FeeComparison />
      <HowItWorks />
      <FinalCta />
    </main>
  );
}