import Image from "next/image";
import SectionReveal from "@/components/home/section-reveal";

export default function NetworkSection() {
  return (
    <section className="relay-section-tight border-b border-white/10 bg-transparent">
      <div className="relay-container py-24">
        <SectionReveal>
          <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <p className="relay-eyebrow">Reseller network</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
                More than a marketplace.
                <span className="block text-white/68">
                  Relay helps resellers become known.
                </span>
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-white/65">
                The strongest sellers are not just uploading products. They are
                building a recognizable reputation. Relay should make that feel native.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
              <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.5rem] border border-white/10 bg-[#10131a] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xl font-semibold text-white">@vaulted.kicks</p>
                      <p className="mt-1 text-sm text-white/50">Ann Arbor, MI</p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                      Top seller
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-lg font-semibold text-white">4.9</div>
                      <div className="text-xs text-white/50">rating</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-lg font-semibold text-white">312</div>
                      <div className="text-xs text-white/50">sales</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-lg font-semibold text-white">2h</div>
                      <div className="text-xs text-white/50">response</div>
                    </div>
                  </div>

                  <div className="relative mt-6 h-44 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                    <Image
                      src="/branding/home/profile-sneaker-grid-1.png"
                      alt="Sneaker collection preview"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.5rem] border border-white/10 bg-[#10131a] p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Reputation first
                    </p>
                    <p className="mt-3 text-sm leading-7 text-white/64">
                      Buyers quickly understand who they are dealing with.
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-[#10131a] p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Direct communication
                    </p>
                    <p className="mt-3 text-sm leading-7 text-white/64">
                      Messaging and offers make negotiation feel native to the product.
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-[#10131a] p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Built for scale
                    </p>
                    <p className="mt-3 text-sm leading-7 text-white/64">
                      Turn one-off sales into long-term brand equity on the platform.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}