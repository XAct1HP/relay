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
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Relay
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Payment received
        </h1>
        <p className="mt-4 text-slate-600">
          Your payment was successful. Relay is now finalizing the order.
        </p>

        {params.session_id && (
          <p className="mt-4 text-sm text-slate-500">
            Session: {params.session_id}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/orders"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Go to Orders
          </Link>

          <Link
            href="/marketplace"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Back to Marketplace
          </Link>
        </div>
      </div>
    </main>
  );
}