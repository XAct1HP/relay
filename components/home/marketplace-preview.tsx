import Link from "next/link";

const listings = [
  {
    title: "Nike SB Dunk Low",
    details: "Size 10 • Lightly worn",
    price: "$285",
  },
  {
    title: "Jordan 4 Bred Reimagined",
    details: "Size 11 • DS",
    price: "$332",
  },
  {
    title: "Yeezy Boost 350 V2",
    details: "Size 9.5 • Excellent condition",
    price: "$210",
  },
  {
    title: "New Balance 9060",
    details: "Size 10 • VNDS",
    price: "$168",
  },
];

export default function MarketplacePreview() {
  return (
    <section className="relative border-b border-white/10 bg-[#090b10]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(91,140,255,0.08),transparent_25%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 md:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/45">
              Marketplace
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white md:text-5xl">
              A marketplace built around the way resellers actually work.
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/65">
              Listings, offers, chat, reputation, and checkout all live inside
              Relay so buying and selling feels unified instead of fragmented.
            </p>
          </div>

          <Link
            href="/marketplace"
            className="inline-flex w-fit items-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/10"
          >
            View marketplace
          </Link>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {listings.map((listing) => (
            <div
              key={listing.title}
              className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.03]"
            >
              <div className="h-52 border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))]" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {listing.title}
                    </h3>
                    <p className="mt-1 text-sm text-white/55">
                      {listing.details}
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {listing.price}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}