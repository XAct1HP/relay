import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-73px)] bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-6 py-24 text-center">
        <Image
          src="/branding/relay-logo.png"
          alt="Relay"
          width={320}
          height={120}
          priority
          className="h-auto w-[220px] object-contain sm:w-[280px]"
        />

        <h1 className="mt-8 max-w-4xl text-5xl font-bold tracking-tight sm:text-6xl">
          The sneaker reseller network.
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          Buy, sell, message, track orders, and build your reseller reputation in one place.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/marketplace"
            className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800"
          >
            Browse Marketplace
          </Link>

          <Link
            href="/sell"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium text-slate-900 hover:bg-slate-100"
          >
            Start Selling
          </Link>
        </div>

        <div className="mt-16 grid w-full max-w-5xl gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Build Trust</h2>
            <p className="mt-3 text-slate-600">
              Public reseller profiles, reviews, and completed sales help build your reputation.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Move Inventory</h2>
            <p className="mt-3 text-slate-600">
              Post listings, manage pricing, and connect directly with buyers through messaging.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Track Transactions</h2>
            <p className="mt-3 text-slate-600">
              Relay keeps orders, reviews, and listing status organized in one workflow.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}