"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Pagination } from "@/components/layout/Pagination";
import { Search, Heart, BadgeCheck, ChevronDown, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Listing } from "@/types";

interface ListingDisplay {
  id: string;
  brand: string;
  model: string;
  nickname?: string;
  sizes: number[];
  price: number;
  image: string;
  condition: "New" | "Like New" | "Used - Excellent" | "Used - Good" | "Used - Fair";
  seller: {
    name: string;
    avatar: string;
    isVerified: boolean;
  };
  gradient: string;
}

const BRANDS = ["Nike", "Adidas", "New Balance", "Jordan", "Yeezy", "Puma", "Converse", "Vans", "Asics", "Other / Independent Brand"];
const CONDITIONS = ["New", "Like New", "Used - Excellent", "Used - Good", "Used - Fair"];
const SIZES = Array.from({ length: 31 }, (_, i) => {
  const baseSize = 3.5 + i * 0.5;
  return parseFloat(baseSize.toFixed(1));
});

function formatSizeDisplay(sizes: number[]): string {
  if (sizes.length === 0) return "";
  if (sizes.length === 1) return `Size ${sizes[0]}`;
  if (sizes.length <= 3) return `Size ${sizes.join(", ")}`;
  if (Math.max(...sizes) - Math.min(...sizes) < 1) return `Size ${Math.min(...sizes)}-${Math.max(...sizes)}`;
  return `Size ${Math.min(...sizes)}, ${sizes[1]}, ${sizes[2]}`;
}

export default function MarketplacePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedCondition, setSelectedCondition] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [allListings, setAllListings] = useState<ListingDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchListings() {
      const supabase = createClient();
      setLoading(true);

      try {
        const { data } = await supabase
          .from("listings")
          .select("*, seller:profiles(full_name, display_name, is_verified_seller, avatar_url)")
          .eq("status", "active");

        if (data) {
          const conditionMap: Record<string, ListingDisplay["condition"]> = {
            new: "New",
            like_new: "Like New",
            used_excellent: "Used - Excellent",
            used_good: "Used - Good",
            used_fair: "Used - Fair",
          };

          const formatted: ListingDisplay[] = data.map((listing: Listing) => {
            const gradients: { [key: string]: string } = {
              Nike: "from-red-500/20 to-orange-500/20",
              Adidas: "from-gray-600/20 to-slate-600/20",
              "New Balance": "from-neutral-500/20 to-stone-500/20",
              Jordan: "from-gray-700/20 to-slate-700/20",
              Puma: "from-purple-500/20 to-pink-500/20",
            };

            // Extract sizes from the sizes array
            const sizes = (listing.sizes as any[])
              ?.map((s) => (typeof s === "object" ? s.size : s))
              .filter((s) => s)
              .map(Number) || [];

            // Find min price
            const prices = (listing.sizes as any[])?.map((s) =>
              typeof s === "object" ? s.price : 0
            ) || [0];
            const minPrice = Math.min(...prices.filter((p) => p > 0)) || 0;

            return {
              id: listing.id,
              brand: listing.brand,
              model: listing.model,
              nickname: listing.nickname ?? undefined,
              sizes,
              price: minPrice,
              image: listing.images?.[0] || "default",
              condition: conditionMap[listing.condition] || "Used - Good" as ListingDisplay["condition"],
              seller: {
                name: listing.seller?.display_name || listing.seller?.full_name || "Unknown Seller",
                avatar:
                  listing.seller?.avatar_url ||
                  "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
                isVerified: listing.seller?.is_verified_seller || false,
              },
              gradient: gradients[listing.brand] || "from-blue-500/20 to-indigo-500/20",
            };
          });

          setAllListings(formatted);
        }
      } catch (error) {
        console.error("Error fetching listings:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, []);

  const filteredListings = useMemo(() => {
    return allListings.filter((listing) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        listing.brand.toLowerCase().includes(searchLower) ||
        listing.model.toLowerCase().includes(searchLower) ||
        listing.nickname?.toLowerCase().includes(searchLower) ||
        listing.seller.name.toLowerCase().includes(searchLower);

      const matchesBrand = !selectedBrand || listing.brand === selectedBrand;
      const matchesSize = !selectedSize || listing.sizes.includes(parseFloat(selectedSize));
      const matchesCondition = !selectedCondition || listing.condition === selectedCondition;
      const matchesSeller = !selectedSeller || listing.seller.name.toLowerCase().includes(selectedSeller.toLowerCase());

      return matchesSearch && matchesBrand && matchesSize && matchesCondition && matchesSeller;
    });
  }, [allListings, searchTerm, selectedBrand, selectedSize, selectedCondition, selectedSeller]);

  const hasActiveFilters = selectedBrand || selectedSize || selectedCondition || selectedSeller;

  const clearFilters = () => {
    setSelectedBrand("");
    setSelectedSize("");
    setSelectedCondition("");
    setSelectedSeller("");
    setCurrentPage(1);
  };

  const itemsPerPage = 12;
  const paginatedListings = filteredListings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredListings.length / itemsPerPage);

  if (loading) {
    return (
      <div className="relay-empty text-center">Loading...</div>
    );
  }

  return (
      <div>
        {/* Page Header */}
        <div className="mb-8">
          <div className="relay-eyebrow text-relay-accent">BROWSE</div>
          <h1 className="relay-title text-relay-text mt-2">Marketplace</h1>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-relay-subtle" size={20} />
            <input
              type="text"
              placeholder="Search shoes, brands, sellers..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="relay-input w-full"
              style={{ paddingLeft: '3rem' }}
            />
          </div>
        </div>

        {/* Filter Row */}
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          {/* Brand Dropdown */}
          <div className="relative min-w-fit">
            <select
              value={selectedBrand}
              onChange={(e) => {
                setSelectedBrand(e.target.value);
                setCurrentPage(1);
              }}
              className="relay-select pr-10 appearance-none"
            >
              <option value="">All Brands</option>
              {BRANDS.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} />
          </div>

          {/* Size Dropdown */}
          <div className="relative min-w-fit">
            <select
              value={selectedSize}
              onChange={(e) => {
                setSelectedSize(e.target.value);
                setCurrentPage(1);
              }}
              className="relay-select pr-10 appearance-none"
            >
              <option value="">All Sizes</option>
              {SIZES.map((size) => (
                <option key={size} value={size}>
                  Size {size}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} />
          </div>

          {/* Condition Dropdown */}
          <div className="relative min-w-fit">
            <select
              value={selectedCondition}
              onChange={(e) => {
                setSelectedCondition(e.target.value);
                setCurrentPage(1);
              }}
              className="relay-select pr-10 appearance-none"
            >
              <option value="">All Conditions</option>
              {CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>
                  {condition}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} />
          </div>

          {/* Seller Search Input */}
          <input
            type="text"
            placeholder="Search seller..."
            value={selectedSeller}
            onChange={(e) => {
              setSelectedSeller(e.target.value);
              setCurrentPage(1);
            }}
            className="relay-input flex-1 min-w-[180px]"
          />

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.08] text-relay-text font-medium transition-colors"
            >
              <X size={18} />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>

        {/* Results Count */}
        <div className="mb-4">
          <p className="text-relay-subtle text-sm">
            Showing {paginatedListings.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to{" "}
            {Math.min(currentPage * itemsPerPage, filteredListings.length)} of {filteredListings.length} listings
          </p>
        </div>

        {/* Listings Grid */}
        {filteredListings.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
              {paginatedListings.map((listing) => (
                <Link key={listing.id} href={`/listing/${listing.id}`}>
                  <div className="relay-card p-0 overflow-hidden hover:border-white/20 transition-all duration-300 hover:scale-[1.02] cursor-pointer h-full flex flex-col">
                    {/* Image Container */}
                    <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br flex items-center justify-center">
                      {listing.image && listing.image !== "default" ? (
                        <img
                          src={listing.image}
                          alt={`${listing.brand} ${listing.model}`}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${listing.gradient}`}
                        ></div>
                      )}

                      {/* Condition Badge */}
                      <div className="absolute top-3 left-3 z-10">
                        <span
                          className={`relay-badge text-xs px-2 py-1 ${
                            listing.condition === "New"
                              ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                              : listing.condition === "Like New"
                              ? "bg-blue-400/10 text-blue-400 border border-blue-400/20"
                              : listing.condition === "Used - Excellent"
                              ? "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                              : listing.condition === "Used - Good"
                              ? "bg-orange-400/10 text-orange-400 border border-orange-400/20"
                              : "bg-red-400/10 text-red-400 border border-red-400/20"
                          }`}
                        >
                          {listing.condition}
                        </span>
                      </div>

                      {/* Heart/Save Icon */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/20"
                      >
                        <Heart size={18} className="text-white" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-4 flex flex-col">
                      {/* Brand & Model */}
                      <div className="mb-2">
                        <p className="relay-eyebrow text-relay-accent text-[10px]">{listing.brand}</p>
                        <h3 className="font-semibold text-relay-text text-sm leading-tight mt-1">
                          {listing.model}
                        </h3>
                        {listing.nickname && (
                          <p className="text-relay-subtle text-xs mt-1">{listing.nickname}</p>
                        )}
                      </div>

                      {/* Size Display */}
                      <p className="text-relay-muted text-xs mb-3 mt-auto pt-2">
                        {formatSizeDisplay(listing.sizes)}
                      </p>

                      {/* Price */}
                      <p className="font-semibold text-lg text-relay-text mb-3">
                        From ${listing.price}
                      </p>

                      {/* Seller */}
                      <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                        <img
                          src={listing.seller.avatar}
                          alt={listing.seller.name}
                          className="w-7 h-7 rounded-full border border-white/10"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-relay-text text-xs font-medium truncate">
                            {listing.seller.name}
                          </p>
                        </div>
                        {listing.seller.isVerified && (
                          <BadgeCheck size={14} className="text-relay-accent flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            )}
          </>
        ) : (
          <div className="relay-empty text-center py-12">
            <p className="text-relay-text mb-2">No listings match your filters.</p>
            <p className="text-relay-subtle text-sm">Try adjusting your filters or search term</p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 px-4 py-2 rounded-lg bg-relay-accent text-relay-bg font-medium hover:bg-relay-accent/90 transition-colors text-sm"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>
  );
}
