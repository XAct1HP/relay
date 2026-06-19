"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Ban,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileWarning,
  Flag,
  HandCoins,
  Package,
  RefreshCw,
  Shield,
  ShieldAlert,
  Snowflake,
  Tag,
  Truck,
  Unlock,
  XCircle,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";

interface AdminDisputeDetailResponse {
  order: any;
  relayBalance: {
    totalBalanceCents: number;
    pendingBalanceCents: number;
    availableBalanceCents: number;
    withdrawableBalanceCents: number;
    adminFrozen: boolean;
  } | null;
  orderLedger: any[];
  exposureHolds: any[];
  reserveEntries: any[];
  reserveSummary: {
    status: string;
    heldCents: number;
    releasedCents: number;
    consumedCents: number;
    frozenCents: number;
    nextReleaseAt: string | null;
  };
  sellerViolations: any[];
  timeline: Array<{
    id: string;
    actor_user_id: string | null;
    actor_role: string;
    event_type: string;
    metadata: Record<string, any>;
    created_at: string;
  }>;
  computed: {
    orderValueCents: number;
    buyerPaidAmountCents: number;
    refundAmountCents: number;
    sellerProceedsCents: number;
    pendingCreditCents: number;
    availableCreditCents: number;
    disputeFreezeCents: number;
    disputeDebitCents: number;
    exposureActiveCents: number;
    exposureReleasedCents: number;
    exposureConsumedCents: number;
    exposureStatus: string;
    currentExposureHoldCents: number;
    relayBalanceImpact: {
      totalBalanceCents: number;
      pendingBalanceCents: number;
      availableBalanceCents: number;
      withdrawableBalanceCents: number;
      adminFrozen: boolean;
    };
    sellerDebitAmountCents: number;
    finalFinancialOutcome: string;
    withdrawalBlocked: boolean;
    reserveStatus: string;
    tagMatch: boolean;
    tagMismatchReason: string | null;
    legacyDisputeFlow: boolean;
    reviewFlags: {
      custody: boolean;
      checkcheck: boolean;
      payout: boolean;
    };
  };
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "None";
  return value.replaceAll("_", " ");
}

function formatTier(tier: string | null | undefined) {
  return tier ? tier.replace("tier_", "Tier ") : "Tier 1";
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:p-4">
      <p className="text-[10px] sm:text-xs uppercase tracking-[0.16em] text-white/50 mb-1">{label}</p>
      <div className="text-[#f5f7fb] font-semibold text-sm sm:text-base break-words">{value}</div>
    </div>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "blue" | "green" | "red" | "amber";
}) {
  const tones = {
    default: "bg-white/5 text-white/65",
    blue: "bg-[#5f8fff]/15 text-[#7ca6ff]",
    green: "bg-emerald-500/15 text-emerald-300",
    red: "bg-red-500/15 text-red-300",
    amber: "bg-amber-500/15 text-amber-300",
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function ImageGrid({
  title,
  images,
}: {
  title: string;
  images: Array<{ label: string; url: string | null | undefined }>;
}) {
  const visible = images.filter((image) => image.url);
  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-white/45">
        No {title.toLowerCase()} uploaded.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[#f5f7fb]">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {visible.map((image) => (
          <a
            key={image.label}
            href={image.url!}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition-colors hover:border-[#5f8fff]/40"
          >
            <div className="aspect-square bg-black/20">
              <img src={image.url!} alt={image.label} className="h-full w-full object-cover" />
            </div>
            <div className="border-t border-white/10 px-3 py-2 text-xs text-white/60">{image.label}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function AdminDisputeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser, isLoading } = useAuth();
  const orderId = params.id as string;

  const [data, setData] = useState<AdminDisputeDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notes, setNotes] = useState("");
  const [reserveAmount, setReserveAmount] = useState("");
  const [targetTier, setTargetTier] = useState<"tier_1" | "tier_2" | "tier_3">("tier_1");
  const [manualOutcome, setManualOutcome] = useState("carrier_issue_manual_handling");

  useEffect(() => {
    if (!isLoading && currentUser && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      void loadDispute();
    } else if (!isLoading) {
      setLoading(false);
    }
  }, [currentUser?.role, orderId, isLoading]);

  async function loadDispute() {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/admin/dispute/${orderId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load dispute");
      }

      setData(payload);
      setTargetTier(payload.order?.seller?.seller_tier || "tier_1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dispute");
    } finally {
      setLoading(false);
    }
  }

  async function submitAction(
    action: string,
    extra: Record<string, unknown> = {},
    successMessage = "Dispute updated."
  ) {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/admin/dispute/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes,
          targetTier,
          ...extra,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update dispute");
      }

      setData(payload.detail);
      setSuccess(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update dispute");
    } finally {
      setSaving(false);
    }
  }

  const dispute = data?.order?.order_dispute;
  const custody = data?.order?.order_chain_of_custody;
  const seller = data?.order?.seller;
  const buyer = data?.order?.buyer;
  const relayTag = data?.order?.relay_tag;
  const payouts = useMemo(() => data?.order?.order_payouts || [], [data?.order?.order_payouts]);

  if (isLoading || loading) {
    return <div className="py-12 text-center text-white/40">Loading dispute detail...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  if (!data || !dispute) {
    return (
      <div className="space-y-6 pb-12">
        <Link href="/admin/disputes" className="inline-flex items-center gap-2 text-[#5f8fff] hover:text-[#7ca6ff]">
          <ArrowLeft className="w-4 h-4" />
          Back to Disputes
        </Link>
        <div className="relay-card p-12 text-center text-white/40">Dispute not found.</div>
      </div>
    );
  }

  const sellerPhotos = [
    { label: "Tag Attached", url: custody?.seller_tag_photo_url },
    { label: "Pair Photo", url: custody?.seller_pair_photo_url },
    { label: "Pair In Box", url: custody?.seller_box_photo_url },
    { label: "Sealed Package", url: custody?.seller_sealed_package_photo_url },
  ];
  const buyerPhotos = [
    { label: "Buyer Tag Photo", url: custody?.buyer_tag_photo_url },
    { label: "Buyer Pair Photo", url: custody?.buyer_pair_photo_url },
  ];
  const legacyAuthPhotos = Array.isArray(data.order?.auth_photos)
    ? data.order.auth_photos.map((url: string, index: number) => ({
        label: `Legacy Auth ${index + 1}`,
        url,
      }))
    : [];

  return (
    <div className="space-y-6 pb-12">
      <Link href="/admin/disputes" className="inline-flex items-center gap-2 text-[#5f8fff] hover:text-[#7ca6ff]">
        <ArrowLeft className="w-4 h-4" />
        Back to Disputes
      </Link>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="relay-eyebrow text-[#5f8fff]">ADMIN DISPUTE REVIEW</p>
            {data.computed.legacyDisputeFlow && <Badge tone="amber">legacy dispute record</Badge>}
          </div>
          <h1 className="relay-title">{data.order?.listing?.brand || "Relay"} {data.order?.listing?.model || "Order Dispute"}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge tone="red">{formatLabel(dispute.category)}</Badge>
            <Badge tone={dispute.status === "resolved" || dispute.status === "closed" ? "green" : "amber"}>
              {formatLabel(dispute.status)}
            </Badge>
            <Badge tone="blue">{formatTier(seller?.seller_tier)}</Badge>
            <Badge tone={data.order?.payout_status === "frozen" ? "red" : "default"}>
              payout {formatLabel(data.order?.payout_status)}
            </Badge>
            <Badge tone={data.reserveSummary.status === "frozen" ? "red" : data.reserveSummary.status === "held" ? "amber" : "default"}>
              reserve {formatLabel(data.reserveSummary.status)}
            </Badge>
          </div>
        </div>

        <button
          onClick={() => void loadDispute()}
          className="relay-button-secondary inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {(error || success) && (
        <div className={`relay-card border p-4 ${error ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
          {error || success}
        </div>
      )}

      <div className="relay-card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-[#7ca6ff]" />
          <h2 className="text-lg font-semibold text-[#f5f7fb]">Order Overview</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <InfoCard label="Buyer" value={buyer ? sellerDisplayNameForUi(buyer) : "Unknown"} />
          <InfoCard label="Seller" value={seller ? sellerDisplayNameForUi(seller) : "Unknown"} />
          <InfoCard label="Trust Score" value={seller?.trust_score || 0} />
          <InfoCard label="Order Value" value={formatMoney(data.computed.orderValueCents)} />
          <InfoCard label="SKU / Size" value={`${data.order?.listing?.sku || data.order?.listing?.sku_normalized || "n/a"} / ${data.order?.size || "n/a"}`} />
          <InfoCard label="Delivery" value={data.order?.delivered_at ? new Date(data.order.delivered_at).toLocaleDateString() : "Not delivered"} />
          <InfoCard label="Deadline" value={data.order?.review_deadline ? new Date(data.order.review_deadline).toLocaleDateString() : "No deadline"} />
          <InfoCard label="Payout / Reserve" value={`${formatLabel(data.order?.payout_status)} / ${formatLabel(data.reserveSummary.status)}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        <div className="relay-card p-4 sm:p-5 space-y-4 sm:space-y-5">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-amber-300" />
            <h2 className="text-lg font-semibold text-[#f5f7fb]">Chain of Custody</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <InfoCard label="Seller Tag" value={custody?.seller_scanned_tag_value || "Missing"} />
            <InfoCard label="Buyer Tag" value={custody?.buyer_scanned_tag_value || "Missing"} />
            <InfoCard label="Tag Match" value={data.computed.tagMatch ? "Match" : "Mismatch / pending"} />
            <InfoCard label="Tag Status" value={formatLabel(relayTag?.status || null)} />
            <InfoCard label="Verification" value={formatLabel(custody?.verification_status || null)} />
            <InfoCard label="Admin Review" value={custody?.admin_review_required ? "Required" : "Not required"} />
          </div>

          {data.computed.tagMismatchReason && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              {data.computed.tagMismatchReason}
            </div>
          )}

          <ImageGrid title="Seller Evidence" images={sellerPhotos} />
          <ImageGrid title="Buyer Evidence" images={buyerPhotos} />
        </div>

        <div className="relay-card p-4 sm:p-5 space-y-4 sm:space-y-5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#7ca6ff]" />
            <h2 className="text-lg font-semibold text-[#f5f7fb]">Authentication</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <InfoCard label="CheckCheck" value={data.order?.checkcheck_required ? "Required" : "Not required"} />
            <InfoCard label="CC Status" value={formatLabel(data.order?.checkcheck_status)} />
            <InfoCard label="CC Reason" value={data.order?.checkcheck_reason || "None"} />
            <InfoCard label="High-Risk SKU" value={data.order?.high_risk_sku_required ? "Yes" : "No"} />
            <InfoCard label="Random Audit" value={data.order?.random_audit_required ? "Yes" : "No"} />
            <InfoCard label="Legacy Auth" value={data.computed.legacyDisputeFlow ? "Yes" : "No"} />
          </div>

          {data.order?.checkcheck_certificate_url && (
            <a
              href={data.order.checkcheck_certificate_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#7ca6ff] hover:text-[#9ab8ff]"
            >
              <ExternalLink className="w-4 h-4" />
              Open CheckCheck certificate
            </a>
          )}

          <ImageGrid title="Legacy Auth Photos" images={legacyAuthPhotos} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,0.8fr] gap-4 sm:gap-6">
        <div className="relay-card p-4 sm:p-5 space-y-4 sm:space-y-5">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-300" />
            <h2 className="text-lg font-semibold text-[#f5f7fb]">Dispute Review</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.16em] text-white/50 mb-2">Buyer Claim</p>
              <p className="text-sm text-[#f5f7fb]">{dispute.buyer_description || data.order?.dispute_text_buyer || "No buyer explanation submitted."}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.16em] text-white/50 mb-2">Seller Response</p>
              <p className="text-sm text-[#f5f7fb]">{dispute.seller_description || data.order?.dispute_text_seller || "No seller response submitted yet."}</p>
            </div>
            <InfoCard label="Admin Notes" value={dispute.admin_resolution || data.order?.admin_notes || "No admin note yet"} />
            <InfoCard label="Outcome" value={formatLabel(dispute.financial_outcome || null)} />
          </div>

          <ImageGrid
            title="Buyer Dispute Uploads"
            images={(dispute.buyer_evidence_urls || []).map((url: string, index: number) => ({
              label: `Buyer evidence ${index + 1}`,
              url,
            }))}
          />
          <ImageGrid
            title="Seller Dispute Uploads"
            images={(dispute.seller_evidence_urls || []).map((url: string, index: number) => ({
              label: `Seller evidence ${index + 1}`,
              url,
            }))}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <InfoCard label="Paid" value={formatMoney(data.order?.seller_amount_paid_cents || 0)} />
            <InfoCard label="In Reserve" value={formatMoney(data.reserveSummary.heldCents || data.order?.seller_amount_held_in_reserve_cents || 0)} />
            <InfoCard label="Frozen" value={formatMoney(data.order?.seller_amount_frozen_cents || data.reserveSummary.frozenCents || 0)} />
            <InfoCard label="Consumed" value={formatMoney(data.reserveSummary.consumedCents || 0)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#f5f7fb]">Relay Balance Impact</p>
                <Badge tone={data.computed.withdrawalBlocked ? "red" : "green"}>
                  {data.computed.withdrawalBlocked ? "withdrawal blocked" : "withdrawal allowed"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InfoCard label="Pending Credit" value={formatMoney(data.computed.pendingCreditCents)} />
                <InfoCard label="Available Credit" value={formatMoney(data.computed.availableCreditCents)} />
                <InfoCard label="Balance Pending" value={formatMoney(data.computed.relayBalanceImpact.pendingBalanceCents)} />
                <InfoCard label="Balance Available" value={formatMoney(data.computed.relayBalanceImpact.availableBalanceCents)} />
                <InfoCard label="Available to Withdraw" value={formatMoney(data.computed.relayBalanceImpact.withdrawableBalanceCents)} />
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#f5f7fb]">Resolution Money Outcome</p>
                <Badge tone={data.computed.finalFinancialOutcome === "seller_paid" ? "green" : data.computed.finalFinancialOutcome === "buyer_refunded" ? "red" : "amber"}>
                  {formatLabel(data.computed.finalFinancialOutcome)}
                </Badge>
              </div>
              <p className="text-white/45 text-sm">
                Exposure is inactive in the launch payout model. These legacy hold values are shown only for dispute-history context.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <InfoCard label="Refund Amount" value={formatMoney(data.computed.refundAmountCents)} />
                <InfoCard label="Seller Debit" value={formatMoney(data.computed.sellerDebitAmountCents)} />
                <InfoCard label="Legacy Hold Status" value={formatLabel(data.computed.exposureStatus)} />
                <InfoCard label="Legacy Held" value={formatMoney(data.computed.currentExposureHoldCents)} />
                <InfoCard label="Legacy Released" value={formatMoney(data.computed.exposureReleasedCents)} />
                <InfoCard label="Legacy Consumed" value={formatMoney(data.computed.exposureConsumedCents)} />
              </div>
            </div>
          </div>

          {payouts.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-[#f5f7fb]">Payout Ledger</p>
              {payouts.map((payout: any) => (
                <div key={payout.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-[#f5f7fb]">{formatLabel(payout.payout_step)}</p>
                      <p className="text-xs text-white/45">{formatLabel(payout.status)} • {payout.paid_at ? new Date(payout.paid_at).toLocaleString() : "Not paid yet"}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-[#f5f7fb] font-semibold">{formatMoney(payout.net_paid_cents || 0)}</p>
                      <p className="text-white/45">Reserve {formatMoney((payout.reserve_withheld_cents || 0) + (payout.minimum_balance_top_up_cents || 0))}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.sellerViolations.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-[#f5f7fb]">Seller Violations</p>
              {data.sellerViolations.map((violation: any) => (
                <div key={violation.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge tone="red">{formatLabel(violation.violation_type)}</Badge>
                    <Badge tone="amber">{formatLabel(violation.severity)}</Badge>
                  </div>
                  <p className="text-sm text-[#f5f7fb]">{violation.notes || "No notes recorded."}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 sm:space-y-6">
          <div className="relay-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <HandCoins className="w-5 h-5 text-emerald-300" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Admin Actions</h2>
            </div>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
              className="relay-textarea"
              placeholder="Document the admin decision, evidence request, or enforcement reason."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-3">
              <button
                onClick={() => void submitAction("approve_buyer_claim", {}, "Buyer claim resolved in buyer's favor and refunded through Relay Balance flow.")}
                disabled={saving}
                className="relay-button-secondary inline-flex items-center justify-center gap-2 !bg-emerald-500/20 !text-emerald-300 !border-emerald-500/30"
              >
                <CheckCircle2 className="w-4 h-4" />
                Buyer Wins + Refund
              </button>
              <button
                onClick={() => void submitAction("deny_buyer_claim", {}, "Buyer claim denied and seller payout resumed.")}
                disabled={saving}
                className="relay-button-secondary inline-flex items-center justify-center gap-2 !bg-[#5f8fff]/20 !text-[#7ca6ff] !border-[#5f8fff]/30"
              >
                <Shield className="w-4 h-4" />
                Deny Buyer Claim
              </button>
              <button
                onClick={() => void submitAction("request_buyer_evidence", {}, "Requested more buyer evidence.")}
                disabled={saving}
                className="relay-button-secondary inline-flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Request Buyer Evidence
              </button>
              <button
                onClick={() => void submitAction("request_seller_evidence", {}, "Requested more seller evidence.")}
                disabled={saving}
                className="relay-button-secondary inline-flex items-center justify-center gap-2"
              >
                <Package className="w-4 h-4" />
                Request Seller Evidence
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-3">
              <button
                onClick={() => void submitAction("mark_tag_tampered", {}, "Marked dispute as tag tampering.")}
                disabled={saving}
                className="relay-button-secondary inline-flex items-center justify-center gap-2"
              >
                <Tag className="w-4 h-4" />
                Mark Tag Tampered
              </button>
              <button
                onClick={() => void submitAction("mark_authenticity_violation", {}, "Marked dispute as authenticity violation.")}
                disabled={saving}
                className="relay-button-secondary inline-flex items-center justify-center gap-2"
              >
                <ShieldAlert className="w-4 h-4" />
                Mark Authenticity Violation
              </button>
              <button
                onClick={() => void submitAction("mark_condition_violation", {}, "Marked dispute as condition issue.")}
                disabled={saving}
                className="relay-button-secondary inline-flex items-center justify-center gap-2"
              >
                <FileWarning className="w-4 h-4" />
                Mark Condition Violation
              </button>
              <button
                onClick={() => void submitAction("mark_wrong_item", {}, "Marked dispute as wrong item / SKU / size.")}
                disabled={saving}
                className="relay-button-secondary inline-flex items-center justify-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" />
                Mark Wrong Item
              </button>
              <button
                onClick={() => void submitAction("mark_shipping_carrier_issue", {}, "Marked dispute as shipping or carrier issue.")}
                disabled={saving}
                className="relay-button-secondary inline-flex items-center justify-center gap-2"
              >
                <Truck className="w-4 h-4" />
                Mark Shipping Issue
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => void submitAction("freeze_payout", {}, "Payout frozen.")}
                  disabled={saving}
                  className="relay-button-secondary inline-flex items-center justify-center gap-2"
                >
                  <Snowflake className="w-4 h-4" />
                  Freeze Payout
                </button>
              <button
                onClick={() => void submitAction("unfreeze_payout", {}, "Payout unfrozen.")}
                disabled={saving}
                className="relay-button-secondary inline-flex items-center justify-center gap-2"
              >
                <Unlock className="w-4 h-4" />
                Unfreeze Payout
              </button>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-sm font-medium text-[#f5f7fb]">Reserve / Refund</p>
              <input
                type="number"
                min={0}
                step="0.01"
                value={reserveAmount}
                onChange={(event) => setReserveAmount(event.target.value)}
                className="relay-input"
                placeholder="Reserve amount in USD"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() =>
                    void submitAction(
                      "consume_seller_reserve",
                      {
                        consumeAmountDollars: Number(reserveAmount || 0),
                      },
                      "Seller reserve consumed."
                    )
                  }
                  disabled={saving}
                  className="relay-button-secondary inline-flex items-center justify-center gap-2"
                >
                  <Archive className="w-4 h-4" />
                  Consume Seller Reserve
                </button>
                <button
                  onClick={() => void submitAction("issue_refund_now", {}, "Refund issued through the Relay Balance dispute flow.")}
                  disabled={saving}
                  className="relay-button-danger inline-flex items-center justify-center gap-2"
                >
                  <HandCoins className="w-4 h-4" />
                  Issue Refund Now
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-sm font-medium text-[#f5f7fb]">Seller Enforcement</p>
              <select
                value={targetTier}
                onChange={(event) => setTargetTier(event.target.value as "tier_1" | "tier_2" | "tier_3")}
                className="relay-input"
              >
                <option value="tier_1">Tier 1</option>
                <option value="tier_2">Tier 2</option>
                <option value="tier_3">Tier 3</option>
              </select>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => void submitAction("demote_seller", {}, "Seller demoted and locked to the selected tier.")}
                  disabled={saving}
                  className="relay-button-secondary inline-flex items-center justify-center gap-2"
                >
                  <Flag className="w-4 h-4" />
                  Demote Seller
                </button>
                <button
                  onClick={() => void submitAction("ban_seller", {}, "Seller banned.")}
                  disabled={saving}
                  className="relay-button-danger inline-flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" />
                  Ban Seller
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-sm font-medium text-[#f5f7fb]">Outcome / Closeout</p>
              <select
                value={manualOutcome}
                onChange={(event) => setManualOutcome(event.target.value)}
                className="relay-input"
              >
                <option value="carrier_issue_manual_handling">Carrier issue / manual handling</option>
                <option value="insufficient_evidence">Insufficient evidence</option>
                <option value="partial_resolution_manual_review">Partial resolution / manual review</option>
              </select>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => void submitAction("set_outcome", { outcome: manualOutcome }, "Manual dispute outcome saved and funds kept frozen for admin handling.")}
                  disabled={saving}
                  className="relay-button-secondary inline-flex items-center justify-center gap-2"
                >
                  <Clock className="w-4 h-4" />
                  Save Manual Outcome
                </button>
                <button
                  onClick={() => void submitAction("close_dispute", {}, "Dispute closed.")}
                  disabled={saving}
                  className="relay-button-secondary inline-flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Close Dispute
                </button>
              </div>
            </div>
          </div>

          <div className="relay-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#7ca6ff]" />
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Timeline / Event Log</h2>
            </div>

            {data.timeline.length === 0 ? (
              <p className="text-white/45">No audit events recorded for this order yet.</p>
            ) : (
              <div className="space-y-3">
                {data.timeline.map((event) => (
                  <div key={event.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge tone="blue">{formatLabel(event.event_type)}</Badge>
                      <Badge>{event.actor_role}</Badge>
                    </div>
                    <p className="text-xs text-white/45 mb-2">{new Date(event.created_at).toLocaleString()}</p>
                    {Object.keys(event.metadata || {}).length > 0 && (
                      <pre className="overflow-x-auto rounded-lg bg-black/20 p-3 text-xs text-white/60">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function sellerDisplayNameForUi(profile: any) {
  return profile?.display_name || profile?.full_name || profile?.username || profile?.email || "Unknown";
}
