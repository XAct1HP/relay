export default function FeesSection() {
  const competitors = [
    { name: "Traditional marketplaces", fee: "Often 9%+" },
    { name: "Seller-unfriendly platforms", fee: "High fees + weak identity" },
    { name: "Relay", fee: "1%" },
  ];

  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-[#08090d]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(91,140,255,0.16),transparent_34%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 md:px-10">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-blue-300/80">
              Low fees matter
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
              More margin.
              <span className="block text-white/65">More room to scale.</span>
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/65">
              Resellers already operate on thin margins. Relay is designed to
              help you keep more of every sale while still giving you the tools
              to look professional and close deals faster.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
            <div className="space-y-4">
              {competitors.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-[#0f1219] px-5 py-5"
                >
                  <span className="text-sm text-white/70">{item.name}</span>
                  <span
                    className={`text-lg font-semibold ${
                      item.name === "Relay" ? "text-white" : "text-white/50"
                    }`}
                  >
                    {item.fee}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-blue-400/20 bg-blue-500/10 p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-200/80">
                Relay advantage
              </p>
              <p className="mt-3 text-3xl font-semibold text-white md:text-4xl">
                1% platform fee
              </p>
              <p className="mt-2 text-sm leading-7 text-white/65">
                Better economics for sellers. Better positioning for Relay as the
                serious platform for sneaker resellers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}