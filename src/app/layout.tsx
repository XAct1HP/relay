import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/layout/AuthProvider";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = "https://relayco.app";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Relay",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/branding/logo-darkmode.png` },
      description:
        "Relay is a sneaker marketplace with 1% seller fees. Built for resellers who want their own storefront, direct negotiation, and inventory management tools.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Relay",
      description: "Sneaker marketplace with 1% seller fees. Buy and sell authentic sneakers online.",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/marketplace?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Relay",
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Sell sneakers online with a 1% platform fee. Relay is the low-fee sneaker marketplace for resellers. Create a seller profile, list inventory, negotiate with buyers, and manage your sneaker business from one platform. Includes an API for inventory automation.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free to join. 1% platform fee on sales. No monthly fees, no listing fees, no hidden costs.",
      },
      featureList: [
        "Seller profiles and storefronts",
        "Sneaker marketplace with search and filters",
        "Direct messaging and offer negotiation",
        "1% platform fee on sales",
        "Inventory management API for resellers",
        "SKU-based listing with size variants",
        "Bulk pricing and inventory sync tools",
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Relay?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Relay is a sneaker marketplace built for resellers. It lets you create a seller profile, list sneakers, negotiate directly with buyers, and manage your inventory, all with just a 1% platform fee on sales.",
          },
        },
        {
          "@type": "Question",
          name: "How much does it cost to sell on Relay?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Relay charges a flat 1% platform fee on completed sales. There are no monthly fees, no listing fees, and no hidden costs. On a $300 sale, you keep $297. Compare that to 9%+ on traditional platforms like StockX or GOAT.",
          },
        },
        {
          "@type": "Question",
          name: "How do I start a sneaker reselling business on Relay?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sign up for free, create your seller profile, and start listing sneakers. Relay gives you your own storefront, direct messaging with buyers, and offer negotiation. For high-volume sellers, Relay also offers an inventory API to sync listings from your existing tools.",
          },
        },
        {
          "@type": "Question",
          name: "Is Relay a good alternative to StockX and GOAT?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Relay is designed for sellers who want lower fees and more control. With a 1% fee versus 9%+ on StockX and GOAT, seller profiles, direct buyer negotiation, and inventory API integrations, Relay is built for resellers who treat sneaker selling as a business.",
          },
        },
      ],
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Relay - Sneaker Marketplace with 1% Seller Fees | Buy & Sell Sneakers",
    template: "%s | Relay",
  },
  description:
    "Relay is the sneaker marketplace built for resellers. Sell sneakers online with just a 1% platform fee. Seller profiles, direct negotiation, inventory tools, and API integrations. The low-fee alternative to StockX and GOAT for starting a sneaker reselling business.",
  keywords: [
    "sneaker marketplace",
    "sell sneakers online",
    "sneaker reselling",
    "sneaker reselling business",
    "buy and sell sneakers",
    "low fee sneaker marketplace",
    "sneaker resale platform",
    "reseller marketplace",
    "sneaker business",
    "sell shoes online",
    "sneaker consignment",
    "StockX alternative",
    "GOAT alternative",
    "sneaker seller platform",
    "reselling platform",
    "sneaker inventory management",
  ],
  applicationName: "Relay",
  authors: [{ name: "Relay" }],
  creator: "Relay",
  publisher: "Relay",
  category: "marketplace",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/branding/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Relay",
    title: "Relay - Sneaker Marketplace with 1% Seller Fees",
    description:
      "Sell sneakers online with just a 1% fee. Relay gives resellers their own storefront, direct buyer negotiation, and inventory tools. The low-fee sneaker marketplace built for sellers who treat reselling like a business.",
    images: [
      {
        url: "/branding/og-image.png",
        width: 1200,
        height: 630,
        alt: "Relay - The sneaker marketplace built for resellers",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay - Sneaker Marketplace with 1% Seller Fees",
    description:
      "Sell sneakers with just a 1% fee. Seller profiles, direct offers, inventory API. The marketplace built for resellers.",
    images: ["/branding/og-image.png"],
  },
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.className} min-h-screen overflow-x-clip`}>
        <div className="relay-site-bg" />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
