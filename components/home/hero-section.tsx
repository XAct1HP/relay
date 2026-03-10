import Link from "next/link";

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(84,120,255,0.22),transparent_38%),linear-gradient(to_bottom,#08090c, #0b0d12_45%, #0a0b0f)]" />
      <div className="absolute inset-0 opacity-30">
        <div className="absolute left-[-10%] top-20 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute right-[-8%] top-40 h-80 w-80 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="absolute bottom-[-10%] left-1/3 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:72px_72px]" />

      <div className="relative mx-auto flex min-h-[88vh] max-w-7xl items-center px-6 py-24 md:px-10">
        <div className="grid w-full gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/70 backdrop-blur">
              The platform for sneaker resellers
            </div>

            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-white md:text-7xl">
              Build your reseller brand.
              <span className="block text-white/70">
                Buy, sell, and connect on Relay.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70 md:text-xl">
              Relay combines a professional profile, built-in marketplace,
              direct messaging, and low fees into one platform designed for
              sneaker resellers.
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
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:border-white/25 hover:bg-white/10"
              >
                Start selling
              </Link>
            </div>

            <div className="mt-14 grid max-w-2xl grid-cols-3 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-2xl font-semibold text-white">1%</div>
                <div className="mt-1 text-sm text-white/60">platform fee</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-2xl font-semibold text-white">Profiles</div>
                <div className="mt-1 text-sm text-white/60">
                  built for resellers
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-2xl font-semibold text-white">Direct</div>
                <div className="mt-1 text-sm text-white/60">
                  offers & messaging
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-blue-500/20 via-transparent to-violet-500/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                    Relay profile
                  </p>
                  <p className="mt-1 text-sm font-medium text-white">
                    @rareheat.supply
                  </p>
                </div>
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  Trusted seller
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-2xl border border-white/10 bg-[#0f1117] p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-white">
                        Air Jordan 1 Retro High
                      </p>
                      <p className="mt-1 text-sm text-white/55">
                        Size 10.5 • DS • Chicago
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-white">$410</p>
                      <p className="text-xs text-white/45">Listed on Relay</p>
                    </div>
                  </div>
                  <div className="h-40 rounded-xl border border-dashed border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-[#0f1117] p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Reputation
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-white">
                      4.9★
                    </p>
                    <p className="mt-1 text-sm text-white/55">128 completed sales</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#0f1117] p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                      Activity
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-white">24h</p>
                    <p className="mt-1 text-sm text-white/55">
                      Response time average
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0f1117] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm font-medium text-white">
                      Messages & offers
                    </p>
                    <span className="rounded-full bg-blue-500/15 px-2 py-1 text-xs text-blue-300">
                      Live negotiation
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                      Buyer offered <span className="font-semibold text-white">$390</span> on
                      Jordan 1 Chicago
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                      Counter sent for <span className="font-semibold text-white">$402</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}