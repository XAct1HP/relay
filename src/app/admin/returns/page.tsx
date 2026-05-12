"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Package,
  Search,
  CheckCircle,
  Clock,
  Truck,
  AlertCircle,
} from "lucide-react";

type FilterTab = "all" | "pending" | "completed";

interface ReturnOrder {
  id: string;
  status: string;
  return_packing_slip_id: string;
  return_tracking_number: string | null;
  return_label_url: string | null;
  return_status: string;
  return_created_at: string;
  return_delivered_at: string | null;
  price: number;
  size: string;
  buyer: any;
  seller: any;
  listing: any;
}

export default function AdminReturnsPage() {
  const { currentUser } = useAuth();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [returns, setReturns] = useState<ReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadReturns();
  }, []);

  async function loadReturns() {
    const supabase = createClient();
    const { data } = await supabase
      .from("orders")
      .select(
        "*, buyer:profiles!orders_buyer_id_fkey(*), seller:profiles!orders_seller_id_fkey(*), listing:listings(*)"
      )
      .not("return_packing_slip_id", "is", null)
      .order("return_created_at", { ascending: false });

    setReturns(data || []);
    setLoading(false);
  }

  async function handleMarkReturned(orderId: string) {
    setProcessingId(orderId);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/returns/${orderId}/mark-returned`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to process return");
      } else {
        // Refresh the list
        await loadReturns();
      }
    } catch (err) {
      alert("Failed to process return");
    } finally {
      setProcessingId(null);
      setConfirmId(null);
    }
  }

  const isPending = (r: ReturnOrder) =>
    ["return_pending", "return_shipped"].includes(r.status);
  const isCompleted = (r: ReturnOrder) =>
    r.status === "refunded" || r.return_status === "delivered";

  const filteredReturns = returns.filter((r) => {
    // Filter by tab
    if (filter === "pending" && !isPending(r)) return false;
    if (filter === "completed" && !isCompleted(r)) return false;

    // Filter by search (packing slip ID or order ID)
    if (searchQuery) {
      const q = searchQuery.toUpperCase();
      const matchesSlip = r.return_packing_slip_id?.toUpperCase().includes(q);
      const matchesOrder = r.id.toUpperCase().includes(q);
      return matchesSlip || matchesOrder;
    }

    return true;
  });

  const pendingCount = returns.filter(isPending).length;
  const completedCount = returns.filter(isCompleted).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="space-y-2">
        <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
        <h1 className="relay-title">Returns Management</h1>
        <p className="text-white/50 text-sm">
          Search by packing slip ID to find and process returns. Mark as
          returned once you receive and verify the package.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          type="text"
          placeholder="Search by packing slip ID (e.g. RET-A3F8K2) or order ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-[#f5f7fb] placeholder:text-white/30 focus:outline-none focus:border-[#5f8fff] transition-colors"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === "all"
              ? "bg-[#5f8fff] text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
          }`}
        >
          All ({returns.length})
        </button>
        <button
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === "pending"
              ? "bg-[#5f8fff] text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
          }`}
        >
          Awaiting Return ({pendingCount})
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === "completed"
              ? "bg-[#5f8fff] text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
          }`}
        >
          Processed ({completedCount})
        </button>
      </div>

      {/* Returns List */}
      {loading ? (
        <div className="relay-card p-12 text-center">
          <p className="text-white/40">Loading...</p>
        </div>
      ) : filteredReturns.length === 0 ? (
        <div className="relay-card p-12 text-center">
          <Package className="w-8 h-8 text-white/20 mx-auto mb-3" />
          <p className="text-white/40">
            {searchQuery
              ? "No returns match your search"
              : "No returns to display"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReturns.map((ret) => {
            const listing = ret.listing;
            const brand = listing?.brand || "Unknown";
            const model = listing?.model || "Unknown";
            const buyerName =
              ret.buyer?.display_name || ret.buyer?.full_name || "Unknown";
            const sellerName =
              ret.seller?.display_name || ret.seller?.full_name || "Unknown";
            const isReturnPending = isPending(ret);
            const isReturnDone = isCompleted(ret);

            return (
              <div
                key={ret.id}
                className="relay-card p-4 space-y-3"
              >
                {/* Top row: Packing slip ID + Status */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-lg font-bold text-[#f5f7fb] tracking-wider">
                      {ret.return_packing_slip_id}
                    </span>
                    {isReturnPending && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 text-amber-300 text-xs rounded-lg font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        Awaiting Return
                      </span>
                    )}
                    {isReturnDone && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 text-green-300 text-xs rounded-lg font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Refunded
                      </span>
                    )}
                  </div>
                  <span className="text-white/40 text-xs">
                    {ret.return_created_at
                      ? new Date(ret.return_created_at).toLocaleDateString()
                      : ""}
                  </span>
                </div>

                {/* Details row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                  <div className="space-y-1">
                    <p className="text-[#f5f7fb] font-medium">
                      {brand} {model}{" "}
                      <span className="text-white/40">· Size {ret.size}</span>
                    </p>
                    <p className="text-white/40">
                      Buyer: {buyerName} · Seller:{" "}
                      <span className="text-red-300">{sellerName}</span>
                    </p>
                  </div>
                  {ret.return_tracking_number && (
                    <div className="flex items-center gap-1.5 text-white/40 text-xs">
                      <Truck className="w-3.5 h-3.5" />
                      <span className="font-mono">
                        {ret.return_tracking_number}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action row */}
                {isReturnPending && (
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
                    {confirmId === ret.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-white/50 text-sm">
                          Confirm refund?
                        </span>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleMarkReturned(ret.id)}
                          disabled={processingId === ret.id}
                          className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 font-medium"
                        >
                          {processingId === ret.id
                            ? "Processing..."
                            : "Yes, Issue Refund"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(ret.id)}
                        className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#5f8fff]/10 text-[#5f8fff] hover:bg-[#5f8fff]/20 border border-[#5f8fff]/20 font-medium transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Mark Returned & Refund
                      </button>
                    )}
                  </div>
                )}

                {isReturnDone && ret.return_delivered_at && (
                  <div className="pt-1 border-t border-white/5">
                    <p className="text-white/30 text-xs">
                      Refund processed{" "}
                      {new Date(ret.return_delivered_at).toLocaleDateString()}
                    </p>
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
