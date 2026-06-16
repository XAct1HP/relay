"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Clock, RefreshCw, ShieldAlert, Wallet, XCircle } from "lucide-react";
import useAuth from "@/hooks/useAuth";

interface AdminWithdrawalItem {
  id: string;
  seller_id: string;
  amount_cents: number;
  stripe_transfer_id: string | null;
  stripe_transfer_fee_cents: number;
  idempotency_key: string | null;
  review_required: boolean;
  reviewed_at: string | null;
  reviewed_by_admin_id: string | null;
  review_notes: string | null;
  canceled_at: string | null;
  canceled_by_admin_id: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "canceled";
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
  seller: {
    id: string;
    display_name: string | null;
    full_name: string | null;
    username: string | null;
    email: string | null;
    stripe_account_id: string | null;
  } | null;
}

interface AdminWithdrawalsResponse {
  withdrawals: AdminWithdrawalItem[];
  counts: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    canceled: number;
    reviewRequired: number;
  };
}

function formatMoneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function MetricCard({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  tone?: "blue" | "amber" | "green" | "red";
}) {
  const tones = {
    blue: "border-[#5f8fff]/20 bg-[#5f8fff]/10 text-[#7ca6ff]",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
  };

  return (
    <div className="relay-card p-4 sm:p-5">
      <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">{label}</p>
      <div className={`inline-flex rounded-xl border px-3 py-2 text-lg font-semibold ${tones[tone]}`}>
        {value}
      </div>
    </div>
  );
}

export default function AdminWithdrawalsPage() {
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const [data, setData] = useState<AdminWithdrawalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed" | "failed">("all");

  useEffect(() => {
    if (!isLoading && currentUser && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      void loadWithdrawals();
    } else if (!isLoading) {
      setLoading(false);
    }
  }, [currentUser?.role, isLoading]);

  async function loadWithdrawals() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/withdrawals", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load withdrawals");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load withdrawals");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(
    withdrawalId: string,
    action: "mark_reviewed" | "cancel"
  ) {
    setActionId(withdrawalId);
    setError("");

    try {
      const body =
        action === "mark_reviewed"
          ? {
              action,
              reviewNotes: "Reviewed in admin withdrawal queue.",
              processAfterReview: true,
            }
          : {
              action,
              reason: "Canceled by admin review.",
            };

      const response = await fetch(`/api/admin/withdrawals/${withdrawalId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update withdrawal");
      }

      await loadWithdrawals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update withdrawal");
    } finally {
      setActionId(null);
    }
  }

  const filteredWithdrawals = useMemo(() => {
    const withdrawals = data?.withdrawals || [];
    if (statusFilter === "all") {
      return withdrawals;
    }
    if (statusFilter === "pending") {
      return withdrawals.filter((item) => item.status === "pending");
    }
    if (statusFilter === "completed") {
      return withdrawals.filter((item) => item.status === "completed");
    }
    return withdrawals.filter((item) => item.status === "failed" || item.status === "canceled");
  }, [data?.withdrawals, statusFilter]);

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading withdrawal queue...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6 pb-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Withdrawals</h1>
          <p className="text-white/50 max-w-3xl">
            Review Relay Balance withdrawals, approve manual-review requests, and cancel suspicious pending transfers before funds leave Relay.
          </p>
        </div>

        <button
          onClick={() => void loadWithdrawals()}
          className="relay-button-secondary inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/money" className="relay-button-secondary inline-flex items-center gap-2">
          <Wallet className="w-4 h-4" />
          Relay Balance Overview
        </Link>
      </div>

      {error && (
        <div className="relay-card border border-red-500/20 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard label="All Requests" value={data.counts.total} />
            <MetricCard label="Pending" value={data.counts.pending} tone="amber" />
            <MetricCard label="Review Required" value={data.counts.reviewRequired} tone="blue" />
            <MetricCard label="Completed" value={data.counts.completed} tone="green" />
            <MetricCard label="Processing" value={data.counts.processing} tone="blue" />
            <MetricCard label="Failed" value={data.counts.failed} tone="red" />
            <MetricCard label="Canceled" value={data.counts.canceled} tone="red" />
            <MetricCard
              label="Gross Withdrawn"
              value={formatMoneyFromCents(
                data.withdrawals
                  .filter((item) => item.status === "completed")
                  .reduce((sum, item) => sum + (item.amount_cents || 0), 0)
              )}
              tone="green"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "completed", "failed"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`rounded-lg border px-4 py-2 font-medium transition-colors ${
                  statusFilter === filter
                    ? "border-[#5f8fff] bg-[#5f8fff] text-white"
                    : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {filter === "all"
                  ? "All"
                  : filter === "pending"
                    ? "Pending"
                    : filter === "completed"
                      ? "Completed"
                      : "Failed / Canceled"}
              </button>
            ))}
          </div>

          <div className="relay-card p-0 overflow-hidden">
            <div className="divide-y divide-white/5">
              {filteredWithdrawals.length === 0 ? (
                <div className="py-12 text-center text-white/40">No withdrawals match this filter.</div>
              ) : (
                filteredWithdrawals.map((withdrawal) => {
                  const sellerLabel =
                    withdrawal.seller?.display_name ||
                    withdrawal.seller?.full_name ||
                    withdrawal.seller?.username ||
                    withdrawal.seller?.email ||
                    "Unknown seller";
                  const netAmountCents = Math.max(
                    0,
                    Number(withdrawal.amount_cents || 0) -
                      Number(withdrawal.stripe_transfer_fee_cents || 0)
                  );

                  return (
                    <div key={withdrawal.id} className="px-5 py-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[#f5f7fb] font-semibold">{sellerLabel}</p>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              withdrawal.status === "completed"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : withdrawal.status === "failed" || withdrawal.status === "canceled"
                                  ? "bg-red-500/15 text-red-300"
                                  : "bg-amber-500/15 text-amber-300"
                            }`}>
                              {withdrawal.status.replace(/_/g, " ")}
                            </span>
                            {withdrawal.review_required && (
                              <span className="rounded-full bg-[#5f8fff]/15 px-2 py-0.5 text-xs font-semibold text-[#7ca6ff]">
                                manual review
                              </span>
                            )}
                          </div>
                          <p className="text-white/45 text-sm">
                            {withdrawal.seller?.email || "No email"} {withdrawal.seller?.stripe_account_id ? "- Stripe connected" : "- Stripe missing"}
                          </p>
                          {withdrawal.seller_id && (
                            <Link
                              href={`/admin/money/sellers/${withdrawal.seller_id}`}
                              className="inline-flex items-center gap-1 text-sm text-[#7ca6ff] hover:text-[#9bbcff]"
                            >
                              Seller money detail
                            </Link>
                          )}
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">
                              Gross {formatMoneyFromCents(withdrawal.amount_cents)}
                            </span>
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">
                              Fee {formatMoneyFromCents(withdrawal.stripe_transfer_fee_cents)}
                            </span>
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">
                              Net {formatMoneyFromCents(netAmountCents)}
                            </span>
                            {withdrawal.stripe_transfer_id && (
                              <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">
                                Transfer {withdrawal.stripe_transfer_id}
                              </span>
                            )}
                          </div>
                          {withdrawal.failure_reason && (
                            <p className="text-sm text-red-300">{withdrawal.failure_reason}</p>
                          )}
                          {withdrawal.review_notes && (
                            <p className="text-sm text-white/55">Review note: {withdrawal.review_notes}</p>
                          )}
                        </div>

                        <div className="hidden md:grid md:grid-cols-4 gap-3 xl:min-w-[520px]">
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-1">Requested</p>
                            <p className="font-semibold text-[#f5f7fb]">
                              {new Date(withdrawal.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-1">Completed</p>
                            <p className="font-semibold text-[#f5f7fb]">
                              {withdrawal.completed_at
                                ? new Date(withdrawal.completed_at).toLocaleString()
                                : "n/a"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-1">Reviewed</p>
                            <p className="font-semibold text-[#f5f7fb]">
                              {withdrawal.reviewed_at
                                ? new Date(withdrawal.reviewed_at).toLocaleDateString()
                                : "not yet"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-1">Idempotency</p>
                            <p className="font-semibold text-[#f5f7fb] truncate">
                              {withdrawal.idempotency_key || "n/a"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          {withdrawal.status === "pending" && (
                            <>
                              <button
                                onClick={() => void runAction(withdrawal.id, "mark_reviewed")}
                                disabled={actionId === withdrawal.id}
                                className="relay-button-secondary inline-flex items-center gap-2 disabled:opacity-50"
                              >
                                <ShieldAlert className="w-4 h-4" />
                                {actionId === withdrawal.id ? "Working..." : "Mark Reviewed"}
                              </button>
                              <button
                                onClick={() => void runAction(withdrawal.id, "cancel")}
                                disabled={actionId === withdrawal.id}
                                className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                              >
                                <XCircle className="w-4 h-4" />
                                Cancel Pending
                              </button>
                            </>
                          )}
                          {withdrawal.status === "completed" && (
                            <div className="inline-flex items-center gap-2 text-emerald-300 text-sm font-medium">
                              <Banknote className="w-4 h-4" />
                              Sent
                            </div>
                          )}
                          {withdrawal.status === "processing" && (
                            <div className="inline-flex items-center gap-2 text-[#7ca6ff] text-sm font-medium">
                              <Clock className="w-4 h-4" />
                              Processing
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
