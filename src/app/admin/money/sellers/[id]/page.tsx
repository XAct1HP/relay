"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
  Wallet,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";

interface SellerMoneyDetailResponse {
  seller: {
    id: string;
    email: string;
    display_name: string | null;
    full_name: string | null;
    username: string | null;
    stripe_account_id: string | null;
    seller_tier: string | null;
  };
  relayBalance: {
    sellerId: string;
    totalBalanceCents: number;
    pendingBalanceCents: number;
    availableBalanceCents: number;
    exposureCents: number;
    withdrawableBalanceCents: number;
    adminFrozen: boolean;
    frozenReason: string | null;
    frozenAt: string | null;
    updatedAt: string | null;
  };
  exposureHolds: Array<{
    id: string;
    order_id: string;
    amount_cents: number;
    status: string;
    reason: string;
    created_at: string;
    order?: {
      id: string;
      status: string;
      review_window_ends_at?: string | null;
      listing?: { brand?: string | null; model?: string | null } | null;
    } | null;
  }>;
  ledger: Array<{
    id: string;
    order_id: string | null;
    type: string;
    amount_cents: number;
    status: string;
    metadata: Record<string, unknown>;
    created_at: string;
    order?: {
      id: string;
      status: string;
      listing?: { brand?: string | null; model?: string | null } | null;
    } | null;
  }>;
  withdrawals: Array<{
    id: string;
    amount_cents: number;
    stripe_transfer_fee_cents: number;
    status: string;
    review_required?: boolean;
    review_notes?: string | null;
    failure_reason?: string | null;
    created_at: string;
  }>;
  disputedOrders: Array<{
    id: string;
    status: string;
    price: number;
    payout_status: string | null;
    balance_credit_status: string | null;
    seller_funds_frozen: boolean;
    seller_proceeds_cents: number | null;
    review_window_ends_at: string | null;
    updated_at: string;
    listing?: { brand?: string | null; model?: string | null } | null;
  }>;
  auditLog: Array<{
    id: string;
    event_type: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
}

function formatMoneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "n/a";
}

function labelFromSeller(seller: SellerMoneyDetailResponse["seller"]) {
  return seller.display_name || seller.full_name || seller.username || seller.email;
}

function labelFromOrder(order?: { id: string; listing?: { brand?: string | null; model?: string | null } | null } | null) {
  if (!order) {
    return "Relay Balance";
  }

  if (order.listing?.brand || order.listing?.model) {
    return `${order.listing?.brand || "Unknown"} ${order.listing?.model || "Order"}`;
  }

  return `Order ${order.id.slice(0, 8)}`;
}

export default function AdminSellerMoneyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const sellerId = params.id as string;
  const [data, setData] = useState<SellerMoneyDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [freezeReason, setFreezeReason] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");

  useEffect(() => {
    if (!isLoading && currentUser && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      void loadDetail();
    } else if (!isLoading) {
      setLoading(false);
    }
  }, [currentUser?.role, isLoading, sellerId]);

  async function loadDetail() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/money/sellers/${sellerId}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load seller money detail");
      }

      setData(payload);
      setFreezeReason(payload.relayBalance?.frozenReason || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load seller money detail");
    } finally {
      setLoading(false);
    }
  }

  async function runSellerAction(body: Record<string, unknown>) {
    setActionLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/money/sellers/${sellerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update seller money state");
      }

      setAdjustmentAmount("");
      setAdjustmentReason("");
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update seller money state");
    } finally {
      setActionLoading(false);
    }
  }

  async function runWithdrawalAction(
    withdrawalId: string,
    action: "mark_reviewed" | "cancel"
  ) {
    setActionLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/withdrawals/${withdrawalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "mark_reviewed"
            ? {
                action,
                reviewNotes: "Reviewed from seller money detail.",
                processAfterReview: true,
              }
            : {
                action,
                reason: "Canceled as suspicious from seller money detail.",
              }
        ),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update withdrawal");
      }

      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update withdrawal");
    } finally {
      setActionLoading(false);
    }
  }

  const adjustmentAmountCents = useMemo(() => {
    const value = Number(adjustmentAmount);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.round(value * 100);
  }, [adjustmentAmount]);

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading seller money detail...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  if (!data) {
    return <div className="py-12 text-center text-white/40">Seller money detail not found.</div>;
  }

  const { seller, relayBalance, exposureHolds, ledger, withdrawals, disputedOrders, auditLog } = data;

  return (
    <div className="space-y-6 pb-12">
      <Link href="/admin/money" className="inline-flex items-center gap-2 text-[#5f8fff] hover:text-[#7ca6ff]">
        <ArrowLeft className="w-4 h-4" />
        Back to Relay Balance
      </Link>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">SELLER MONEY DETAIL</p>
          <h1 className="relay-title">{labelFromSeller(seller)}</h1>
          <p className="text-white/45">{seller.email} · {seller.seller_tier || "tier_1"}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/admin/withdrawals" className="relay-button-secondary inline-flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Withdrawal Queue
          </Link>
          <button
            onClick={() => void loadDetail()}
            className="relay-button-secondary inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="relay-card border border-red-500/20 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          ["Relay Balance", relayBalance.totalBalanceCents],
          ["Pending", relayBalance.pendingBalanceCents],
          ["Available", relayBalance.availableBalanceCents],
          ["Exposure", relayBalance.exposureCents],
          ["Withdrawable", relayBalance.withdrawableBalanceCents],
        ].map(([label, value]) => (
          <div key={label} className="relay-card p-4 sm:p-5">
            <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">{label}</p>
            <p className="text-[#f5f7fb] text-2xl font-semibold">{formatMoneyFromCents(Number(value))}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-6">
        <div className="space-y-6">
          <div className="relay-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              {relayBalance.adminFrozen ? (
                <Lock className="w-5 h-5 text-red-300" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
              )}
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Admin Controls</h2>
            </div>

            <div className={`rounded-xl border p-4 text-sm ${relayBalance.adminFrozen ? "border-red-500/20 bg-red-500/10 text-red-200" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"}`}>
              {relayBalance.adminFrozen
                ? `Relay Balance is frozen. ${relayBalance.frozenReason || ""}`
                : "Relay Balance is active. Seller can withdraw up to current withdrawable balance."}
            </div>

            <textarea
              value={freezeReason}
              onChange={(event) => setFreezeReason(event.target.value)}
              rows={3}
              className="relay-textarea"
              placeholder="Required reason for freezing or unfreezing this seller's Relay Balance."
            />

            <div className="flex flex-wrap gap-3">
              {relayBalance.adminFrozen ? (
                <button
                  onClick={() => void runSellerAction({ action: "unfreeze", reason: freezeReason })}
                  disabled={actionLoading || !freezeReason.trim()}
                  className="relay-button-secondary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Unlock className="w-4 h-4" />
                  Unfreeze Seller Balance
                </button>
              ) : (
                <button
                  onClick={() => void runSellerAction({ action: "freeze", reason: freezeReason })}
                  disabled={actionLoading || !freezeReason.trim()}
                  className="relay-button-secondary inline-flex items-center gap-2 bg-red-500/10 text-red-300 disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  Freeze Seller Balance
                </button>
              )}
            </div>

            <div className="pt-4 border-t border-white/10 space-y-3">
              <h3 className="text-[#f5f7fb] font-semibold">Manual Adjustment</h3>
              <p className="text-white/45 text-sm">Use a positive amount to credit funds. Use a negative amount to debit funds. A reason is required and every adjustment is written to the balance ledger and audit log.</p>
              <input
                type="number"
                step="0.01"
                value={adjustmentAmount}
                onChange={(event) => setAdjustmentAmount(event.target.value)}
                className="relay-input"
                placeholder="Amount in dollars, for example -25.00 or 25.00"
              />
              <textarea
                value={adjustmentReason}
                onChange={(event) => setAdjustmentReason(event.target.value)}
                rows={3}
                className="relay-textarea"
                placeholder="Required reason for manual adjustment."
              />
              <button
                onClick={() =>
                  void runSellerAction({
                    action: "manual_adjustment",
                    amountCents: adjustmentAmountCents,
                    reason: adjustmentReason,
                  })
                }
                disabled={actionLoading || !adjustmentReason.trim() || adjustmentAmountCents === 0}
                className="relay-button-secondary inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                Create Manual Adjustment
              </button>
            </div>
          </div>

          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Active Exposure Holds</h2>
            <div className="space-y-3">
              {exposureHolds.length === 0 ? (
                <div className="text-white/40 text-sm">No active exposure holds.</div>
              ) : (
                exposureHolds.map((hold) => (
                  <div key={hold.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-[#f5f7fb] font-medium">{labelFromOrder(hold.order || null)}</p>
                      <p className="text-amber-300 font-semibold">{formatMoneyFromCents(hold.amount_cents)}</p>
                    </div>
                    <p className="text-white/45 text-sm">
                      {hold.status} · {hold.reason} · Created {formatDate(hold.created_at)}
                    </p>
                    {hold.order?.id && (
                      <Link href={`/admin/money/orders/${hold.order.id}`} className="mt-3 inline-flex items-center gap-2 text-sm text-[#7ca6ff] hover:text-[#9bbcff]">
                        View order money detail
                        <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                      </Link>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Disputed Orders</h2>
            <div className="space-y-3">
              {disputedOrders.length === 0 ? (
                <div className="text-white/40 text-sm">No disputed or frozen orders.</div>
              ) : (
                disputedOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/admin/money/orders/${order.id}`}
                    className="block rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[#f5f7fb] font-medium">
                          {(order.listing?.brand || "Unknown")} {(order.listing?.model || "Order")}
                        </p>
                        <p className="text-white/45 text-sm">
                          {order.status} · payout {order.payout_status || "pending"} · balance {order.balance_credit_status || "n/a"}
                        </p>
                      </div>
                      <p className="text-red-300 font-semibold">
                        {formatMoneyFromCents(Number(order.seller_proceeds_cents || 0))}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Withdrawal History</h2>
            <div className="space-y-3">
              {withdrawals.length === 0 ? (
                <div className="text-white/40 text-sm">No withdrawals yet.</div>
              ) : (
                withdrawals.map((withdrawal) => (
                  <div key={withdrawal.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <p className="text-[#f5f7fb] font-medium">{formatMoneyFromCents(withdrawal.amount_cents)}</p>
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-semibold text-white/60">
                            {withdrawal.status.replace(/_/g, " ")}
                          </span>
                          {withdrawal.review_required && (
                            <span className="rounded-full bg-[#5f8fff]/15 px-2 py-0.5 text-xs font-semibold text-[#7ca6ff]">
                              review required
                            </span>
                          )}
                        </div>
                        <p className="text-white/45 text-sm">
                          Fee {formatMoneyFromCents(withdrawal.stripe_transfer_fee_cents)} · Requested {formatDate(withdrawal.created_at)}
                        </p>
                        {withdrawal.failure_reason && (
                          <p className="text-red-300 text-sm mt-2">{withdrawal.failure_reason}</p>
                        )}
                        {withdrawal.review_notes && (
                          <p className="text-white/45 text-sm mt-2">Review note: {withdrawal.review_notes}</p>
                        )}
                      </div>

                      {withdrawal.status === "pending" && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void runWithdrawalAction(withdrawal.id, "mark_reviewed")}
                            disabled={actionLoading}
                            className="relay-button-secondary text-sm disabled:opacity-50"
                          >
                            Mark Reviewed
                          </button>
                          <button
                            onClick={() => void runWithdrawalAction(withdrawal.id, "cancel")}
                            disabled={actionLoading}
                            className="relay-button-secondary bg-red-500/10 text-red-300 text-sm disabled:opacity-50"
                          >
                            Cancel Suspicious
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Balance Ledger</h2>
            <div className="space-y-3">
              {ledger.length === 0 ? (
                <div className="text-white/40 text-sm">No ledger activity yet.</div>
              ) : (
                ledger.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <p className="text-[#f5f7fb] font-medium">{entry.type.replace(/_/g, " ")}</p>
                      <p className="text-[#f5f7fb] font-semibold">
                        {(entry.amount_cents || 0) < 0 ? "-" : ""}{formatMoneyFromCents(Math.abs(entry.amount_cents || 0))}
                      </p>
                    </div>
                    <p className="text-white/45 text-sm">
                      {entry.status} · {labelFromOrder(entry.order || null)} · {formatDate(entry.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Money Audit Log</h2>
            <div className="space-y-3">
              {auditLog.length === 0 ? (
                <div className="text-white/40 text-sm">No audit log entries yet.</div>
              ) : (
                auditLog.map((event) => (
                  <div key={event.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-[#f5f7fb] font-medium">{event.event_type}</p>
                    <p className="text-white/45 text-sm mt-1">{formatDate(event.created_at)}</p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-black/20 p-3 text-xs text-white/55">
                      {JSON.stringify(event.metadata || {}, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
