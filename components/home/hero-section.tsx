import Image from "next/image";
import Link from "next/link";
import SectionReveal from "@/components/home/section-reveal";

const stats = [
  { value: "1%", label: "platform fee" },
  { value: "Profiles", label: "built for resellers" },
  { value: "Offers", label: "native deal flow" },
];

export default function HeroSection() {
  return (
    <section className="relay-section overflow-hidden border-b border-white/10 bg-transparent">
      <div className="relay-container relative py-20 md:py-24">
        <SectionReveal>
          <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white/70 backdrop-blur">
                The professional platform for sneaker resellers
              </div>

              <h1 className="mt-8 text-5xl font-semibold leading-[0.94] tracking-[-0.05em] text-white md:text-7xl">
                Be where sneaker resellers
                <span className="block relay-text-gradient">build their brand.</span>
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68 md:text-xl">
                Relay combines public reseller profiles, marketplace listings,
                direct messaging, offers, and low fees into one platform designed
                to help serious sneaker sellers grow.
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/marketplace"
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:scale-[1.02] hover:bg-white/90"
                >
                  Browse marketplace
                </Link>

                <Link
                  href="/sell"
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                >
                  Start selling
                </Link>
              </div>

              <div className="mt-14 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur"
                  >
                    <div className="text-2xl font-semibold text-white">{stat.value}</div>
                    <div className="mt-1 text-sm text-white/55">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-blue-500/20 via-transparent to-violet-500/18 blur-2xl" />

              <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                      Relay profile
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      @vaultedsoles
                    </p>
                  </div>

                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                    Trusted seller
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.5rem] border border-white/10 bg-[#0e1118] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-white">
                          Air Jordan 1 Retro High
                        </p>
                        <p className="mt-1 text-sm text-white/50">
                          Size 10.5 • DS • Chicago
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-semibold text-white">$410</p>
                        <p className="text-xs text-white/40">Live listing</p>
                      </div>
                    </div>

                    <div className="relative mt-4 h-44 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                      <Image
                        src="/branding/home/jordan1-chicago.png"
                        alt="Air Jordan 1 Retro High Chicago"
                        fill
                        priority
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-[1.5rem] border border-white/10 bg-[#0e1118] p-5">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Reputation
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-white">4.9★</p>
                      <p className="mt-1 text-sm text-white/50">128 completed sales</p>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-[#0e1118] p-5">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Response time
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-white">24h</p>
                      <p className="mt-1 text-sm text-white/50">average reply window</p>
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-[#0e1118] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-sm font-medium text-white">Offers & chat</p>
                      <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs text-blue-300">
                        Native negotiation
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                        Buyer offered <span className="font-semibold text-white">$390</span>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                        Seller countered at <span className="font-semibold text-white">$402</span>
                      </div>
                    </div>
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