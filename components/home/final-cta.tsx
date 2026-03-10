import Link from "next/link";
import SectionReveal from "@/components/home/section-reveal";

export default function FinalCta() {
  return (
    <section className="relay-section-tight overflow-hidden bg-transparent">
      <div className="relay-container py-24">
        <SectionReveal>
          <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-16 text-center backdrop-blur-xl md:px-10">
            <p className="relay-eyebrow">Start now</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white md:text-6xl">
              Build your sneaker business on Relay.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/65">
              Establish your reseller identity, connect directly with buyers, and
              sell with low fees on a platform built specifically for this market.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/auth/signup"
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:scale-[1.02] hover:bg-white/90"
              >
                Create account
              </Link>

              <Link
                href="/marketplace"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Explore marketplace
              </Link>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}