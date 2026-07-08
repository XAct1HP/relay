"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import useAuth from "@/hooks/useAuth";
import { formatListingTitle } from "@/lib/listing-display";

interface OrderMoneyDetailResponse {
  order: any;
  sellerBalance: {
    availableBalanceCents: number;
    pendingBalanceCents: number;
    withdrawableBalanceCents: number;
    adminFrozen: boolean;
  } | null;
  ledger: Array<{
    id: string;
    type: string;
    amount_cents: number;
    status: string;
    created_at: string;
  }>;
  exposureHold: {
    id: string;
    amount_cents: number;
    status: string;
    reason: string;
    created_at: string;
    released_at: string | null;
  } | null;
  sellerWithdrawals: Array<{
    id: string;
    amount_cents: number;
    status: string;
    created_at: string;
  }>;
  auditLog: Array<{
    id: string;
    event_type: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
  computed: {
    buyerPaidAmountCents: number;
    subtotalCents: number;
    shippingCents: number;
    relayFeeCents: number;
    stripeFeeEstimateCents: number;
    sellerProceedsCents: number;
    pendingCreditCents: number;
    availableCreditCents: number;
    disputeFreezeCents: number;
    exposureHoldCents: number;
  };
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

export default function AdminOrderMoneyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const orderId = params.id as string;
  const [data, setData] = useState<OrderMoneyDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  }, [currentUser?.role, isLoading, orderId]);

  async function loadDetail() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/money/orders/${orderId}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load order money detail");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order money detail");
    } finally {
      setLoading(false);
    }
  }

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading order money detail...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  if (!data) {
    return <div className="py-12 text-center text-white/40">Order money detail not found.</div>;
  }

  const { order, sellerBalance, ledger, exposureHold, sellerWithdrawals, auditLog, computed } = data;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between gap-3">
        <Link href="/admin/money" className="inline-flex items-center gap-2 text-[#5f8fff] hover:text-[#7ca6ff]">
          <ArrowLeft className="w-4 h-4" />
          Back to Relay Balance
        </Link>

        <button
          onClick={() => void loadDetail()}
          className="relay-button-secondary inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        <p className="relay-eyebrow text-[#5f8fff]">ORDER MONEY DETAIL</p>
        <h1 className="relay-title">
          {formatListingTitle(order.listing?.brand, order.listing?.model, undefined, "Order")}
        </h1>
        <p className="text-white/45">
          Order {order.id} · Seller {order.seller?.display_name || order.seller?.full_name || order.seller?.username || order.seller?.email || "Unknown"} · Buyer {order.buyer?.display_name || order.buyer?.full_name || order.buyer?.username || order.buyer?.email || "Unknown"}
        </p>
      </div>

      {error && (
        <div className="relay-card border border-red-500/20 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          ["Buyer Paid Amount", computed.buyerPaidAmountCents],
          ["Subtotal", computed.subtotalCents],
          ["Shipping", computed.shippingCents],
          ["Relay Fee", computed.relayFeeCents],
          ["Stripe Fee Estimate", computed.stripeFeeEstimateCents],
          ["Seller Proceeds", computed.sellerProceedsCents],
          ["Pending Credit", computed.pendingCreditCents],
          ["Available Credit", computed.availableCreditCents],
          ["Legacy Exposure Record", computed.exposureHoldCents],
          ["Dispute Freeze", computed.disputeFreezeCents],
        ].map(([label, value]) => (
          <div key={label} className="relay-card p-4 sm:p-5">
            <p className="text-white/50 text-xs uppercase tracking-[0.16em] mb-2">{label}</p>
            <p className="text-[#f5f7fb] text-xl font-semibold">{formatMoneyFromCents(Number(value))}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6">
        <div className="space-y-6">
          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Order Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/50 mb-1">Order status</p>
                <p className="text-[#f5f7fb] font-semibold">{order.status}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/50 mb-1">Payout status</p>
                <p className="text-[#f5f7fb] font-semibold">{order.payout_status || "pending"}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/50 mb-1">Balance credit status</p>
                <p className="text-[#f5f7fb] font-semibold">{order.balance_credit_status || "not started"}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-white/50 mb-1">Dispute freeze status</p>
                <p className="text-[#f5f7fb] font-semibold">
                  {order.seller_funds_frozen || order.payout_status === "frozen" ? "Frozen" : "Not frozen"}
                </p>
              </div>
            </div>
            <div className="mt-4 text-sm text-white/50 space-y-1">
              <p>Funds available at: <span className="text-[#f5f7fb]">{formatDate(order.funds_available_at)}</span></p>
              <p>Review window ends: <span className="text-[#f5f7fb]">{formatDate(order.review_window_ends_at)}</span></p>
              <p>Seller withdrawals happen from pooled Relay Balance, not as direct per-order transfers.</p>
            </div>
          </div>

          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Legacy Exposure Record</h2>
            <p className="text-white/45 text-sm mb-4">
              Exposure is inactive in the launch payout model. Any record here is legacy or dispute-history context only.
            </p>
            {exposureHold ? (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm">
                <p className="text-[#f5f7fb] font-medium mb-1">{formatMoneyFromCents(exposureHold.amount_cents)}</p>
                <p className="text-white/45">{exposureHold.status} · {exposureHold.reason}</p>
                <p className="text-white/45 mt-1">Created {formatDate(exposureHold.created_at)}</p>
                <p className="text-white/45">Released {formatDate(exposureHold.released_at)}</p>
              </div>
            ) : (
              <div className="text-white/40 text-sm">No legacy exposure record found for this order.</div>
            )}
          </div>

          {sellerBalance && (
            <div className="relay-card p-5">
              <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Seller Relay Balance Snapshot</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <p className="text-white/50 text-sm mb-1">Pending</p>
                  <p className="text-[#f5f7fb] font-semibold">{formatMoneyFromCents(sellerBalance.pendingBalanceCents)}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <p className="text-white/50 text-sm mb-1">Available</p>
                  <p className="text-[#f5f7fb] font-semibold">{formatMoneyFromCents(sellerBalance.availableBalanceCents)}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <p className="text-white/50 text-sm mb-1">Available to Withdraw</p>
                  <p className="text-[#f5f7fb] font-semibold">{formatMoneyFromCents(sellerBalance.withdrawableBalanceCents)}</p>
                </div>
              </div>
              {sellerBalance.adminFrozen && (
                <p className="mt-4 text-red-300 text-sm">Seller balance is currently frozen by admin.</p>
              )}
              {order.seller_id && (
                <Link href={`/admin/money/sellers/${order.seller_id}`} className="mt-4 inline-flex items-center gap-2 text-sm text-[#7ca6ff] hover:text-[#9bbcff]">
                  Open seller money detail
                  <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Balance Ledger</h2>
            <div className="space-y-3">
              {ledger.length === 0 ? (
                <div className="text-white/40 text-sm">No money ledger rows for this order.</div>
              ) : (
                ledger.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[#f5f7fb] font-medium">{entry.type.replace(/_/g, " ")}</p>
                        <p className="text-white/45 text-sm">{entry.status} · {formatDate(entry.created_at)}</p>
                      </div>
                      <p className="text-[#f5f7fb] font-semibold">
                        {(entry.amount_cents || 0) < 0 ? "-" : ""}{formatMoneyFromCents(Math.abs(entry.amount_cents || 0))}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Recent Seller Withdrawals</h2>
            <div className="space-y-3">
              {sellerWithdrawals.length === 0 ? (
                <div className="text-white/40 text-sm">No recent seller withdrawals.</div>
              ) : (
                sellerWithdrawals.map((withdrawal) => (
                  <div key={withdrawal.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[#f5f7fb] font-medium">{formatMoneyFromCents(withdrawal.amount_cents)}</p>
                        <p className="text-white/45 text-sm">{withdrawal.status} · {formatDate(withdrawal.created_at)}</p>
                      </div>
                      {order.seller_id && (
                        <Link href={`/admin/money/sellers/${order.seller_id}`} className="text-sm text-[#7ca6ff] hover:text-[#9bbcff]">
                          Seller detail
                        </Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="relay-card p-5">
            <h2 className="text-lg font-semibold text-[#f5f7fb] mb-4">Audit Log</h2>
            <div className="space-y-3">
              {auditLog.length === 0 ? (
                <div className="text-white/40 text-sm">No audit entries for this order yet.</div>
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
