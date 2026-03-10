import Image from "next/image";
import Link from "next/link";
import SectionReveal from "@/components/home/section-reveal";

const listings = [
  {
    title: "Nike SB Dunk Low",
    details: "Size 10 • Lightly worn",
    price: "$285",
    image: "/branding/home/sb-dunk.png",
  },
  {
    title: "Jordan 4 Bred Reimagined",
    details: "Size 11 • DS",
    price: "$332",
    image: "/branding/home/jordan4-bred.png",
  },
  {
    title: "Yeezy Boost 350 V2",
    details: "Size 9.5 • Excellent condition",
    price: "$210",
    image: "/branding/home/yeezy-350.png",
  },
  {
    title: "New Balance 9060",
    details: "Size 10 • VNDS",
    price: "$168",
    image: "/branding/home/nb-9060.png",
  },
];

export default function MarketplacePreview() {
  return (
    <section className="relay-section-tight overflow-hidden border-b border-white/10 bg-transparent">
      <div className="relay-container py-24">
        <SectionReveal>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="relay-eyebrow">Marketplace</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
                Discovery, inventory, and buyer intent in one place.
              </h2>
              <p className="mt-5 text-lg leading-8 text-white/65">
                Relay’s marketplace should feel active and credible — closer to a
                professional resale network than a basic classifieds page.
              </p>
            </div>

            <Link
              href="/marketplace"
              className="inline-flex w-fit items-center rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              View marketplace
            </Link>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {listings.map((listing) => (
              <div
                key={listing.title}
                className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.035]"
              >
                <div className="relative h-56 border-b border-white/10 bg-white/[0.02]">
                  <Image
                    src={listing.image}
                    alt={listing.title}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-white">{listing.title}</h3>
                      <p className="mt-1 text-sm text-white/50">{listing.details}</p>
                    </div>
                    <div className="text-sm font-semibold text-white">{listing.price}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}