import SectionReveal from "@/components/home/section-reveal";

const rows = [
  { name: "Traditional marketplaces", fee: "Often 9%+" },
  { name: "Seller-unfriendly resale platforms", fee: "Higher fees, weaker identity" },
  { name: "Relay", fee: "1%" },
];

export default function FeeComparison() {
  return (
    <section className="relay-section-tight overflow-hidden border-b border-white/10 bg-transparent">
      <div className="relay-container py-24">
        <SectionReveal>
          <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-blue-300/80">
                Low fees matter
              </p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white md:text-6xl">
                Better margins.
                <span className="block text-white/68">More room to grow.</span>
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/65">
                Resellers already operate on real margins. Relay should make the
                business model more attractive, not less.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <div className="space-y-4">
                {rows.map((row) => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-[#0f1219] px-5 py-5"
                  >
                    <span className="text-sm text-white/68">{row.name}</span>
                    <span
                      className={`text-lg font-semibold ${
                        row.name === "Relay" ? "text-white" : "text-white/48"
                      }`}
                    >
                      {row.fee}
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
                  Stronger seller economics and a much clearer value proposition for the brand.
                </p>
              </div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}