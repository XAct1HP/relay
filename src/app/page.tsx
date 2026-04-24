"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import {
  ChevronRight,
  MessageCircle,
  Check,
  Upload,
  ShoppingCart,
  Truck,
  Award,
  TrendingUp,
  Star,
  Heart,
  Sparkles,
} from "lucide-react";

// ── Intersection Observer hook ──────────────────────────────────────────
function useInView(ref: React.RefObject<HTMLElement>, options = {}) {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, ...options }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [ref, options]);

  return isInView;
}

// ── Animated reveal wrapper ─────────────────────────────────────────────
function RevealSection({
  children,
  className = "",
  style,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms`, ...style }}
      className={`transition-all duration-700 ${
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// ── Shoe card for marketplace preview ───────────────────────────────────
function ShoeCard({
  brand,
  model,
  price,
  image,
}: {
  brand: string;
  model: string;
  price: number;
  image: string;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relay-card p-0 overflow-hidden group cursor-pointer transition-all duration-300 hover:border-relay-accent/50"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative h-48 overflow-hidden bg-black/20">
        <Image
          src={image}
          alt={`${brand} ${model}`}
          fill
          className={`object-cover transition-transform duration-300 ${
            isHovered ? "scale-105" : ""
          }`}
        />
        {isHovered && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
            <Heart className="text-white" size={28} fill="white" />
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div>
          <p className="text-xs text-white/50 uppercase font-medium">{brand}</p>
          <h3 className="text-sm font-semibold text-relay-text mt-1">
            {model}
          </h3>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-lg font-bold text-relay-accent">
            ${price.toLocaleString()}
          </span>
          <div className="flex items-center gap-1 text-white/40 text-xs">
            <Star size={12} fill="currentColor" />
            <span>4.8</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function Home() {
  return (
    <main className="relay-page pt-[72px]">
      <Navbar />

      {/* ────────────────────────────────────────────────────────────────
          1 · HERO
          Lead with identity, not fees.
      ──────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 lg:py-32">
        <div className="relay-container">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — copy */}
            <RevealSection className="space-y-8">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 relay-chip">
                  <Sparkles size={14} className="text-relay-accent" />
                  <span>The professional platform for sneaker resellers</span>
                </div>

                <h1 className="text-5xl lg:text-6xl font-bold leading-[1.05] relay-text-gradient">
                  The Marketplace Built for Resellers
                </h1>

                <p className="text-lg text-white/65 max-w-lg leading-relaxed">
                  Relay gives serious sellers a public identity, direct buyer
                  relationships, and a 1% platform fee — everything you need to
                  run reselling like a real business.
                </p>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <Link
                  href="/auth/signup"
                  className="relay-button-primary gap-2 justify-center sm:justify-start"
                >
                  Start Selling
                  <ChevronRight size={18} />
                </Link>
                <Link
                  href="/marketplace"
                  className="relay-button-secondary gap-2 justify-center sm:justify-start hover:border-relay-accent/50 hover:bg-white/[0.08]"
                >
                  Browse Marketplace
                  <ChevronRight size={18} />
                </Link>
              </div>

              {/* Quick stats — the single hero mention of 1% */}
              <div className="grid grid-cols-3 gap-4 pt-8">
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-relay-accent">1%</div>
                  <p className="text-xs text-white/50 font-medium">
                    Platform Fee
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-relay-accent">$0</div>
                  <p className="text-xs text-white/50 font-medium">To List</p>
                </div>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-relay-accent">
                    Direct
                  </div>
                  <p className="text-xs text-white/50 font-medium">
                    Offers & Chat
                  </p>
                </div>
              </div>
            </RevealSection>

            {/* Right — seller profile mockup */}
            <RevealSection className="relative hidden lg:block" delay={150}>
              <div className="relative">
                <div className="absolute -inset-8 bg-gradient-to-r from-relay-accent/10 via-relay-accent/5 to-transparent rounded-[2rem] blur-3xl" />

                <div className="relay-card p-6 space-y-4 relative">
                  {/* Featured image */}
                  <div className="relative h-64 rounded-2xl overflow-hidden border border-white/10 bg-black/20">
                    <Image
                      src="/branding/home/jordan1-chicago.png"
                      alt="Air Jordan 1 Retro High Chicago"
                      fill
                      priority
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                  </div>

                  {/* Card content */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-white/50 font-medium">NIKE</p>
                      <h3 className="text-lg font-semibold text-relay-text">
                        Air Jordan 1 Retro
                      </h3>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-white/60 text-xs">Size</span>
                        <span className="text-sm font-semibold text-relay-text">
                          US 10.5
                        </span>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-white/60 text-xs">Condition</span>
                        <span className="relay-badge-success">Deadstock</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/50">Price</p>
                        <p className="text-2xl font-bold text-relay-accent">
                          $1,200
                        </p>
                      </div>
                      <button className="relay-button-primary p-3">
                        <ShoppingCart size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Floating badge */}
                <div className="absolute -top-4 -right-4 relay-card p-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs font-medium text-white/70">
                    Seller verified
                  </span>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          2 · VALUE PROPOSITIONS
          Three pillars: identity, relationships, discovery.
          Fees intentionally excluded — they get their own section.
      ──────────────────────────────────────────────────────────────── */}
      <section className="relative py-20 lg:py-32 border-t border-white/5">
        <div className="relay-container">
          <RevealSection className="text-center mb-16 space-y-4">
            <h2 className="text-4xl lg:text-5xl font-bold text-relay-text">
              What Makes Relay Different
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              Not just another listing site. A platform where sellers build
              credibility, connect directly with buyers, and grow a real
              business.
            </p>
          </RevealSection>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Your brand, your storefront */}
            <RevealSection className="group">
              <div className="relay-card p-8 space-y-4 h-full transition-all duration-300 hover:border-relay-accent/30 hover:bg-white/[0.06]">
                <div className="w-12 h-12 rounded-xl bg-relay-accent/10 flex items-center justify-center group-hover:bg-relay-accent/20 transition-colors">
                  <TrendingUp size={24} className="text-relay-accent" />
                </div>
                <h3 className="text-xl font-semibold text-relay-text">
                  Your Brand, Your Storefront
                </h3>
                <p className="text-white/65 leading-relaxed">
                  On other platforms, sellers are invisible. On Relay, you get a
                  public profile with ratings, sales history, and trust signals
                  that buyers recognize.
                </p>
                <div className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Custom public profile page</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Reviews & trust badges</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Feed posts & audience growth</span>
                  </div>
                </div>
              </div>
            </RevealSection>

            {/* Direct relationships */}
            <RevealSection className="group" delay={100}>
              <div className="relay-card p-8 space-y-4 h-full transition-all duration-300 hover:border-relay-accent/30 hover:bg-white/[0.06]">
                <div className="w-12 h-12 rounded-xl bg-relay-accent/10 flex items-center justify-center group-hover:bg-relay-accent/20 transition-colors">
                  <MessageCircle size={24} className="text-relay-accent" />
                </div>
                <h3 className="text-xl font-semibold text-relay-text">
                  Direct Buyer Relationships
                </h3>
                <p className="text-white/65 leading-relaxed">
                  Stop selling into a void. Message buyers, negotiate with
                  offers, and turn one-time sales into repeat customers — all
                  inside the platform.
                </p>
                <div className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Real-time messaging</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Native offers & negotiation</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>No switching to DMs or PayPal</span>
                  </div>
                </div>
              </div>
            </RevealSection>

            {/* Rising brand discovery */}
            <RevealSection className="group" delay={200}>
              <div className="relay-card p-8 space-y-4 h-full transition-all duration-300 hover:border-relay-accent/30 hover:bg-white/[0.06]">
                <div className="w-12 h-12 rounded-xl bg-relay-accent/10 flex items-center justify-center group-hover:bg-relay-accent/20 transition-colors">
                  <Award size={24} className="text-relay-accent" />
                </div>
                <h3 className="text-xl font-semibold text-relay-text">
                  Rising Brand Discovery
                </h3>
                <p className="text-white/65 leading-relaxed">
                  Independent designers and manufacturers get discovered by
                  enthusiasts. Launch your brand on a platform that gives new
                  names a fair shot.
                </p>
                <div className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Rising brand spotlight</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Direct access to buyers</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>No gatekeeping or pay-to-play</span>
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          3 · SELLER PROFILE SHOWCASE
          Visual proof of the "build your brand" promise.
      ──────────────────────────────────────────────────────────────── */}
      <section className="relative py-20 lg:py-32 border-t border-white/5">
        <div className="relay-container">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — copy */}
            <RevealSection className="space-y-8">
              <div className="space-y-4">
                <p className="relay-eyebrow">Reseller network</p>
                <h2 className="text-3xl lg:text-5xl font-semibold tracking-tight text-white leading-[1.1]">
                  More than a marketplace.{" "}
                  <span className="text-white/65">
                    Relay helps resellers become known.
                  </span>
                </h2>
                <p className="text-lg text-white/65 leading-relaxed max-w-xl">
                  The strongest sellers aren&apos;t just uploading products —
                  they&apos;re building a recognizable reputation. Relay makes
                  that feel native.
                </p>
              </div>

              <div className="space-y-5">
                {[
                  {
                    label: "Reputation first",
                    desc: "Buyers instantly understand who they're dealing with through ratings, reviews, and sales history.",
                  },
                  {
                    label: "Direct communication",
                    desc: "Messaging and offers make negotiation feel like part of the product, not an afterthought.",
                  },
                  {
                    label: "Built for scale",
                    desc: "Turn one-off sales into long-term brand equity on a platform designed around your growth.",
                  },
                ].map((item, idx) => (
                  <RevealSection key={idx} delay={idx * 75}>
                    <div className="flex items-start gap-4">
                      <div className="mt-1 w-8 h-8 rounded-lg bg-relay-accent/10 flex items-center justify-center flex-shrink-0">
                        <Check size={16} className="text-relay-accent" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-relay-text uppercase tracking-wide">
                          {item.label}
                        </h4>
                        <p className="text-sm text-white/60 mt-1 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </RevealSection>
                ))}
              </div>
            </RevealSection>

            {/* Right — profile card mockup */}
            <RevealSection delay={150}>
              <div className="relay-card p-5">
                <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  {/* Profile card */}
                  <div className="rounded-[1.5rem] border border-white/10 bg-[#10131a] p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xl font-semibold text-white">
                          @vaulted.kicks
                        </p>
                        <p className="mt-1 text-sm text-white/50">
                          Ann Arbor, MI
                        </p>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                        Top seller
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-3">
                      {[
                        { value: "4.9", label: "rating" },
                        { value: "312", label: "sales" },
                        { value: "2h", label: "response" },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                        >
                          <div className="text-lg font-semibold text-white">
                            {s.value}
                          </div>
                          <div className="text-xs text-white/50">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    <div className="relative mt-6 h-44 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                      <Image
                        src="/branding/home/profile-sneaker-grid-1.png"
                        alt="Sneaker collection preview"
                        fill
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                    </div>
                  </div>

                  {/* Feature callouts */}
                  <div className="space-y-4">
                    {[
                      {
                        title: "Verified identity",
                        body: "Trust badges, response times, and review scores — all visible up front.",
                      },
                      {
                        title: "Offer history",
                        body: "Buyers can see past deals, giving them confidence before they buy.",
                      },
                      {
                        title: "Growing audience",
                        body: "Feed posts and profile visits compound over time into real reach.",
                      },
                    ].map((f) => (
                      <div
                        key={f.title}
                        className="rounded-[1.5rem] border border-white/10 bg-[#10131a] p-5"
                      >
                        <p className="text-xs uppercase tracking-[0.18em] text-white/45">
                          {f.title}
                        </p>
                        <p className="mt-3 text-sm leading-7 text-white/64">
                          {f.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          4 · SELLER ECONOMICS
          The ONE section where the 1% fee gets the spotlight.
          Combines the old fee-comparison + savings calculator.
      ──────────────────────────────────────────────────────────────── */}
      <section className="relative py-20 lg:py-32 border-t border-white/5">
        <div className="relay-container">
          <RevealSection className="text-center mb-16 space-y-4">
            <h2 className="text-4xl lg:text-5xl font-bold text-relay-text">
              Better Margins Mean a Real Business
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              Resellers already operate on thin margins. Your platform
              shouldn&apos;t make that worse.
            </p>
          </RevealSection>

          <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Left — fee comparison */}
            <RevealSection>
              <div className="relay-card p-8 space-y-4 h-full">
                <p className="text-sm font-medium text-white/50 uppercase tracking-wider">
                  Platform fee comparison
                </p>

                <div className="space-y-3 pt-2">
                  {[
                    {
                      platform: "eBay",
                      fee: "12%",
                      color: "from-red-600/10 to-red-600/5",
                    },
                    {
                      platform: "GOAT",
                      fee: "9.5%",
                      color: "from-amber-600/10 to-amber-600/5",
                    },
                    {
                      platform: "StockX",
                      fee: "9%",
                      color: "from-orange-600/10 to-orange-600/5",
                    },
                  ].map((item) => (
                    <div
                      key={item.platform}
                      className={`rounded-xl p-4 flex items-center justify-between bg-gradient-to-r ${item.color} border border-white/5`}
                    >
                      <span className="text-sm font-semibold text-white/70">
                        {item.platform}
                      </span>
                      <span className="text-lg font-bold text-white/50">
                        {item.fee}
                      </span>
                    </div>
                  ))}

                  {/* Relay — the highlight */}
                  <div className="rounded-xl p-4 flex items-center justify-between bg-gradient-to-r from-relay-accent/20 to-relay-accent/5 border border-relay-accent/40 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-relay-accent/10 via-transparent to-transparent opacity-50" />
                    <span className="text-sm font-bold text-white relative z-10">
                      Relay
                    </span>
                    <span className="text-2xl font-bold text-relay-accent relative z-10">
                      1%
                    </span>
                  </div>
                </div>
              </div>
            </RevealSection>

            {/* Right — savings breakdown */}
            <RevealSection delay={100}>
              <div className="relay-card p-8 space-y-6 h-full">
                <p className="text-sm font-medium text-white/50 uppercase tracking-wider">
                  Your payout on a $200 sale
                </p>

                <div className="space-y-3">
                  {[
                    {
                      platform: "eBay",
                      fee: "12%",
                      payout: "$176",
                      color: "text-white/40",
                    },
                    {
                      platform: "GOAT",
                      fee: "9.5%",
                      payout: "$181",
                      color: "text-white/40",
                    },
                    {
                      platform: "StockX",
                      fee: "9%",
                      payout: "$182",
                      color: "text-white/40",
                    },
                  ].map((item) => (
                    <div
                      key={item.platform}
                      className="flex items-center justify-between py-2.5 border-b border-white/5"
                    >
                      <span className="text-sm text-white/50">
                        {item.platform}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-white/30">
                          {item.fee} fee
                        </span>
                        <span
                          className={`text-sm font-semibold ${item.color}`}
                        >
                          {item.payout}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-sm font-semibold text-relay-accent">
                      Relay
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-relay-accent/60">
                        1% fee
                      </span>
                      <span className="text-xl font-bold text-relay-accent">
                        $198
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                    <p className="text-sm text-white/70">
                      You keep{" "}
                      <span className="text-emerald-400 font-bold text-base">
                        $16 – $22 more
                      </span>{" "}
                      per sale on Relay
                    </p>
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          5 · MARKETPLACE PREVIEW
      ──────────────────────────────────────────────────────────────── */}
      <section className="relative py-20 lg:py-32 border-t border-white/5">
        <div className="relay-container">
          <RevealSection className="text-center mb-16 space-y-4">
            <h2 className="text-4xl lg:text-5xl font-bold text-relay-text">
              Featured Listings
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              Discover verified shoes from trusted sellers
            </p>
          </RevealSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                brand: "Nike",
                model: "Air Jordan 1 Retro High",
                price: 1200,
                image: "/branding/home/jordan1-chicago.png",
              },
              {
                brand: "Nike",
                model: "SB Dunk Low",
                price: 285,
                image: "/branding/home/sb-dunk.png",
              },
              {
                brand: "Jordan",
                model: "4 Bred Reimagined",
                price: 332,
                image: "/branding/home/jordan4-bred.png",
              },
              {
                brand: "Adidas",
                model: "Yeezy Boost 350 V2",
                price: 210,
                image: "/branding/home/yeezy-350.png",
              },
            ].map((shoe, idx) => (
              <RevealSection key={idx} delay={idx * 100}>
                <ShoeCard {...shoe} />
              </RevealSection>
            ))}
          </div>

          <RevealSection className="text-center pt-12">
            <Link href="/marketplace" className="relay-button-accent">
              Browse All Listings
              <ChevronRight size={18} />
            </Link>
          </RevealSection>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          6 · HOW IT WORKS
      ──────────────────────────────────────────────────────────────── */}
      <section className="relative py-20 lg:py-32 border-t border-white/5">
        <div className="relay-container">
          <RevealSection className="text-center mb-16 space-y-4">
            <h2 className="text-4xl lg:text-5xl font-bold text-relay-text">
              How It Works
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              Get started in minutes
            </p>
          </RevealSection>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-24 left-0 right-0 h-1 bg-gradient-to-r from-relay-accent/0 via-relay-accent/20 to-relay-accent/0" />

            {[
              {
                step: 1,
                icon: Upload,
                title: "List Your Shoes",
                desc: "Add photos, select sizes, and set your price. Takes just 5 minutes.",
                bullets: ["Multiple photos", "Size & condition options"],
              },
              {
                step: 2,
                icon: ShoppingCart,
                title: "Buyer Purchases",
                desc: "A buyer finds your listing, messages you or makes an offer, and checks out.",
                bullets: ["Instant notifications", "Native offers & chat"],
              },
              {
                step: 3,
                icon: Truck,
                title: "Ship & Get Paid",
                desc: "Ship out your shoes and receive payment. Build your seller reputation.",
                bullets: ["Fast payouts", "Seller badges & reviews"],
              },
            ].map((s, idx) => {
              const Icon = s.icon;
              return (
                <RevealSection key={idx} className="relative" delay={idx * 100}>
                  <div className="relay-card p-8 space-y-6">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-relay-accent to-relay-accent-strong flex items-center justify-center text-relay-bg font-bold text-lg relative z-10">
                      {s.step}
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xl font-semibold text-relay-text flex items-center gap-2">
                        <Icon size={20} className="text-relay-accent" />
                        {s.title}
                      </h3>
                      <p className="text-white/65">{s.desc}</p>
                    </div>
                    <div className="space-y-2 pt-4 border-t border-white/5">
                      {s.bullets.map((b) => (
                        <div
                          key={b}
                          className="flex items-center gap-2 text-sm text-white/60"
                        >
                          <Check size={16} className="text-emerald-400" />
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </RevealSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          7 · FINAL CTA
      ──────────────────────────────────────────────────────────────── */}
      <section className="relative py-24 lg:py-36 border-t border-white/5 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-relay-accent/[0.06] via-transparent to-transparent pointer-events-none" />

        <div className="relay-container relative">
          <RevealSection className="max-w-3xl mx-auto text-center space-y-8">
            <h2 className="text-4xl lg:text-5xl font-bold relay-text-gradient">
              Ready to start selling?
            </h2>
            <p className="text-xl text-white/60 leading-relaxed max-w-xl mx-auto">
              Create your seller identity, connect directly with buyers, and
              sell on a platform designed around resellers — not against them.
            </p>

            {/* Early access perks — inline, no card */}
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 pt-2">
              {[
                "Founding seller badge",
                "Shape the platform with feedback",
                "First-mover visibility",
                "Lowest fees from day one",
              ].map((perk, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm text-white/55"
                >
                  <Check size={14} className="text-emerald-400 flex-shrink-0" />
                  <span>{perk}</span>
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link
                href="/auth/signup"
                className="relay-button-primary gap-2 text-base px-8 py-3"
              >
                Join Relay Today
                <ChevronRight size={20} />
              </Link>
              <Link
                href="/marketplace"
                className="relay-button-secondary gap-2 text-base px-8 py-3 hover:border-relay-accent/50 hover:bg-white/[0.08]"
              >
                Explore Marketplace
                <ChevronRight size={20} />
              </Link>
            </div>

            <p className="text-white/40 text-sm pt-4">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="text-relay-accent hover:text-relay-accent/80 transition-colors font-medium"
              >
                Sign in
              </Link>
            </p>
          </RevealSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/5 py-8">
        <div className="relay-container">
          <p className="text-sm text-white/40 text-center">
            &copy; 2026 Relay. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
