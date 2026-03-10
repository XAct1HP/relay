import Link from "next/link";

export default function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-[#08090d]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(91,140,255,0.18),transparent_40%)]" />
      <div className="relative mx-auto max-w-5xl px-6 py-24 text-center md:px-10">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/45">
          Start now
        </p>
        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
          Build your sneaker business on Relay.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/65">
          Establish your reseller identity, connect with buyers, and sell with
          low fees on a platform made specifically for this market.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:scale-[1.02] hover:bg-white/90"
          >
            Create account
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/10"
          >
            Explore marketplace
          </Link>
        </div>
      </div>
    </section>
  );
}