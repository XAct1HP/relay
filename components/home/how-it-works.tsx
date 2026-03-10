import SectionReveal from "@/components/home/section-reveal";

const steps = [
  {
    number: "01",
    title: "Create your reseller profile",
    description:
      "Establish a credible identity with visible reviews, trust signals, and a public presence.",
  },
  {
    number: "02",
    title: "List or discover sneakers",
    description:
      "Use Relay as both your storefront and your discovery layer inside the same platform.",
  },
  {
    number: "03",
    title: "Close deals directly",
    description:
      "Message, negotiate, accept offers, and move into checkout without leaving the ecosystem.",
  },
];

export default function HowItWorks() {
  return (
    <section className="relay-section-tight border-b border-white/10 bg-transparent">
      <div className="relay-container py-24">
        <SectionReveal>
          <div className="max-w-2xl">
            <p className="relay-eyebrow">How it works</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
              Relay keeps the workflow simple.
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.number}
                className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-7"
              >
                <div className="text-sm font-medium tracking-[0.2em] text-blue-300/80">
                  {step.number}
                </div>
                <h3 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-white">
                  {step.title}
                </h3>
                <p className="mt-4 text-base leading-7 text-white/62">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}