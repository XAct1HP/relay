"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/layout/Navbar";
import {
  ChevronRight,
  Zap,
  Users,
  MessageCircle,
  Check,
  Upload,
  ShoppingCart,
  Truck,
  Award,
  TrendingUp,
  Star,
  Heart,
} from "lucide-react";

// Intersection Observer hook for scroll reveal animations
function useInView(ref: React.RefObject<HTMLElement>, options = {}) {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.1, ...options });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [ref, options]);

  return isInView;
}

// Animated reveal component
function RevealSection({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef(null);
  const isInView = useInView(ref);

  return (
    <div
      ref={ref}
      style={style}
      className={`transition-all duration-700 ${
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Sample shoe listing card for marketplace preview
function ShoeCard({ brand, model, price, image }: { brand: string; model: string; price: number; image: string }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relay-card p-0 overflow-hidden group cursor-pointer transition-all duration-300 hover:border-relay-accent/50"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image placeholder */}
      <div className={`relative h-48 overflow-hidden bg-gradient-to-br ${image} transition-transform duration-300 ${isHovered ? 'scale-105' : ''}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/30 font-semibold text-sm">Shoe Image</div>
        </div>
        {isHovered && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <Heart className="text-white" size={28} fill="white" />
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-xs text-white/50 uppercase font-medium">{brand}</p>
          <h3 className="text-sm font-semibold text-relay-text mt-1">{model}</h3>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-lg font-bold text-relay-accent">${price.toLocaleString()}</span>
          <div className="flex items-center gap-1 text-white/40 text-xs">
            <Star size={12} fill="currentColor" />
            <span>4.8</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="relay-page pt-[72px]">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 lg:py-32">
        <div className="relay-container">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left content */}
            <RevealSection className="space-y-8">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 relay-chip">
                  <Zap size={14} className="text-relay-accent" />
                  <span>Welcome to Relay</span>
                </div>
                <h1 className="text-5xl lg:text-6xl font-bold leading-tight relay-text-gradient">
                  The Marketplace Built for Resellers
                </h1>
                <p className="text-lg text-white/65 max-w-lg leading-relaxed">
                  Buy and sell shoes with just a 1% platform fee. Build your brand, grow your audience, and keep more of your profit.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
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

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-8">
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-relay-accent">1%</div>
                  <p className="text-xs text-white/50 font-medium">Platform Fee</p>
                </div>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-relay-accent">5K+</div>
                  <p className="text-xs text-white/50 font-medium">Verified Sellers</p>
                </div>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-relay-accent">Live</div>
                  <p className="text-xs text-white/50 font-medium">Real-Time Chat</p>
                </div>
              </div>
            </RevealSection>

            {/* Right side - Decorative card mockup */}
            <RevealSection className="relative hidden lg:block">
              <div className="relative">
                {/* Glow effect */}
                <div className="absolute -inset-8 bg-gradient-to-r from-relay-accent/10 via-relay-accent/5 to-transparent rounded-[2rem] blur-3xl" />

                {/* Main card */}
                <div className="relay-card p-6 space-y-4 relative">
                  {/* Image placeholder */}
                  <div className="h-64 rounded-2xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center overflow-hidden group">
                    <div className="text-white/20 text-center space-y-2">
                      <div className="text-sm font-medium">Featured Listing</div>
                      <div className="text-xs">Premium Sneaker</div>
                    </div>
                  </div>

                  {/* Card content */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-white/50 font-medium">NIKE</p>
                      <h3 className="text-lg font-semibold text-relay-text">Air Jordan 1 Retro</h3>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-white/60 text-xs">Size</span>
                        <span className="text-sm font-semibold text-relay-text">US 10.5</span>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-white/60 text-xs">Condition</span>
                        <span className="relay-badge-success">Deadstock</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/50">Price</p>
                        <p className="text-2xl font-bold text-relay-accent">$1,200</p>
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
                  <span className="text-xs font-medium text-white/70">Seller verified</span>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* Value Props Section */}
      <section className="relative py-20 lg:py-32 border-t border-white/5">
        <div className="relay-container">
          <RevealSection className="text-center mb-16 space-y-4">
            <h2 className="text-4xl lg:text-5xl font-bold text-relay-text">
              Why Choose Relay?
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              Everything you need to succeed as a reseller
            </p>
          </RevealSection>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Lowest Fees */}
            <RevealSection className="group">
              <div className="relay-card p-8 space-y-4 h-full transition-all duration-300 hover:border-relay-accent/30 hover:bg-white/[0.06]">
                <div className="w-12 h-12 rounded-xl bg-relay-accent/10 flex items-center justify-center group-hover:bg-relay-accent/20 transition-colors">
                  <Zap size={24} className="text-relay-accent" />
                </div>
                <h3 className="text-xl font-semibold text-relay-text">Lowest Fees</h3>
                <p className="text-white/65 leading-relaxed">
                  Just 1% platform fee vs 9-12% on competitors. Keep significantly more profit on every sale.
                </p>
                <div className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Save up to $22 per $200 sale</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Transparent pricing</span>
                  </div>
                </div>
              </div>
            </RevealSection>

            {/* Build Your Brand */}
            <RevealSection className="group" style={{ animationDelay: "100ms" }}>
              <div className="relay-card p-8 space-y-4 h-full transition-all duration-300 hover:border-relay-accent/30 hover:bg-white/[0.06]">
                <div className="w-12 h-12 rounded-xl bg-relay-accent/10 flex items-center justify-center group-hover:bg-relay-accent/20 transition-colors">
                  <TrendingUp size={24} className="text-relay-accent" />
                </div>
                <h3 className="text-xl font-semibold text-relay-text">Build Your Brand</h3>
                <p className="text-white/65 leading-relaxed">
                  Customizable seller profiles, feed posts, and audience growth tools. Build a loyal community around your reselling business.
                </p>
                <div className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Custom profile pages</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Share to your feed</span>
                  </div>
                </div>
              </div>
            </RevealSection>

            {/* New Brand Exposure */}
            <RevealSection className="group" style={{ animationDelay: "200ms" }}>
              <div className="relay-card p-8 space-y-4 h-full transition-all duration-300 hover:border-relay-accent/30 hover:bg-white/[0.06]">
                <div className="w-12 h-12 rounded-xl bg-relay-accent/10 flex items-center justify-center group-hover:bg-relay-accent/20 transition-colors">
                  <Award size={24} className="text-relay-accent" />
                </div>
                <h3 className="text-xl font-semibold text-relay-text">Brand Discovery</h3>
                <p className="text-white/65 leading-relaxed">
                  Independent designers and manufacturers get discovered by shoes enthusiasts. Launch your brand on a fair platform.
                </p>
                <div className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Rising brand spotlight</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Check size={16} className="text-emerald-400" />
                    <span>Direct buyer access</span>
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* Fee Comparison Section */}
      <section className="relative py-20 lg:py-32 border-t border-white/5">
        <div className="relay-container">
          <RevealSection className="text-center mb-16 space-y-4">
            <h2 className="text-4xl lg:text-5xl font-bold text-relay-text">
              Compare Platform Fees
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              See how much more you earn with Relay
            </p>
          </RevealSection>

          <div className="space-y-4 max-w-2xl mx-auto">
            {/* Fee rows */}
            {[
              { platform: "StockX", fee: "9%", color: "from-orange-600/10 to-orange-600/5" },
              { platform: "eBay", fee: "12%", color: "from-red-600/10 to-red-600/5" },
              { platform: "GOAT", fee: "9.5%", color: "from-amber-600/10 to-amber-600/5" },
            ].map((item) => (
              <RevealSection key={item.platform}>
                <div className={`relay-card p-6 flex items-center justify-between bg-gradient-to-r ${item.color}`}>
                  <span className="text-lg font-semibold text-relay-text">{item.platform}</span>
                  <span className="text-xl font-bold text-white/60">{item.fee}</span>
                </div>
              </RevealSection>
            ))}

            {/* Relay highlight */}
            <RevealSection style={{ animationDelay: "300ms" }}>
              <div className="relay-card p-6 flex items-center justify-between bg-gradient-to-r from-relay-accent/20 to-relay-accent/5 border-relay-accent/50 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-relay-accent/10 via-transparent to-transparent opacity-50" />
                <span className="text-lg font-bold text-relay-text relative z-10">Relay</span>
                <span className="text-2xl font-bold text-relay-accent relative z-10">1%</span>
              </div>
            </RevealSection>

            {/* Savings callout */}
            <RevealSection className="pt-8" style={{ animationDelay: "400ms" }}>
              <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-xl p-6 text-center">
                <p className="text-white/80 mb-2">On a $200 sale</p>
                <p className="text-3xl font-bold text-emerald-400">Save up to $22</p>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
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
            {/* Connecting lines (desktop only) */}
            <div className="hidden md:block absolute top-24 left-0 right-0 h-1 bg-gradient-to-r from-relay-accent/0 via-relay-accent/20 to-relay-accent/0" />

            {/* Step 1: List */}
            <RevealSection className="relative">
              <div className="relay-card p-8 space-y-6">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-relay-accent to-relay-accent-strong flex items-center justify-center text-relay-bg font-bold text-lg relative z-10">
                  1
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-relay-text flex items-center gap-2">
                    <Upload size={20} className="text-relay-accent" />
                    List Your Shoes
                  </h3>
                  <p className="text-white/65">
                    Add photos, select sizes, and set your price. Takes just 5 minutes.
                  </p>
                </div>
                <div className="space-y-2 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Check size={16} className="text-emerald-400" />
                    <span>Multiple photos</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Check size={16} className="text-emerald-400" />
                    <span>Size options</span>
                  </div>
                </div>
              </div>
            </RevealSection>

            {/* Step 2: Authenticate */}
            <RevealSection className="relative" style={{ animationDelay: "100ms" }}>
              <div className="relay-card p-8 space-y-6">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-relay-accent to-relay-accent-strong flex items-center justify-center text-relay-bg font-bold text-lg relative z-10">
                  2
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-relay-text flex items-center gap-2">
                    <ShoppingCart size={20} className="text-relay-accent" />
                    Buyer Purchases
                  </h3>
                  <p className="text-white/65">
                    A buyer finds your listing and completes checkout. Shoes get authenticated.
                  </p>
                </div>
                <div className="space-y-2 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Check size={16} className="text-emerald-400" />
                    <span>Instant notifications</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Check size={16} className="text-emerald-400" />
                    <span>Authentication process</span>
                  </div>
                </div>
              </div>
            </RevealSection>

            {/* Step 3: Ship & Get Paid */}
            <RevealSection className="relative" style={{ animationDelay: "200ms" }}>
              <div className="relay-card p-8 space-y-6">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-relay-accent to-relay-accent-strong flex items-center justify-center text-relay-bg font-bold text-lg relative z-10">
                  3
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-relay-text flex items-center gap-2">
                    <Truck size={20} className="text-relay-accent" />
                    Ship & Get Paid
                  </h3>
                  <p className="text-white/65">
                    Ship out your shoes and receive payment. Build your seller reputation.
                  </p>
                </div>
                <div className="space-y-2 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Check size={16} className="text-emerald-400" />
                    <span>Fast payouts</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Check size={16} className="text-emerald-400" />
                    <span>Seller badges</span>
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* Marketplace Preview Section */}
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
                model: "Air Jordan 1 Retro",
                price: 1200,
                image: "from-purple-600/20 to-blue-600/20",
              },
              {
                brand: "Adidas",
                model: "Yeezy 350 V2",
                price: 450,
                image: "from-pink-600/20 to-red-600/20",
              },
              {
                brand: "New Balance",
                model: "990v6",
                price: 280,
                image: "from-green-600/20 to-emerald-600/20",
              },
              {
                brand: "Puma",
                model: "Future Rider",
                price: 95,
                image: "from-cyan-600/20 to-blue-600/20",
              },
            ].map((shoe, idx) => (
              <RevealSection key={idx} style={{ animationDelay: `${idx * 100}ms` }}>
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

      {/* Community Section */}
      <section className="relative py-20 lg:py-32 border-t border-white/5">
        <div className="relay-container">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left content */}
            <RevealSection className="space-y-8">
              <div className="space-y-4">
                <h2 className="text-4xl lg:text-5xl font-bold text-relay-text">
                  More than a Marketplace
                </h2>
                <p className="text-xl text-white/65 leading-relaxed">
                  A thriving community of resellers and collectors who support each other
                </p>
              </div>

              <div className="space-y-4">
                {[
                  {
                    icon: MessageCircle,
                    title: "Real-Time Messaging",
                    description: "Chat directly with buyers and sellers",
                  },
                  {
                    icon: Users,
                    title: "Seller Profiles & Reviews",
                    description: "Build trust with verified ratings and reviews",
                  },
                  {
                    icon: Zap,
                    title: "Custom Offers",
                    description: "Make and receive offers on listings",
                  },
                  {
                    icon: Award,
                    title: "Rising Brand Discovery",
                    description: "Help new brands get discovered",
                  },
                ].map((feature, idx) => {
                  const Icon = feature.icon;
                  return (
                    <RevealSection key={idx} style={{ animationDelay: `${idx * 75}ms` }}>
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-relay-accent/10 flex items-center justify-center flex-shrink-0 mt-1">
                          <Icon size={20} className="text-relay-accent" />
                        </div>
                        <div>
                          <h4 className="text-base font-semibold text-relay-text">
                            {feature.title}
                          </h4>
                          <p className="text-sm text-white/60 mt-1">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    </RevealSection>
                  );
                })}
              </div>
            </RevealSection>

            {/* Right side - Community stats */}
            <RevealSection className="space-y-6">
              <div className="relay-card p-8 space-y-6">
                <div className="space-y-2">
                  <p className="text-sm text-white/50 font-medium">Active Members</p>
                  <p className="text-4xl font-bold text-relay-accent">50K+</p>
                </div>
                <div className="h-px bg-white/5" />
                <div className="space-y-2">
                  <p className="text-sm text-white/50 font-medium">Listings Posted</p>
                  <p className="text-4xl font-bold text-relay-accent">250K+</p>
                </div>
                <div className="h-px bg-white/5" />
                <div className="space-y-2">
                  <p className="text-sm text-white/50 font-medium">Monthly Sales</p>
                  <p className="text-4xl font-bold text-relay-accent">$5M+</p>
                </div>
              </div>

              <div className="relay-card p-8 border-relay-accent/30 bg-gradient-to-br from-relay-accent/10 to-transparent">
                <div className="space-y-4">
                  <p className="text-sm text-relay-accent font-medium">Pro Seller Benefits</p>
                  <ul className="space-y-3">
                    {["Featured listings", "Priority support", "Advanced analytics", "No fees on first 10 sales"].map(
                      (benefit, idx) => (
                        <li key={idx} className="flex items-center gap-3 text-sm text-white/70">
                          <Check size={16} className="text-emerald-400" />
                          <span>{benefit}</span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative py-20 lg:py-32 border-t border-white/5">
        <div className="relay-container">
          <RevealSection className="text-center space-y-8 max-w-3xl mx-auto">
            <div className="space-y-4">
              <h2 className="text-4xl lg:text-5xl font-bold text-relay-text">
                Ready to Start Selling?
              </h2>
              <p className="text-xl text-white/65">
                Join thousands of resellers who are already earning more with Relay.
              </p>
            </div>

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
                Learn More
                <ChevronRight size={20} />
              </Link>
            </div>

            <div className="pt-8 border-t border-white/10">
              <p className="text-white/60 mb-4">Already have an account?</p>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 text-relay-accent hover:text-relay-accent/80 transition-colors font-medium"
              >
                Sign in to your account
                <ChevronRight size={18} />
              </Link>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/5 py-12">
        <div className="relay-container">
          <div className="space-y-8">
            {/* Footer content grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-relay-text">Product</h3>
                <ul className="space-y-2">
                  {["Marketplace", "How it works", "Pricing", "Blog"].map((link) => (
                    <li key={link}>
                      <button className="text-sm text-white/50 hover:text-white/70 transition-colors">
                        {link}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-relay-text">Company</h3>
                <ul className="space-y-2">
                  {["About", "Contact", "Careers", "Press"].map((link) => (
                    <li key={link}>
                      <button className="text-sm text-white/50 hover:text-white/70 transition-colors">
                        {link}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-relay-text">Legal</h3>
                <ul className="space-y-2">
                  {["Privacy", "Terms", "Cookies", "Compliance"].map((link) => (
                    <li key={link}>
                      <button className="text-sm text-white/50 hover:text-white/70 transition-colors">
                        {link}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-relay-text">Connect</h3>
                <ul className="space-y-2">
                  {["Twitter", "Instagram", "Discord", "Email"].map((link) => (
                    <li key={link}>
                      <button className="text-sm text-white/50 hover:text-white/70 transition-colors">
                        {link}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Copyright */}
            <div className="pt-8 border-t border-white/5">
              <p className="text-sm text-white/40 text-center">
                &copy; 2026 Relay. The marketplace for resellers. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
