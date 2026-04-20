"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { AlertCircle, CheckCircle, ExternalLink } from "lucide-react";
import Link from "next/link";

type FilterTab = "all" | "open" | "resolved";

interface Dispute {
  id: string;
  status: string;
  created_at: string;
  dispute_reason: string;
  dispute_ruling: string | null;
  buyer_id: string;
  seller_id: string;
  buyer: any;
  seller: any;
}

function DisputeRow({ dispute }: any) {
  const statusConfig = {
    open: { icon: AlertCircle, color: "bg-red-500/20 text-red-300", label: "Open" },
    resolved: {
      icon: CheckCircle,
      color: "bg-green-500/20 text-green-300",
      label: "Resolved",
    },
  };

  const StatusIcon = statusConfig[dispute.status as keyof typeof statusConfig].icon;
  const statusColor = statusConfig[dispute.status as keyof typeof statusConfig].color;
  const statusLabel = statusConfig[dispute.status as keyof typeof statusConfig].label;

  return (
    <Link href={`/admin/disputes/${dispute.id}`}>
      <div className="flex items-center justify-between py-4 px-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer group">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[#f5f7fb] font-medium">{dispute.orderId}</p>
            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-300 text-xs rounded">
              {dispute.reason}
            </span>
          </div>
          <p className="text-white/40 text-sm">
            {dispute.buyer} vs {dispute.seller}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-white/40 text-sm">{dispute.dateFiled}</span>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${statusColor}`}>
            <StatusIcon className="w-4 h-4" />
            <span className="text-xs font-semibold">{statusLabel}</span>
          </div>
          <ExternalLink className="w-4 h-4 text-white/30 group-hover:text-[#5f8fff] transition-colors" />
        </div>
      </div>
    </Link>
  );
}

export default function DisputesPage() {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDisputes() {
      const supabase = createClient();
      // Also fetch resolved disputes (completed/refund_pending with a dispute_ruling)
      const { data } = await supabase
        .from("orders")
        .select("*, buyer:profiles!orders_buyer_id_fkey(*), seller:profiles!orders_seller_id_fkey(*)")
        .or("status.eq.disputed,dispute_ruling.neq.null")
        .order("created_at", { ascending: false });

      setDisputes(data || []);
      setLoading(false);
    }

    loadDisputes();
  }, []);

  const isResolved = (d: Dispute) => d.dispute_ruling !== null;
  const isOpen = (d: Dispute) => d.status === "disputed" && !d.dispute_ruling;

  const filteredDisputes =
    filter === "all"
      ? disputes
      : filter === "open"
        ? disputes.filter(isOpen)
        : disputes.filter(isResolved);

  const openCount = disputes.filter(isOpen).length;
  const resolvedCount = disputes.filter(isResolved).length;

  return (
    <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Dispute Resolution</h1>
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
            All ({disputes.length})
          </button>
          <button
            onClick={() => setFilter("open")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "open"
                ? "bg-[#5f8fff] text-white"
                : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
            }`}
          >
            Open ({openCount})
          </button>
          <button
            onClick={() => setFilter("resolved")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "resolved"
                ? "bg-[#5f8fff] text-white"
                : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
            }`}
          >
            Resolved ({resolvedCount})
          </button>
        </div>

        {/* Disputes List */}
        {loading ? (
          <div className="relay-card p-12 text-center">
            <p className="text-white/40">Loading...</p>
          </div>
        ) : (
          <div className="relay-card overflow-hidden p-0">
            <div className="divide-y divide-white/5">
              {filteredDisputes.length > 0 ? (
                filteredDisputes.map((dispute) => (
                    <DisputeRow
                      key={dispute.id}
                      dispute={{
                        id: dispute.id,
                        orderId: dispute.id.slice(0, 8) + '...',
                        reason: dispute.dispute_reason || 'Disputed',
                        buyer: dispute.buyer?.full_name || dispute.buyer?.display_name || 'Unknown',
                        seller: dispute.seller?.full_name || dispute.seller?.display_name || 'Unknown',
                        dateFiled: new Date(dispute.created_at).toLocaleDateString(),
                        status: isOpen(dispute) ? 'open' : 'resolved',
                      }}
                    />
                ))
              ) : (
                <div className="py-12 text-center">
                  <p className="text-white/40">No disputes found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  );
}
