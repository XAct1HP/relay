"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ChevronRight,
  Shield,
  Snowflake,
  Tag,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";

type FilterTab = "all" | "open" | "resolved";

interface AdminDisputeListItem {
  orderId: string;
  disputeId: string;
  createdAt: string;
  status: string;
  resolutionStatus: "open" | "resolved";
  category: string;
  buyerName: string;
  sellerName: string;
  sellerTier: string;
  trustScore: number;
  orderValueCents: number;
  listingLabel: string;
  sku: string | null;
  size: string | null;
  deliveredAt: string | null;
  reviewDeadline: string | null;
  payoutStatus: string | null;
  reserveStatus: string;
  custodyStatus: string | null;
  tagStatus: string | null;
  checkcheckStatus: string | null;
  randomAuditRequired: boolean;
  highRiskSkuRequired: boolean;
}

interface AdminDisputesResponse {
  disputes: AdminDisputeListItem[];
  counts: {
    total: number;
    open: number;
    resolved: number;
    reviewRequired: number;
    frozenPayouts: number;
  };
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function formatTier(tier: string) {
  return tier.replace("tier_", "Tier ");
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "None";
  return value.replaceAll("_", " ");
}

function MetricCard({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  tone?: "blue" | "amber" | "red" | "green";
}) {
  const tones = {
    blue: "border-[#5f8fff]/20 bg-[#5f8fff]/10 text-[#7ca6ff]",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
    green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  };

  return (
    <div className="relay-card p-5">
      <p className="text-white/45 text-xs uppercase tracking-[0.16em] mb-2">{label}</p>
      <div className={`inline-flex rounded-xl border px-3 py-2 text-lg font-semibold ${tones[tone]}`}>
        {value}
      </div>
    </div>
  );
}

export default function AdminDisputesPage() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [data, setData] = useState<AdminDisputesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && currentUser && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      void loadDisputes();
    } else if (!isLoading) {
      setLoading(false);
    }
  }, [currentUser?.role, isLoading]);

  async function loadDisputes() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/disputes", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load admin disputes");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin disputes");
    } finally {
      setLoading(false);
    }
  }

  const filteredDisputes = useMemo(() => {
    const disputes = data?.disputes || [];
    if (filter === "open") {
      return disputes.filter((dispute) => dispute.resolutionStatus === "open");
    }
    if (filter === "resolved") {
      return disputes.filter((dispute) => dispute.resolutionStatus === "resolved");
    }
    return disputes;
  }, [data?.disputes, filter]);

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading dispute queue...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-2">
        <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
        <h1 className="relay-title">Dispute Review</h1>
        <p className="text-white/50 max-w-3xl">
          Review buyer claims, seller trust signals, chain-of-custody evidence, auth status, and payout protection from one queue.
        </p>
      </div>

      {error && (
        <div className="relay-card border border-red-500/20 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <MetricCard label="All Disputes" value={data.counts.total} />
            <MetricCard label="Open" value={data.counts.open} tone="red" />
            <MetricCard label="Resolved" value={data.counts.resolved} tone="green" />
            <MetricCard label="Review Required" value={data.counts.reviewRequired} tone="amber" />
            <MetricCard label="Frozen Payouts" value={data.counts.frozenPayouts} tone="blue" />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", "open", "resolved"] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`rounded-lg border px-4 py-2 font-medium transition-colors ${
                  filter === tab
                    ? "border-[#5f8fff] bg-[#5f8fff] text-white"
                    : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {tab === "all" ? "All" : tab === "open" ? "Open" : "Resolved"}
              </button>
            ))}
          </div>

          <div className="relay-card overflow-hidden p-0">
            <div className="divide-y divide-white/5">
              {filteredDisputes.length === 0 ? (
                <div className="py-12 text-center text-white/40">No disputes match this filter.</div>
              ) : (
                filteredDisputes.map((dispute) => (
                  <Link
                    key={dispute.orderId}
                    href={`/admin/disputes/${dispute.orderId}`}
                    className="block px-5 py-4 transition-colors hover:bg-white/[0.02]"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[#f5f7fb] font-semibold">{dispute.listingLabel}</p>
                          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                            {formatLabel(dispute.category)}
                          </span>
                          <span className="rounded-full bg-[#5f8fff]/15 px-2 py-0.5 text-xs font-semibold text-[#7ca6ff]">
                            {formatTier(dispute.sellerTier)}
                          </span>
                          {dispute.randomAuditRequired && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
                              random audit
                            </span>
                          )}
                          {dispute.highRiskSkuRequired && (
                            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                              high-risk SKU
                            </span>
                          )}
                        </div>

                        <p className="text-white/45 text-sm">
                          {dispute.buyerName} vs {dispute.sellerName} • {formatMoney(dispute.orderValueCents)} • Trust score {dispute.trustScore}
                        </p>

                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">
                            SKU {dispute.sku || "n/a"}
                          </span>
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">
                            Size {dispute.size || "n/a"}
                          </span>
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">
                            CheckCheck {formatLabel(dispute.checkcheckStatus)}
                          </span>
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">
                            Custody {formatLabel(dispute.custodyStatus)}
                          </span>
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">
                            Tag {formatLabel(dispute.tagStatus)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 xl:min-w-[520px]">
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-white/40 mb-1">Status</p>
                          <p className="font-semibold text-[#f5f7fb]">{formatLabel(dispute.status)}</p>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-white/40 mb-1">Payout</p>
                          <p className="font-semibold text-[#f5f7fb]">{formatLabel(dispute.payoutStatus)}</p>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-white/40 mb-1">Reserve</p>
                          <p className="font-semibold text-[#f5f7fb]">{formatLabel(dispute.reserveStatus)}</p>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-white/40 mb-1">Review Deadline</p>
                          <p className="font-semibold text-[#f5f7fb]">
                            {dispute.reviewDeadline ? new Date(dispute.reviewDeadline).toLocaleDateString() : "n/a"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm font-medium text-[#7ca6ff]">
                        {dispute.payoutStatus === "frozen" ? <Snowflake className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                        {dispute.reserveStatus === "held" || dispute.reserveStatus === "frozen" ? (
                          <Archive className="w-4 h-4" />
                        ) : dispute.tagStatus ? (
                          <Tag className="w-4 h-4" />
                        ) : (
                          <AlertTriangle className="w-4 h-4" />
                        )}
                        Review
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
