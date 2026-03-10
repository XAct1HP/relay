import SectionReveal from "@/components/home/section-reveal";

const items = [
  {
    eyebrow: "Professional identity",
    title: "Build a reseller brand buyers recognize",
    description:
      "Relay gives every seller a public-facing identity with reviews, sales history, and visible trust signals.",
  },
  {
    eyebrow: "Built-in marketplace",
    title: "Move inventory without leaving the platform",
    description:
      "Listings, offers, messaging, and checkout all live together so buying and selling feels unified.",
  },
  {
    eyebrow: "Seller-first economics",
    title: "Keep more of every sale",
    description:
      "Relay is designed around low fees so resellers can protect margin while still looking professional.",
  },
];

export default function ValueProps() {
  return (
    <section className="relay-section-tight border-b border-white/10 bg-transparent">
      <div className="relay-container py-24">
        <SectionReveal>
          <div className="max-w-3xl">
            <p className="relay-eyebrow">Why Relay</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
              Relay should feel like the place where sneaker resellers operate at a higher level.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/65">
              Not just another listing site. A platform where sellers build credibility,
              communicate directly, and run a real business.
            </p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.title}
                className="group rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-7 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.05]"
              >
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-300/80">
                  {item.eyebrow}
                </p>
                <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-white">
                  {item.title}
                </h3>
                <p className="mt-4 text-base leading-7 text-white/62">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}