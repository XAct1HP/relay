"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { ChevronRight } from "lucide-react";

// ── Intersection Observer hook ──────────────────────────────────────────
function useInView(ref: React.RefObject<HTMLElement | null>, options = {}) {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15, ...options }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [ref, options]);

  return isInView;
}

// ── Animated reveal wrapper ─────────────────────────────────────────────
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SHOWCASE MOCKUPS (Section 2)
// All mockups render inside a fixed-height container to prevent layout shift
// ═══════════════════════════════════════════════════════════════════════

function ProfileMockup() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-violet-500/30 text-lg font-bold text-white">
          V
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">@vaultedsoles</p>
          <p className="text-xs text-white/40">Ann Arbor, MI</p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-medium text-emerald-300">
          Trusted
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { val: "4.9", label: "rating" },
          { val: "128", label: "sales" },
          { val: "2h", label: "response" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/8 bg-white/[0.025] p-3 text-center">
            <div className="text-base font-semibold text-white">{s.val}</div>
            <div className="text-[10px] text-white/35">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-xl border border-white/6 bg-gradient-to-br from-white/[0.04] to-white/[0.01]" />
        ))}
      </div>
    </div>
  );
}

function MarketplaceMockup() {
  const items = [
    { name: "Nike SB Dunk Low", size: "10", price: "$285" },
    { name: "Jordan 4 Bred", size: "11", price: "$332" },
    { name: "Yeezy 350 V2", size: "9.5", price: "$210" },
    { name: "New Balance 9060", size: "10", price: "$168" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
        <svg className="h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-sm text-white/25">Search sneakers...</span>
      </div>
      <div className="flex gap-2">
        {["All", "Nike", "Jordan", "Yeezy"].map((f) => (
          <span
            key={f}
            className={`rounded-full px-3 py-1.5 text-[10px] font-medium ${
              f === "All" ? "bg-white/10 text-white/70" : "border border-white/8 text-white/35"
            }`}
          >
            {f}
          </span>
        ))}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.name} className="flex items-center justify-between rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg border border-white/8 bg-gradient-to-br from-white/[0.05] to-transparent" />
              <div>
                <p className="text-xs font-medium text-white/80">{item.name}</p>
                <p className="text-[10px] text-white/30">Size {item.size}</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-white">{item.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OffersMockup() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-300">M</div>
        <div className="flex-1">
          <p className="text-xs font-medium text-white/80">@mikebuys</p>
          <p className="text-[10px] text-white/30">Re: Jordan 4 Bred</p>
        </div>
        <span className="h-2 w-2 rounded-full bg-blue-400" />
      </div>
      <div className="space-y-2 px-1">
        <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-md bg-white/[0.06] px-4 py-2.5">
          <p className="text-xs text-white/60">Listed at $332 for the Breds</p>
        </div>
        <div className="max-w-[75%] rounded-2xl rounded-bl-md border border-white/8 bg-white/[0.03] px-4 py-2.5">
          <p className="text-xs text-white/60">Would you take $310?</p>
        </div>
      </div>
      <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.08] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-blue-300/60">Offer received</p>
            <p className="mt-1 text-xl font-bold text-white">$310</p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-medium text-white/60">Counter</span>
            <span className="rounded-lg bg-blue-500/30 px-3 py-1.5 text-[10px] font-semibold text-blue-200">Accept</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
        <span className="text-xs text-white/25">Type a message...</span>
      </div>
    </div>
  );
}

const showcaseScreens = [
  {
    label: "Your storefront",
    title: "A profile that works for you",
    description: "Public seller profiles with ratings, trust signals, and a curated sneaker grid. Buyers know who they are dealing with before they ever message you.",
    mockup: "profile",
  },
  {
    label: "Marketplace",
    title: "List it. Get discovered.",
    description: "Your listings live in a marketplace built for sneakers. Search, filter by size, brand, condition. Buyers find you without leaving the platform.",
    mockup: "marketplace",
  },
  {
    label: "Deals",
    title: "Negotiate and close, natively",
    description: "Messaging, offers, and counter-offers all happen inside Relay. No switching apps. No awkward DMs. Just clean deal flow from interest to checkout.",
    mockup: "offers",
  },
];

const mockupMap: Record<string, React.FC> = {
  profile: ProfileMockup,
  marketplace: MarketplaceMockup,
  offers: OffersMockup,
};

// ═══════════════════════════════════════════════════════════════════════
// WALKTHROUGH MOCKUPS (Section 4) — clickable stepper
// ═══════════════════════════════════════════════════════════════════════

function WtProfile() {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-violet-500/20 text-xl font-bold text-white">R</div>
        <div>
          <div className="h-3 w-32 rounded bg-white/15" />
          <div className="mt-2 h-2 w-20 rounded bg-white/8" />
        </div>
      </div>
      <div className="h-px bg-white/6" />
      <div className="grid grid-cols-3 gap-3">
        {["Rating", "Sales", "Response"].map((l) => (
          <div key={l} className="rounded-xl bg-white/[0.04] p-3 text-center">
            <div className="mx-auto h-5 w-8 rounded bg-white/12" />
            <p className="mt-1.5 text-[9px] text-white/25">{l}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-2.5 w-full rounded bg-white/6" />
        <div className="h-2.5 w-3/4 rounded bg-white/4" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}

function WtListing() {
  return (
    <div className="space-y-4 p-5">
      <div className="flex aspect-[16/9] items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02]">
        <div className="text-center">
          <svg className="mx-auto h-6 w-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <p className="mt-1 text-[10px] text-white/20">Add photos</p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
          <p className="text-[9px] text-white/25">Sneaker name</p>
          <p className="mt-0.5 text-xs text-white/50">Jordan 4 Bred Reimagined</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[9px] text-white/25">Size</p>
            <p className="mt-0.5 text-xs text-white/50">11</p>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[9px] text-white/25">Price</p>
            <p className="mt-0.5 text-xs text-white/50">$332</p>
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
          <p className="text-[9px] text-white/25">Condition</p>
          <p className="mt-0.5 text-xs text-white/50">Deadstock</p>
        </div>
      </div>
      <div className="w-full rounded-lg bg-white/10 py-2.5 text-center text-xs font-medium text-white/60">
        Publish listing
      </div>
    </div>
  );
}

function WtMessaging() {
  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-3 border-b border-white/6 pb-3">
        <div className="h-8 w-8 rounded-full bg-blue-500/20" />
        <div>
          <p className="text-xs font-medium text-white/70">@mikebuys</p>
          <p className="text-[9px] text-white/25">Online</p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="max-w-[70%] rounded-2xl rounded-bl-sm border border-white/6 bg-white/[0.03] px-3 py-2">
          <p className="text-[11px] text-white/45">Is the Jordan 4 still available?</p>
        </div>
        <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-sm bg-white/[0.06] px-3 py-2">
          <p className="text-[11px] text-white/55">Yes! Size 11 DS. Want to make an offer?</p>
        </div>
        <div className="rounded-xl border border-blue-400/15 bg-blue-500/[0.06] p-3">
          <p className="text-[9px] uppercase tracking-wider text-blue-300/50">Offer</p>
          <p className="mt-1 text-base font-bold text-white">$310</p>
          <div className="mt-2 flex gap-2">
            <span className="rounded-md bg-white/8 px-2 py-1 text-[9px] text-white/40">Decline</span>
            <span className="rounded-md bg-blue-500/25 px-2 py-1 text-[9px] font-medium text-blue-200">Accept</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
        <span className="text-xs text-white/25">Type a message...</span>
      </div>
    </div>
  );
}

function WtCheckout() {
  return (
    <div className="space-y-4 p-5">
      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
        <p className="text-[9px] uppercase tracking-wider text-white/25">Order summary</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-white/[0.05]" />
          <div className="flex-1">
            <p className="text-xs font-medium text-white/70">Jordan 4 Bred</p>
            <p className="text-[10px] text-white/30">Size 11 - Deadstock</p>
          </div>
          <p className="text-sm font-semibold text-white">$310</p>
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
        <p className="text-[9px] uppercase tracking-wider text-white/25">Shipping</p>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-white/50">USPS Priority</p>
          <p className="text-xs text-white/40">$12.50</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/8 pt-4">
        <p className="text-xs text-white/40">Total</p>
        <p className="text-lg font-bold text-white">$322.50</p>
      </div>
      <div className="w-full rounded-xl bg-white py-3 text-center text-xs font-semibold text-black">
        Complete purchase
      </div>
      <div className="flex items-center justify-center gap-4">
        {["Buyer protection", "Tracked shipping", "Secure payment"].map((b) => (
          <span key={b} className="text-[9px] text-white/20">{b}</span>
        ))}
      </div>
    </div>
  );
}

const walkthroughSteps = [
  { number: "01", title: "Create your profile", description: "Set up your seller identity in minutes. Choose a username, add a bio, and start building a presence that buyers trust.", screen: "profile" },
  { number: "02", title: "List your inventory", description: "Upload photos, set your price, and go live. Your listings appear in the marketplace and on your public profile automatically.", screen: "listing" },
  { number: "03", title: "Connect with buyers", description: "Buyers message you, send offers, and negotiate directly. No middleman. Every deal flows through one conversation thread.", screen: "messaging" },
  { number: "04", title: "Close and ship", description: "Accept the deal, generate a shipping label, and get paid. Relay handles checkout, tracking, and payout so you can focus on the next sale.", screen: "checkout" },
];

const wtScreenMap: Record<string, React.FC> = {
  profile: WtProfile,
  listing: WtListing,
  messaging: WtMessaging,
  checkout: WtCheckout,
};

// ═══════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function Home() {
  // ── Showcase state (Section 2) ──
  const [showcaseIndex, setShowcaseIndex] = useState(0);
  const [showcasePaused, setShowcasePaused] = useState(false);
  // Reset animation key when index changes so progress bar restarts
  const [showcaseKey, setShowcaseKey] = useState(0);

  useEffect(() => {
    if (showcasePaused) return;
    const id = setInterval(() => {
      setShowcaseIndex((prev) => (prev + 1) % showcaseScreens.length);
      setShowcaseKey((k) => k + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [showcasePaused]);

  const handleShowcaseClick = (i: number) => {
    setShowcaseIndex(i);
    setShowcaseKey((k) => k + 1);
  };

  const ActiveShowcaseMockup = mockupMap[showcaseScreens[showcaseIndex].mockup];

  // ── Walkthrough state (Section 4) — now click-driven ──
  const [activeWtStep, setActiveWtStep] = useState(0);
  const ActiveWtScreen = wtScreenMap[walkthroughSteps[activeWtStep].screen];

  // ── Fee counter animation (Section 3) ──
  const feeRef = useRef<HTMLSpanElement>(null);
  const [feeVisible, setFeeVisible] = useState(false);

  useEffect(() => {
    const node = feeRef.current;
    if (!node || feeVisible) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setFeeVisible(true); observer.disconnect(); } },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [feeVisible]);

  return (
    <main className="relay-page">
      <Navbar />

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1 · HERO
      ───────────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[100dvh] items-center overflow-hidden pt-[72px]">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/[0.07] blur-[120px]" />
          <div className="absolute right-[15%] top-[20%] h-[400px] w-[400px] rounded-full bg-violet-500/[0.05] blur-[100px]" />
          <div className="absolute bottom-[10%] left-[20%] h-[300px] w-[300px] rounded-full bg-cyan-400/[0.04] blur-[80px]" />
        </div>

        <div className="relay-container relative z-10 py-24 md:py-32">
          <Reveal>
            <div className="mx-auto max-w-4xl text-center">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(124,166,255,0.6)]" />
                <span className="text-xs font-medium tracking-wide text-white/60">The reseller platform</span>
              </div>

              {/* Headline */}
              <h1 className="mt-8 text-5xl font-bold leading-[1.0] tracking-[-0.04em] sm:text-7xl md:text-8xl">
                <span className="relay-text-gradient">Where resellers</span>
                <br />
                <span className="text-white">build empires.</span>
              </h1>

              {/* Subhead */}
              <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-white/55 md:text-xl">
                Profiles, listings, offers, and messaging on one platform.
                Built for sellers who treat reselling like a business.
              </p>

              {/* CTAs */}
              <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link
                  href="/auth/signup"
                  className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-black transition-all hover:shadow-[0_0_32px_rgba(124,166,255,0.25)]"
                >
                  <span className="relative z-10">Get started</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-white opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
                <Link
                  href="/marketplace"
                  className="inline-flex items-center gap-2 text-sm font-medium text-white/50 transition hover:text-white/80"
                >
                  Explore the marketplace
                  <ChevronRight size={16} />
                </Link>
              </div>

              {/* Chips */}
              <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
                {["1% platform fee", "Seller profiles", "Direct negotiation"].map((chip, i) => (
                  <div key={chip} className="flex items-center gap-3">
                    <span className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-xs font-medium tracking-wide text-white/45">
                      {chip}
                    </span>
                    {i < 2 && <span className="h-1 w-1 rounded-full bg-white/15" />}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* Fade to next section */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--relay-bg)] to-transparent" />
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2 · VISUAL SHOWCASE
      ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-white/[0.06]">
        <div className="relay-container py-24 md:py-32">
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-300/60">The platform</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl md:text-6xl">
                Everything a reseller needs.
                <span className="block text-white/50">Nothing they don&apos;t.</span>
              </h2>
            </div>
          </Reveal>

          <Reveal className="mt-16">
            <div
              className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16"
              onMouseEnter={() => setShowcasePaused(true)}
              onMouseLeave={() => setShowcasePaused(false)}
            >
              {/* Tabs */}
              <div className="space-y-4">
                {showcaseScreens.map((screen, i) => (
                  <button
                    key={screen.label}
                    onClick={() => handleShowcaseClick(i)}
                    className={`w-full rounded-2xl border p-6 text-left transition-all duration-300 ${
                      i === showcaseIndex
                        ? "border-white/12 bg-white/[0.05]"
                        : "border-transparent bg-transparent hover:bg-white/[0.02]"
                    }`}
                  >
                    <p className={`text-xs font-medium uppercase tracking-[0.15em] transition-colors ${
                      i === showcaseIndex ? "text-blue-300/80" : "text-white/25"
                    }`}>
                      {screen.label}
                    </p>
                    <h3 className={`mt-2 text-xl font-semibold tracking-tight transition-colors sm:text-2xl ${
                      i === showcaseIndex ? "text-white" : "text-white/40"
                    }`}>
                      {screen.title}
                    </h3>
                    <p className={`mt-2 text-sm leading-relaxed transition-colors ${
                      i === showcaseIndex ? "text-white/55" : "text-white/20"
                    }`}>
                      {screen.description}
                    </p>
                    {i === showcaseIndex && !showcasePaused && (
                      <div className="mt-4 h-[2px] w-full overflow-hidden rounded-full bg-white/10">
                        <div key={showcaseKey} className="showcase-progress h-full rounded-full bg-blue-400/60" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Device frame — FIXED HEIGHT to prevent layout shift */}
              <div className="relative">
                <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-blue-500/[0.08] via-transparent to-violet-500/[0.06] blur-2xl" />
                <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-2xl backdrop-blur-xl">
                  <div className="mb-4 flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                    <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                    <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                    <div className="ml-3 flex-1 rounded-md bg-white/[0.04] px-3 py-1">
                      <span className="text-[10px] text-white/20">relay.app</span>
                    </div>
                  </div>
                  {/* Fixed height wrapper — prevents page shift between mockups */}
                  <div className="h-[420px] overflow-hidden rounded-xl border border-white/6 bg-[#0a0c10] p-4">
                    <div className="h-full overflow-y-auto relay-scrollbar">
                      <ActiveShowcaseMockup />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3 · THE PITCH (Fee comparison)
      ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-white/[0.06]">
        <div className="relay-container py-24 md:py-32">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            {/* Copy */}
            <Reveal>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-300/60">Why it matters</p>
                <h2 className="mt-5 text-3xl font-semibold leading-[1.1] tracking-[-0.04em] text-white sm:text-4xl md:text-5xl">
                  Other platforms take 9% and bury your name.
                </h2>
                <p className="mt-6 text-lg leading-relaxed text-white/50 md:text-xl">
                  Relay charges 1% and puts your brand front and center. Your
                  profile, your reputation, your customers. We just make the
                  infrastructure work.
                </p>
                <p className="mt-5 text-base leading-relaxed text-white/35">
                  Low fees are not a gimmick. They are the foundation of a platform
                  that actually wants sellers to grow. When you keep more of every
                  sale, you reinvest in better inventory, better service, and a
                  stronger business.
                </p>
              </div>
            </Reveal>

            {/* Visual contrast */}
            <Reveal delay={100}>
              <div className="relative">
                <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-blue-500/[0.06] via-transparent to-transparent blur-2xl" />
                <div className="relative space-y-4">
                  {/* Competitors */}
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 backdrop-blur">
                    <p className="text-xs uppercase tracking-[0.15em] text-white/30">Traditional platforms</p>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-5xl font-bold tracking-tight text-white/25 md:text-6xl">9%</span>
                      <span className="text-lg text-white/15">+</span>
                    </div>
                    <p className="mt-2 text-sm text-white/25">Average seller fee on major resale platforms</p>
                  </div>

                  {/* Relay */}
                  <div className="rounded-2xl border border-blue-400/20 bg-blue-500/[0.06] p-6 backdrop-blur">
                    <div className="flex items-center gap-2">
                      <p className="text-xs uppercase tracking-[0.15em] text-blue-300/70">Relay</p>
                      <span className="h-px flex-1 bg-blue-400/10" />
                    </div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span
                        ref={feeRef}
                        className={`text-5xl font-bold tracking-tight text-white transition-all duration-700 md:text-6xl ${
                          feeVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                        }`}
                      >
                        1%
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-blue-200/50">Flat platform fee. That&apos;s it.</p>
                  </div>

                  {/* Savings callout */}
                  <div className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-5 py-4">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-400/10">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                    </div>
                    <p className="text-sm text-white/45">
                      On a $300 sale, you keep <span className="font-semibold text-white/70">$297</span> instead of $273.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4 · HOW IT WORKS (Clickable stepper — no sticky scroll)
      ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-white/[0.06]">
        <div className="relay-container py-24 md:py-32">
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-300/60">How it works</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl md:text-6xl">
                Four steps to your first sale.
              </h2>
            </div>
          </Reveal>

          <Reveal className="mt-16">
            <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
              {/* Steps — clickable */}
              <div className="space-y-2">
                {walkthroughSteps.map((step, i) => (
                  <button
                    key={step.number}
                    onClick={() => setActiveWtStep(i)}
                    className={`w-full rounded-2xl border p-5 text-left transition-all duration-500 ${
                      i === activeWtStep ? "border-white/12 bg-white/[0.04]" : "border-transparent hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-500 ${
                        i === activeWtStep
                          ? "bg-blue-500/20 text-blue-300"
                          : i < activeWtStep
                            ? "bg-white/8 text-white/40"
                            : "bg-white/[0.04] text-white/20"
                      }`}>
                        {step.number}
                      </span>
                      <div>
                        <h3 className={`text-lg font-semibold transition-colors duration-500 ${
                          i === activeWtStep ? "text-white" : "text-white/30"
                        }`}>
                          {step.title}
                        </h3>
                        <div className={`overflow-hidden transition-all duration-500 ${
                          i === activeWtStep ? "mt-1.5 max-h-24 opacity-100" : "max-h-0 opacity-0"
                        }`}>
                          <p className="text-sm leading-relaxed text-white/50">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Phone frame — FIXED HEIGHT */}
              <div className="relative">
                <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-b from-blue-500/[0.05] via-transparent to-violet-500/[0.04] blur-3xl" />
                <div className="relative mx-auto w-full max-w-sm">
                  <div className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0a0c10] shadow-2xl">
                    {/* Notch */}
                    <div className="flex justify-center pb-1 pt-3">
                      <div className="h-5 w-24 rounded-full bg-black" />
                    </div>
                    {/* Fixed height screen */}
                    <div className="h-[480px] overflow-hidden">
                      <div className="h-full overflow-y-auto relay-scrollbar">
                        <ActiveWtScreen />
                      </div>
                    </div>
                    {/* Home indicator */}
                    <div className="flex justify-center py-3">
                      <div className="h-1 w-28 rounded-full bg-white/15" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 5 · FINAL CTA
      ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/[0.06] blur-[100px]" />
        </div>

        <div className="relay-container relative z-10 py-28 md:py-36">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl md:text-6xl">
                Your next sale
                <span className="block relay-text-gradient">starts here.</span>
              </h2>

              <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-white/40">
                Free to join. 1% when you sell. No monthly fees, no lock-in,
                no hidden costs.
              </p>

              <div className="mt-10">
                <Link
                  href="/auth/signup"
                  className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white px-10 py-4 text-sm font-semibold text-black transition-all hover:shadow-[0_0_40px_rgba(124,166,255,0.3)]"
                >
                  <span className="relative z-10">Get started</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-white opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </div>

              <p className="mt-6 text-sm text-white/25">
                Already have an account?{" "}
                <Link href="/auth/login" className="text-white/45 underline decoration-white/15 underline-offset-4 transition hover:text-white/70">
                  Sign in
                </Link>
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="relay-container">
          <p className="text-center text-sm text-white/30">&copy; 2026 Relay. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
