const steps = [
  {
    number: "01",
    title: "Create your profile",
    description:
      "Set up a professional reseller identity with listings, reviews, and visible credibility.",
  },
  {
    number: "02",
    title: "List or discover sneakers",
    description:
      "Use Relay as your storefront and marketplace at the same time.",
  },
  {
    number: "03",
    title: "Close deals directly",
    description:
      "Message, negotiate, accept offers, and move to checkout without leaving the platform.",
  },
];

export default function HowItWorks() {
  return (
    <section className="border-b border-white/10 bg-[#0b0d12]">
      <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/45">
            How it works
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white md:text-5xl">
            Relay keeps the workflow simple.
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-7"
            >
              <div className="text-sm font-medium tracking-[0.2em] text-blue-300/80">
                {step.number}
              </div>
              <h3 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-white">
                {step.title}
              </h3>
              <p className="mt-4 text-base leading-7 text-white/65">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}