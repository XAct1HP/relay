import Link from "next/link";

type SuccessPageProps = {
  searchParams: Promise<{
    session_id?: string;
  }>;
};

export default async function CheckoutSuccessPage({
  searchParams,
}: SuccessPageProps) {
  const params = await searchParams;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06070b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_24%)]" />
      <div className="absolute inset-0 bg-[#06070b]/82" />

      <div className="relative mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-2xl text-emerald-300">
            ✓
          </div>

          <p className="mt-6 text-xs uppercase tracking-[0.24em] text-white/40">
            Payment received
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            Order confirmed.
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/60 sm:text-base">
            Your payment was successful and Relay is now finalizing the order details.
          </p>

          {params.session_id && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/52">
              Session: {params.session_id}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/orders"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Go to orders
            </Link>

            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              Back to marketplace
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}