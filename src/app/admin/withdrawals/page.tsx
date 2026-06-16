"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, RefreshCw, ShieldAlert, Wallet, XCircle } from "lucide-react";
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

  const grossWithdrawnCents = useMemo(() => {
    if (!data) return 0;
    return data.withdrawals
      .filter((item) => item.status === "completed")
      .reduce((sum, item) => sum + (item.amount_cents || 0), 0);
  }, [data]);

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading withdrawal queue...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Withdrawals</h1>
          <p className="text-white/50 max-w-2xl text-sm">
            Review withdrawals, approve manual-review requests, and cancel suspicious transfers before funds leave Relay.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/money" className="relay-button-secondary inline-flex items-center gap-2 text-sm">
            <Wallet className="w-3.5 h-3.5" />
            Balance Overview
          </Link>
          <button
            onClick={() => void loadWithdrawals()}
            className="relay-button-secondary inline-flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="relay-card border border-red-500/20 bg-red-500/10 p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Summary bar */}
          <div className="relay-card px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-300">
                {data.counts.pending} Pending
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5f8fff]/20 bg-[#5f8fff]/10 px-3 py-1 text-sm font-semibold text-[#7ca6ff]">
                {data.counts.reviewRequired} Review Required
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                {data.counts.completed} Completed
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-300">
                {data.counts.failed + data.counts.canceled} Failed / Canceled
              </span>
              <span className="ml-auto text-sm text-white/40">
                Gross withdrawn: <span className="text-emerald-300 font-semibold">{formatMoneyFromCents(grossWithdrawnCents)}</span>
              </span>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {(["all", "pending", "completed", "failed"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === filter
                    ? "bg-[#5f8fff] text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
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

          {/* Withdrawal list */}
          <div className="relay-card p-0 overflow-hidden">
            <div className="divide-y divide-white/5">
              {filteredWithdrawals.length === 0 ? (
                <div className="py-12 text-center text-white/40 text-sm">No withdrawals match this filter.</div>
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
                  const borderAccent =
                    withdrawal.status === "completed"
                      ? "border-l-emerald-500/60"
                      : withdrawal.status === "failed" || withdrawal.status === "canceled"
                        ? "border-l-red-500/60"
                        : "border-l-amber-500/60";

                  return (
                    <div key={withdrawal.id} className={`border-l-2 ${borderAccent} px-5 py-3.5`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {/* Left: seller info + money pills */}
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {withdrawal.seller_id ? (
                              <Link
                                href={`/admin/money/sellers/${withdrawal.seller_id}`}
                                className="text-[#f5f7fb] font-semibold hover:text-[#7ca6ff] transition-colors"
                              >
                                {sellerLabel}
                              </Link>
                            ) : (
                              <p className="text-[#f5f7fb] font-semibold">{sellerLabel}</p>
                            )}
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
                            <span className="text-white/30 text-xs">
                              {new Date(withdrawal.created_at).toLocaleDateString()}{" "}
                              {new Date(withdrawal.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs">
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
                            <p className="text-xs text-red-300">{withdrawal.failure_reason}</p>
                          )}
                          {withdrawal.review_notes && (
                            <p className="text-xs text-white/50">Review note: {withdrawal.review_notes}</p>
                          )}
                        </div>

                        {/* Right: actions */}
                        <div className="flex shrink-0 items-center gap-2">
                          {withdrawal.status === "pending" && (
                            <>
                              <button
                                onClick={() => void runAction(withdrawal.id, "mark_reviewed")}
                                disabled={actionId === withdrawal.id}
                                className="relay-button-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
                              >
                                <ShieldAlert className="w-3.5 h-3.5" />
                                {actionId === withdrawal.id ? "Working..." : "Mark Reviewed"}
                              </button>
                              <button
                                onClick={() => void runAction(withdrawal.id, "cancel")}
                                disabled={actionId === withdrawal.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Cancel
                              </button>
                            </>
                          )}
                          {withdrawal.status === "completed" && (
                            <span className="inline-flex items-center gap-1.5 text-emerald-300 text-sm font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Sent
                            </span>
                          )}
                          {withdrawal.status === "processing" && (
                            <span className="inline-flex items-center gap-1.5 text-[#7ca6ff] text-sm font-medium">
                              <Clock className="w-3.5 h-3.5" />
                              Processing
                            </span>
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
