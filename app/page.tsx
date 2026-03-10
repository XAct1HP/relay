import HeroSection from "@/components/home/hero-section";
import ValueProps from "@/components/home/value-props";
import MarketplacePreview from "@/components/home/marketplace-preview";
import NetworkSection from "@/components/home/profile-network-section";
import FeeComparison from "@/components/home/fees-section";
import HowItWorks from "@/components/home/how-it-works";
import FinalCta from "@/components/home/final-cta";

export default function Home() {
  return (
    <main className="bg-[#06070a] text-white">
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