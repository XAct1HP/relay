const items = [
  {
    eyebrow: "Professional identity",
    title: "Build your reseller brand",
    description:
      "Create a public profile with listings, reviews, transaction history, and a reputation buyers can trust.",
  },
  {
    eyebrow: "Built-in marketplace",
    title: "List and sell in one place",
    description:
      "Relay combines discovery, messaging, offers, checkout, and fulfillment so deals happen faster.",
  },
  {
    eyebrow: "Low fees",
    title: "Keep more profit",
    description:
      "Relay is built to be reseller-friendly, with dramatically lower fees than legacy marketplaces.",
  },
];

export default function ValueProps() {
  return (
    <section className="relative border-b border-white/10 bg-[#0b0d12]">
      <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 md:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/45">
            Why Relay
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white md:text-5xl">
            The home page should make one thing obvious:
            <span className="block text-white/65">
              Relay is where sneaker resellers build serious businesses.
            </span>
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.title}
              className="group rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-7 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.05]"
            >
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-300/80">
                {item.eyebrow}
              </p>
              <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-white">
                {item.title}
              </h3>
              <p className="mt-4 text-base leading-7 text-white/65">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}