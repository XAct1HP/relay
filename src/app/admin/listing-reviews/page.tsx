"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";
import { Check, X, Eye, ChevronDown, ChevronUp, Package, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";

interface PendingListing {
  id: string;
  brand: string;
  model: string;
  nickname: string | null;
  condition: string;
  box_condition: string;
  approx_sizing: string;
  description: string;
  images: string[];
  sizes: Array<{ size: string; price: number; quantity: number }>;
  status: string;
  created_at: string;
  seller: {
    id: string;
    username: string;
    display_name: string;
    full_name: string;
    avatar_url: string;
    email: string;
  } | null;
}

const conditionLabels: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  used_excellent: "Used - Excellent",
  used_good: "Used - Good",
  used_fair: "Used - Fair",
};

const boxConditionLabels: Record<string, string> = {
  perfect: "Perfect",
  good: "Good",
  damaged: "Damaged",
  no_box: "No Box",
};

export default function ListingReviewsPage() {
  const { currentUser } = useAuth();
  const [listings, setListings] = useState<PendingListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending_review" | "rejected" | "all">("pending_review");

  useEffect(() => {
    loadListings();
  }, [filter]);

  async function loadListings() {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("listings")
      .select("*, seller:profiles!listings_seller_id_fkey(*)")
      .order("created_at", { ascending: false });

    if (filter === "pending_review") {
      query = query.eq("status", "pending_review");
    } else if (filter === "rejected") {
      query = query.eq("status", "rejected");
    } else {
      query = query.in("status", ["pending_review", "rejected"]);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error loading listings:", error);
    } else {
      setListings((data as any[]) || []);
    }
    setLoading(false);
  }

  async function handleApprove(listingId: string) {
    setActionLoading(listingId);
    const supabase = createClient();

    const { error } = await supabase
      .from("listings")
      .update({
        status: "active",
        admin_review_status: "approved",
        admin_review_notes: null,
      })
      .eq("id", listingId);

    if (error) {
      console.error("Error approving listing:", error);
      alert("Failed to approve listing");
    } else {
      setListings((prev) => prev.filter((l) => l.id !== listingId));
    }
    setActionLoading(null);
  }

  async function handleReject(listingId: string) {
    if (!rejectReason.trim()) {
      alert("Please provide a reason for rejection");
      return;
    }

    setActionLoading(listingId);
    const supabase = createClient();

    const { error } = await supabase
      .from("listings")
      .update({
        status: "rejected",
        admin_review_status: "rejected",
        admin_review_notes: rejectReason.trim(),
      })
      .eq("id", listingId);

    if (error) {
      console.error("Error rejecting listing:", error);
      alert("Failed to reject listing");
    } else {
      setListings((prev) => prev.filter((l) => l.id !== listingId));
      setRejectingId(null);
      setRejectReason("");
    }
    setActionLoading(null);
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getLowestPrice = (sizes: Array<{ price: number }>) => {
    if (!sizes || sizes.length === 0) return 0;
    return Math.min(...sizes.map((s) => s.price));
  };

  if (loading) {
    return <div className="text-center text-white/40 py-12">Loading listings for review...</div>;
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="space-y-2">
        <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
        <h1 className="relay-title">Listing Reviews</h1>
        <p className="text-white/50 text-sm mt-1">
          Review and approve Individual Brand and Custom shoe listings before they go live.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-3">
        {[
          { key: "pending_review" as const, label: "Pending Review" },
          { key: "rejected" as const, label: "Rejected" },
          { key: "all" as const, label: "All" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              filter === tab.key
                ? "bg-[#5f8fff] text-[#06070a]"
                : "bg-white/[0.04] text-white/60 border border-white/10 hover:bg-white/[0.08]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Listings */}
      {listings.length === 0 ? (
        <div className="relay-card p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check size={28} className="text-emerald-400" />
            </div>
          </div>
          <p className="text-white/50 text-lg font-medium">
            {filter === "pending_review" ? "No listings pending review" : "No listings found"}
          </p>
          <p className="text-white/30 text-sm mt-1">All caught up!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map((listing) => {
            const isExpanded = expandedId === listing.id;
            const isRejecting = rejectingId === listing.id;
            const sellerName = listing.seller?.display_name || listing.seller?.full_name || listing.seller?.username || "Unknown";

            return (
              <div key={listing.id} className="relay-card overflow-hidden">
                {/* Collapsed Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : listing.id)}
                  className="w-full p-5 flex items-center gap-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-white/5">
                    {listing.images?.[0] ? (
                      <img src={listing.images[0]} alt={listing.model} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={24} className="text-white/20" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-[#f5f7fb] font-semibold truncate">
                        {listing.brand} {listing.model}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        listing.brand === "Individual Brand"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}>
                        {listing.brand === "Individual Brand" ? "Indie Brand" : "Custom"}
                      </span>
                      {listing.status === "rejected" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/30">
                          Rejected
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-white/40">
                      <span>by {sellerName}</span>
                      <span>·</span>
                      <span>From ${getLowestPrice(listing.sizes)}</span>
                      <span>·</span>
                      <span>{listing.sizes?.length || 0} size{listing.sizes?.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  {/* Time & Expand */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-white/30 text-xs">
                      <Clock size={12} />
                      {formatDate(listing.created_at)}
                    </div>
                    {isExpanded ? <ChevronUp size={18} className="text-white/40" /> : <ChevronDown size={18} className="text-white/40" />}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-white/5 p-6 space-y-6">
                    {/* Seller Info */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      {listing.seller?.avatar_url ? (
                        <img src={listing.seller.avatar_url} alt={sellerName} className="w-10 h-10 rounded-full border border-white/10" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#5f8fff] flex items-center justify-center text-[#06070a] font-semibold text-sm">
                          {sellerName[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-[#f5f7fb] text-sm font-semibold">{sellerName}</p>
                        <p className="text-white/40 text-xs">@{listing.seller?.username || "unknown"} · {listing.seller?.email || ""}</p>
                      </div>
                      <Link href={`/profile/${listing.seller?.username}`} className="ml-auto">
                        <button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/10 text-white/60 hover:bg-white/[0.08] transition-colors">
                          View Profile
                        </button>
                      </Link>
                    </div>

                    {/* Images */}
                    {listing.images && listing.images.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-[#f5f7fb] mb-3">Photos ({listing.images.length})</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {listing.images.map((img, idx) => (
                            <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-white/10">
                              <img src={img} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Details Grid */}
                    <div>
                      <h4 className="text-sm font-semibold text-[#f5f7fb] mb-3">Listing Details</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                          <p className="text-white/40 text-xs mb-1">Brand</p>
                          <p className="text-[#f5f7fb] text-sm font-medium">{listing.brand}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                          <p className="text-white/40 text-xs mb-1">Model</p>
                          <p className="text-[#f5f7fb] text-sm font-medium">{listing.model}</p>
                        </div>
                        {listing.nickname && (
                          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                            <p className="text-white/40 text-xs mb-1">Nickname</p>
                            <p className="text-[#f5f7fb] text-sm font-medium">{listing.nickname}</p>
                          </div>
                        )}
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                          <p className="text-white/40 text-xs mb-1">Condition</p>
                          <p className="text-[#f5f7fb] text-sm font-medium">{conditionLabels[listing.condition] || listing.condition}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                          <p className="text-white/40 text-xs mb-1">Box Condition</p>
                          <p className="text-[#f5f7fb] text-sm font-medium">{boxConditionLabels[listing.box_condition] || listing.box_condition}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                          <p className="text-white/40 text-xs mb-1">Weight</p>
                          <p className="text-[#f5f7fb] text-sm font-medium capitalize">{listing.approx_sizing}</p>
                        </div>
                      </div>
                    </div>

                    {/* Sizes & Pricing */}
                    <div>
                      <h4 className="text-sm font-semibold text-[#f5f7fb] mb-3">Sizes & Pricing</h4>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                        {listing.sizes?.map((s, idx) => (
                          <div key={idx} className="p-2 rounded-lg bg-white/[0.02] border border-white/5 text-center">
                            <p className="text-[#f5f7fb] text-sm font-bold">{s.size}</p>
                            <p className="text-[#5f8fff] text-xs font-semibold">${s.price}</p>
                            <p className="text-white/30 text-[10px]">qty: {s.quantity}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <h4 className="text-sm font-semibold text-[#f5f7fb] mb-2">Description</h4>
                      <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">{listing.description}</p>
                    </div>

                    {/* Action Buttons */}
                    {listing.status === "pending_review" && (
                      <div className="pt-4 border-t border-white/5 space-y-4">
                        {isRejecting ? (
                          <div className="space-y-3">
                            <label className="block text-sm font-medium text-[#f5f7fb]">Rejection Reason</label>
                            <textarea
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Explain why this listing is being rejected..."
                              rows={3}
                              className="relay-textarea w-full"
                            />
                            <div className="flex gap-3">
                              <button
                                onClick={() => handleReject(listing.id)}
                                disabled={actionLoading === listing.id || !rejectReason.trim()}
                                className="px-6 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 font-semibold text-sm hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {actionLoading === listing.id ? "Rejecting..." : "Confirm Rejection"}
                              </button>
                              <button
                                onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                className="px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/60 text-sm hover:bg-white/[0.08] transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <button
                              onClick={() => handleApprove(listing.id)}
                              disabled={actionLoading === listing.id}
                              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-semibold text-sm hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                            >
                              <Check size={16} />
                              {actionLoading === listing.id ? "Approving..." : "Approve & Go Live"}
                            </button>
                            <button
                              onClick={() => setRejectingId(listing.id)}
                              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 font-semibold text-sm hover:bg-red-500/30 transition-colors"
                            >
                              <X size={16} />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Show rejection notes for already-rejected listings */}
                    {listing.status === "rejected" && (
                      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-red-300 text-sm font-semibold mb-1">Rejected</p>
                        <p className="text-red-200/60 text-xs">{(listing as any).admin_review_notes || "No reason provided"}</p>
                        <button
                          onClick={() => handleApprove(listing.id)}
                          disabled={actionLoading === listing.id}
                          className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-semibold text-xs hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                        >
                          <Check size={14} />
                          {actionLoading === listing.id ? "Approving..." : "Approve Instead"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
