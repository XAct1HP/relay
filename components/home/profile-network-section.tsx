export default function ProfileNetworkSection() {
  return (
    <section className="relative border-b border-white/10 bg-[#0b0d12]">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 md:px-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/45">
            Reseller network
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white md:text-5xl">
            More than a marketplace.
            <span className="block text-white/65">
              Relay helps resellers grow a recognizable presence.
            </span>
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-white/65">
            The best resellers are building brands, not just posting listings.
            Relay gives them profiles, reviews, visibility, and direct access to
            buyers in one ecosystem.
          </p>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
          <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[1.5rem] border border-white/10 bg-[#10131a] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-semibold text-white">
                    @vaulted.kicks
                  </p>
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

              <div className="mt-6 h-44 rounded-2xl border border-dashed border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]" />
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-white/10 bg-[#10131a] p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Reputation first
                </p>
                <p className="mt-3 text-sm leading-7 text-white/65">
                  Buyers can quickly understand who they are dealing with.
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-[#10131a] p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Direct communication
                </p>
                <p className="mt-3 text-sm leading-7 text-white/65">
                  Chat and offers make negotiation feel native to the platform.
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-[#10131a] p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Built for growth
                </p>
                <p className="mt-3 text-sm leading-7 text-white/65">
                  Resellers can turn one-off transactions into long-term brand equity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}