"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, DollarSign, MessageSquare, Package, Plus, ShoppingCart, Star, TrendingUp, ExternalLink, FileSpreadsheet, Tag, Wallet, Banknote } from "lucide-react";
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import Link from "next/link";
import useAuth from "@/hooks/useAuth";
import type { RelayBalanceLedgerEntry, SellerTier, WithdrawalRequest } from "@/types";
import FoundingSellerBadge from "@/components/founding/FoundingSellerBadge";

interface ChartDataPoint {
  month: string;
  revenue: number;
  orders: number;
}

interface RecentOrder {
  id: string;
  shoe: string;
  price: number;
  buyer: string;
  date: string;
  status: string;
  statusColor: string;
}

interface RecentMessage {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  avatar: string;
  avatarUrl?: string | null;
}

interface SellerBalanceResponse {
  profile: {
    id: string;
    stripeAccountId: string | null;
    stripeConnected: boolean;
    sellerTier: SellerTier;
    isFoundingSeller?: boolean;
    displayName: string;
  };
  balances: {
    relayBalanceCents: number;
    pendingBalanceCents: number;
    availableBalanceCents: number;
    updatedAt: string | null;
  };
  withdrawalConfig: {
    transferFeeCents: number;
  };
  withdrawals: WithdrawalRequest[];
  activity: Array<
    RelayBalanceLedgerEntry & {
      order?: {
        id: string;
        status: string;
        listing?: {
          brand?: string | null;
          model?: string | null;
        } | null;
      } | null;
    }
  >;
}

interface DashboardResponse {
  metrics: {
    totalRevenue: number;
    activeListings: number;
    ordersThisMonth: number;
    sellerRating: number;
    totalSales: number;
    avgOrderValue: number;
    revenueTrend: { direction: "up" | "down"; value: string };
    listingsTrend: { direction: "up" | "down"; value: string };
    ordersTrend: { direction: "up" | "down"; value: string };
    ratingTrend: { direction: "up" | "down"; value: string };
    totalConversations: number;
  };
  chartData: ChartDataPoint[];
  recentOrders: Array<{
    id: string;
    shoe: string;
    price: number;
    buyer: string;
    date: string;
    status: string;
  }>;
  recentMessages: RecentMessage[];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatMoneyFromCents(cents: number) {
  return formatMoney((cents || 0) / 100);
}

function parseDollarInputToCents(value: string) {
  const normalized = value.replace(/[^0-9.]/g, "");
  const numericValue = Number(normalized);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return Math.round(numericValue * 100);
}

function clampNonNegativeCents(cents: number | null | undefined) {
  return Math.max(0, Number(cents || 0));
}

function formatRelativeTimestamp(value: string) {
  const timestamp = new Date(value);
  const diffMs = Date.now() - timestamp.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return timestamp.toLocaleDateString();
}

function getAdvancedSellerProgramMessage() {
  return "Advanced Seller Program coming soon";
}

function getAdvancedSellerProgramDetail() {
  return "Future benefits will include faster payout access, higher limits, and advanced seller tools.";
}

function getLedgerActivitySummary(
  entry: SellerBalanceResponse["activity"][number]
) {
  const absoluteAmountCents = clampNonNegativeCents(entry.amount_cents);
  const listingLabel =
    entry.order?.listing?.brand && entry.order?.listing?.model
      ? `${entry.order.listing.brand} ${entry.order.listing.model}`
      : entry.order?.id
        ? `Order ${entry.order.id.slice(0, 8)}`
        : "Relay Balance";

  switch (entry.type) {
    case "order_pending_credit":
      return {
        title: "Pending funds added",
        detail: `${listingLabel} is pending until the order is completed and funding requirements clear.`,
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "blue" as const,
      };
    case "order_available_credit":
      return {
        title: "Funds became available",
        detail: `${listingLabel} cleared and moved into available balance.`,
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "green" as const,
      };
    case "relay_balance_purchase_debit":
      return {
        title: "Relay Balance purchase",
        detail: `${listingLabel} was paid using your available Relay Balance.`,
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "amber" as const,
      };
    case "withdrawal_requested":
      return {
        title: "Withdrawal requested",
        detail: "Amount moved out of available balance while the transfer is processed.",
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "amber" as const,
      };
    case "withdrawal_completed":
      return {
        title: "Withdrawal completed",
        detail: "Transfer sent to your Stripe payout account.",
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "green" as const,
      };
    case "withdrawal_failed":
      return {
        title: "Withdrawal restored",
        detail: "Funds were returned to your Relay Balance after a failed or canceled transfer.",
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "red" as const,
      };
    case "exposure_hold_created":
      return {
        title: "Legacy balance hold",
        detail: `${listingLabel} has an older hold record from pre-launch payout rules.`,
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "amber" as const,
      };
    case "exposure_hold_released":
      return {
        title: "Legacy balance hold released",
        detail: `${listingLabel} had an older hold record cleared.`,
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "green" as const,
      };
    case "dispute_freeze":
      return {
        title: "Funds frozen for dispute",
        detail: `${listingLabel} entered dispute review.`,
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "red" as const,
      };
    case "dispute_debit":
      return {
        title: "Dispute debit applied",
        detail: "Seller funds were debited after dispute resolution.",
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "red" as const,
      };
    case "admin_adjustment":
      return {
        title: "Admin adjustment",
        detail: "Relay adjusted your balance manually.",
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "blue" as const,
      };
    default:
      return {
        title: "Balance activity",
        detail: listingLabel,
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "blue" as const,
      };
  }
}

function MetricCard({ icon: Icon, label, value, trend, trendValue }: any) {
  const isPositive = trend === "up";

  return (
    <div className="relay-card p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="p-1.5 sm:p-2 bg-white/5 rounded-lg">
              <Icon className="w-4 sm:w-5 h-4 sm:h-5 text-[#5f8fff]" />
            </div>
          </div>
          <p className="text-white/60 text-xs sm:text-sm mb-1">{label}</p>
          <p className="text-xl sm:text-2xl font-semibold text-[#f5f7fb]">{value}</p>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <div className={`flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg ${isPositive ? "bg-green-500/20" : "bg-red-500/20"}`}>
            {isPositive ? (
              <ArrowUpRight className="w-3 sm:w-4 h-3 sm:h-4 text-green-400" />
            ) : (
              <ArrowDownRight className="w-3 sm:w-4 h-3 sm:h-4 text-red-400" />
            )}
            <span className={`text-[10px] sm:text-xs font-semibold ${isPositive ? "text-green-400" : "text-red-400"}`}>
              {trendValue}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: any) {
  return (
    <div className="relay-card p-4 sm:p-6">
      <h3 className="text-base sm:text-lg font-semibold text-[#f5f7fb] mb-4 sm:mb-6">{title}</h3>
      <div className="h-52 sm:h-80">
        {children}
      </div>
    </div>
  );
}

function OrderRow({ order }: any) {
  return (
    <Link href={`/orders/${order.id}`}>
      <div className="flex items-center justify-between py-3 sm:py-4 px-3 sm:px-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer group">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <Package className="w-4 h-4 text-[#5f8fff] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[#f5f7fb] font-medium truncate text-sm sm:text-base">{order.shoe}</p>
              <div className="flex items-center gap-2 mt-0.5 sm:hidden">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${order.statusColor}`}>
                  {order.status}
                </span>
                <span className="text-white/40 text-xs">{formatRelativeTimestamp(order.date)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          <span className={`hidden sm:inline-flex px-3 py-1 rounded-full text-xs font-semibold ${order.statusColor}`}>
            {order.status}
          </span>
          <span className="text-[#f5f7fb] font-semibold text-sm sm:text-base">{"$"}{order.price.toFixed(0)}</span>
          <span className="hidden sm:inline text-white/40 text-sm w-20 text-right">{formatRelativeTimestamp(order.date)}</span>
          <ExternalLink className="hidden sm:block w-4 h-4 text-white/30 group-hover:text-[#5f8fff] transition-colors" />
        </div>
      </div>
    </Link>
  );
}

function MessageRow({ message }: any) {
  return (
    <Link href={`/messages/${message.id}`}>
      <div className="flex items-center gap-3 py-4 px-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer group">
        {message.avatarUrl ? (
          <img
            src={message.avatarUrl}
            alt={message.name}
            className="w-10 h-10 rounded-full object-cover border border-white/10 flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5f8fff] to-[#7ca6ff] flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
            {message.avatar}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[#f5f7fb] font-medium">{message.name}</p>
            <span className="text-white/40 text-xs flex-shrink-0">{formatRelativeTimestamp(message.time)}</span>
          </div>
          <p className="text-white/60 text-sm truncate">{message.lastMessage}</p>
        </div>
        <ExternalLink className="w-4 h-4 text-white/30 group-hover:text-[#5f8fff] transition-colors flex-shrink-0" />
      </div>
    </Link>
  );
}

function MobileStatTile({ icon: Icon, label, value, toneClass }: any) {
  return (
    <div className="rounded-[1.25rem] border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-white/38">
        <Icon className={`h-3.5 w-3.5 ${toneClass}`} />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 text-lg font-semibold leading-none text-[#f5f7fb]">{value}</p>
    </div>
  );
}

function MobileQuickAction({ href, icon: Icon, label, dot, onClick }: any) {
  const className =
    "relative flex min-h-[3.25rem] items-center justify-center gap-2 rounded-[1.15rem] border border-white/[0.06] bg-white/[0.04] px-3 text-sm font-medium text-white/78 transition-colors active:bg-white/[0.08]";

  const content = (
    <>
      <Icon className="h-4 w-4 text-[#d7e3ff]" />
      <span>{label}</span>
      {dot && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#5f8fff]" />}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={className} type="button">
      {content}
    </button>
  );
}

function MobileSummaryCard({
  href,
  icon: Icon,
  label,
  title,
  detail,
  badge,
  iconToneClass,
}: any) {
  const content = (
    <div className="h-full rounded-[1.4rem] border border-white/[0.06] bg-white/[0.04] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-2xl border border-white/10 bg-black/20 p-2 ${iconToneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        {badge && <span className="text-[10px] text-white/35">{badge}</span>}
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-tight text-[#f5f7fb]">{title}</p>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/45">{detail}</p>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export default function DashboardPage() {
  const { currentUser } = useAuth();
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [recentOrdersList, setRecentOrders] = useState<RecentOrder[]>([]);
  const [recentMessagesList, setRecentMessages] = useState<RecentMessage[]>([]);
  const [balanceData, setBalanceData] = useState<SellerBalanceResponse | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawFeedback, setWithdrawFeedback] = useState("");
  const withdrawSubmitLockRef = useRef(false);
  const withdrawalIdempotencyKeyRef = useRef<string | null>(null);
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    activeListings: 0,
    ordersThisMonth: 0,
    sellerRating: 0,
    totalSales: 0,
    avgOrderValue: 0,
    // Trends
    revenueTrend: { direction: "up" as "up" | "down", value: "0%" },
    listingsTrend: { direction: "up" as "up" | "down", value: "0" },
    ordersTrend: { direction: "up" as "up" | "down", value: "0%" },
    ratingTrend: { direction: "up" as "up" | "down", value: "0" },
    totalConversations: 0,
  });
  const [loading, setLoading] = useState(true);
  const transferFeeCents = balanceData?.withdrawalConfig.transferFeeCents || 25;
  const withdrawalAmountCents = parseDollarInputToCents(withdrawAmount);
  const netTransferAmountCents = Math.max(0, withdrawalAmountCents - transferFeeCents);
  const pendingBalanceCents = clampNonNegativeCents(
    balanceData?.balances.pendingBalanceCents
  );
  const availableBalanceCents = clampNonNegativeCents(
    balanceData?.balances.availableBalanceCents
  );
  const availableForWithdrawalCents = availableBalanceCents;
  const isFoundingSeller =
    Boolean(balanceData?.profile.isFoundingSeller) || Boolean(currentUser?.is_founding_seller);
  const totalBalanceCents = pendingBalanceCents + availableBalanceCents;
  const firstName =
    currentUser?.display_name?.split(" ")[0] ||
    currentUser?.full_name?.split(" ")[0] ||
    "Seller";
  const latestOrder = recentOrdersList[0];
  const latestMessage = recentMessagesList[0];
  const latestActivityEntry = balanceData?.activity?.[0];
  const latestActivitySummary = latestActivityEntry
    ? getLedgerActivitySummary(latestActivityEntry)
    : null;
  const latestWithdrawal = balanceData?.withdrawals?.[0];
  const stripeConnected = Boolean(balanceData?.profile.stripeConnected);
  const mobileStatusMessage = balanceLoading
    ? "Loading your store snapshot."
    : stripeConnected
      ? "Everything important in one clean view."
      : "Connect Stripe to unlock withdrawals.";

  async function loadBalanceData() {
    setBalanceLoading(true);
    setBalanceError("");

    try {
      const response = await fetch("/api/seller/balance", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load Relay Balance");
      }

      setBalanceData(payload);
    } catch (error) {
      setBalanceError(
        error instanceof Error ? error.message : "Failed to load Relay Balance"
      );
    } finally {
      setBalanceLoading(false);
    }
  }

  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== "seller") {
      setLoading(false);
      return;
    }

    async function fetchDashboardData() {
      try {
        const response = await fetch("/api/seller/dashboard", { cache: "no-store" });
        const payload: DashboardResponse | { error?: string } = await response.json();

        if (!response.ok) {
          throw new Error(
            payload && "error" in payload && payload.error
              ? payload.error
              : "Failed to load dashboard data"
          );
        }

        const dashboard = payload as DashboardResponse;

        setMetrics(dashboard.metrics);
        setChartData(
          dashboard.chartData.length > 0
            ? dashboard.chartData
            : [{ month: "No data", revenue: 0, orders: 0 }]
        );
        setRecentOrders(
          dashboard.recentOrders.map((order) => ({
            ...order,
            status: order.status.replace(/_/g, " "),
            statusColor:
              order.status === "delivered" || order.status === "completed"
                ? "bg-green-500/20 text-green-300"
                : order.status === "shipped"
                  ? "bg-blue-500/20 text-blue-300"
                  : "bg-yellow-500/20 text-yellow-300",
          }))
        );
        setRecentMessages(dashboard.recentMessages);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        setChartData([{ month: "No data", revenue: 0, orders: 0 }]);
        setRecentOrders([]);
        setRecentMessages([]);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== "seller") {
      setBalanceLoading(false);
      setBalanceData(null);
      return;
    }

    void loadBalanceData();
  }, [currentUser?.id, currentUser?.role]);

  async function handleWithdrawalSubmit() {
    if (!balanceData || withdrawSubmitLockRef.current) {
      return;
    }

    withdrawSubmitLockRef.current = true;
    setWithdrawSubmitting(true);
    setWithdrawFeedback("");
    let shouldResetIdempotencyKey = false;

    try {
      if (withdrawalAmountCents <= 0) {
        throw new Error("Enter a withdrawal amount greater than zero.");
      }

      if (withdrawalAmountCents > availableForWithdrawalCents) {
        throw new Error("Withdrawal amount exceeds your available balance.");
      }

      if (netTransferAmountCents <= 0) {
        throw new Error("Withdrawal amount must exceed the Stripe transfer fee.");
      }

      const idempotencyKey =
        withdrawalIdempotencyKeyRef.current ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `withdrawal-${Date.now()}`);
      withdrawalIdempotencyKeyRef.current = idempotencyKey;
      const response = await fetch("/api/seller/withdrawals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          amountCents: withdrawalAmountCents,
          idempotencyKey,
        }),
      });
      const payload = await response.json();
      shouldResetIdempotencyKey = true;

      if (!response.ok) {
        throw new Error(payload.error || "Failed to create withdrawal");
      }

      setWithdrawFeedback(
        payload.withdrawalRequest.review_required
          ? "Withdrawal requested. It is pending manual review before transfer."
          : "Withdrawal submitted successfully."
      );
      setWithdrawAmount("");
      setWithdrawOpen(false);
      await loadBalanceData();
    } catch (error) {
      setWithdrawFeedback(
        error instanceof Error ? error.message : "Failed to create withdrawal"
      );
    } finally {
      setWithdrawSubmitting(false);
      withdrawSubmitLockRef.current = false;
      if (shouldResetIdempotencyKey) {
        withdrawalIdempotencyKeyRef.current = null;
      }
    }
  }

  async function openStripeDashboard() {
    try {
      const response = await fetch("/api/stripe/dashboard", { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to open Stripe dashboard");
      }

      if (payload.url) {
        window.open(payload.url, "_blank");
      }
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Failed to open Stripe dashboard"
      );
    }
  }

  if (loading) {
    return (
      <div className="relay-empty text-center">Loading...</div>
    );
  }

  return (
    <>
      {/* Mobile Dashboard */}
      <div className="lg:hidden box-border h-full overflow-hidden px-4 pb-3 pt-3">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#0a0d14] shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(95,143,255,0.2),transparent_38%),radial-gradient(circle_at_85%_22%,rgba(16,185,129,0.14),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_40%)]" />
          <div className="relative flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/32">Seller HQ</p>
              <h1 className="mt-2 text-[1.75rem] font-semibold tracking-tight text-[#f5f7fb]">
                Hi, {firstName}
              </h1>
              <p className="mt-1 text-sm text-white/45">{mobileStatusMessage}</p>
            </div>
            <div className="shrink-0">
              {isFoundingSeller ? (
                <FoundingSellerBadge compact />
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-200/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  Live
                </div>
              )}
            </div>
          </div>

          <div className="relative px-5 pt-4">
            <div className="rounded-[1.7rem] border border-white/[0.08] bg-black/20 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8fb1ff]">
                    Relay Balance
                  </p>
                  <p className="mt-2 text-[2rem] font-semibold leading-none tracking-tight text-[#f5f7fb]">
                    {balanceLoading ? "..." : formatMoneyFromCents(totalBalanceCents)}
                  </p>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                    stripeConnected
                      ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200/85"
                      : "border border-amber-400/20 bg-amber-400/10 text-amber-100/85"
                  }`}
                >
                  {stripeConnected ? "Stripe ready" : "Setup payout"}
                </div>
              </div>

              {!balanceLoading && totalBalanceCents > 0 && (
                <div className="mt-4">
                  <div className="flex h-2 gap-1 overflow-hidden rounded-full bg-white/[0.05]">
                    {(() => {
                      const pendingPct = totalBalanceCents > 0 ? (pendingBalanceCents / totalBalanceCents) * 100 : 0;
                      const availablePct = totalBalanceCents > 0 ? (availableBalanceCents / totalBalanceCents) * 100 : 0;
                      return (
                        <>
                          {pendingPct >= 0.5 && (
                            <div
                              className="h-full rounded-full bg-[#5f8fff] transition-all"
                              style={{ width: `${Math.max(pendingPct, 4)}%` }}
                            />
                          )}
                          {availablePct >= 0.5 && (
                            <div
                              className="h-full rounded-full bg-emerald-400 transition-all"
                              style={{ width: `${Math.max(availablePct, 4)}%` }}
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Pending</p>
                  <p className="mt-1 text-sm font-semibold text-[#f5f7fb]">
                    {balanceLoading ? "..." : formatMoneyFromCents(pendingBalanceCents)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Available</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-300">
                    {balanceLoading ? "..." : formatMoneyFromCents(availableBalanceCents)}
                  </p>
                </div>
              </div>

              {(balanceError || withdrawFeedback) && (
                <div
                  className={`mt-3 rounded-2xl px-3 py-2 text-xs ${
                    balanceError
                      ? "border border-red-400/15 bg-red-400/10 text-red-200/85"
                      : "border border-[#5f8fff]/15 bg-[#5f8fff]/10 text-[#dce7ff]"
                  }`}
                >
                  {balanceError || withdrawFeedback}
                </div>
              )}
            </div>
          </div>

          <div className="relative grid grid-cols-4 gap-2 px-5 pt-3">
            <MobileStatTile
              icon={DollarSign}
              label="Revenue"
              value={`$${metrics.totalRevenue.toFixed(0)}`}
              toneClass="text-emerald-300"
            />
            <MobileStatTile
              icon={Package}
              label="Listings"
              value={metrics.activeListings}
              toneClass="text-[#8fb1ff]"
            />
            <MobileStatTile
              icon={ShoppingCart}
              label="Orders"
              value={metrics.ordersThisMonth}
              toneClass="text-amber-300"
            />
            <MobileStatTile
              icon={Star}
              label="Rating"
              value={metrics.sellerRating > 0 ? metrics.sellerRating.toFixed(1) : "--"}
              toneClass="text-fuchsia-300"
            />
          </div>

          <div className="relative grid grid-cols-3 gap-2 px-5 pt-3">
            <MobileQuickAction href="/sell" icon={Plus} label="Sell" />
            <MobileQuickAction
              href="/orders"
              icon={Package}
              label="Orders"
              dot={recentOrdersList.length > 0}
            />
            <MobileQuickAction
              onClick={() =>
                stripeConnected && availableForWithdrawalCents > 0
                  ? setWithdrawOpen((open) => !open)
                  : void openStripeDashboard()
              }
              icon={
                withdrawOpen
                  ? X
                  : stripeConnected && availableForWithdrawalCents > 0
                    ? Banknote
                    : ExternalLink
              }
              label={
                withdrawOpen
                  ? "Close"
                  : stripeConnected && availableForWithdrawalCents > 0
                    ? "Withdraw"
                    : "Stripe"
              }
            />
          </div>

          <div className="relative flex-1 min-h-0 px-5 py-3">
            {withdrawOpen ? (
              <div className="flex h-full min-h-0 flex-col rounded-[1.6rem] border border-white/[0.06] bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Withdraw</p>
                    <p className="mt-1 text-lg font-semibold text-[#f5f7fb]">Move funds to Stripe</p>
                  </div>
                  <span className="text-xs text-white/35">
                    Fee {formatMoneyFromCents(transferFeeCents)}
                  </span>
                </div>

                {!stripeConnected && (
                  <div className="mt-3 rounded-2xl border border-amber-400/15 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-100/85">
                    Connect Stripe in Settings before requesting a withdrawal.
                  </div>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-black/20 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Amount</p>
                    <p className="mt-1 text-sm font-semibold text-[#f5f7fb]">
                      {formatMoneyFromCents(withdrawalAmountCents)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-black/20 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Fee</p>
                    <p className="mt-1 text-sm font-semibold text-white/70">
                      {formatMoneyFromCents(transferFeeCents)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-black/20 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Receive</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-300">
                      {formatMoneyFromCents(netTransferAmountCents)}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="mobile-withdraw-amount" className="text-xs text-white/50">
                    Withdrawal amount
                  </label>
                  <input
                    id="mobile-withdraw-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={withdrawAmount}
                    onChange={(event) => setWithdrawAmount(event.target.value)}
                    placeholder="0.00"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[#f5f7fb] outline-none transition-colors focus:border-[#5f8fff]"
                  />
                  <p className="mt-2 text-xs text-white/35">
                    Max {formatMoneyFromCents(availableForWithdrawalCents)}.
                  </p>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => void handleWithdrawalSubmit()}
                    disabled={
                      withdrawSubmitting ||
                      !stripeConnected ||
                      withdrawalAmountCents <= 0 ||
                      withdrawalAmountCents > availableForWithdrawalCents ||
                      netTransferAmountCents <= 0
                    }
                    className="relay-button-primary min-h-[3rem] flex-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {withdrawSubmitting ? "Processing..." : "Confirm"}
                  </button>
                  <button
                    onClick={() => setWithdrawOpen(false)}
                    className="relay-button-secondary min-h-[3rem] px-4"
                  >
                    Cancel
                  </button>
                </div>

                <div className="mt-4 min-h-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">
                      Recent transfers
                    </p>
                    <button
                      onClick={() => void openStripeDashboard()}
                      className="text-xs text-[#8fb1ff]"
                      type="button"
                    >
                      Stripe
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {!balanceLoading && (balanceData?.withdrawals || []).length > 0 ? (
                      balanceData?.withdrawals.slice(0, 3).map((withdrawal) => (
                        <div
                          key={withdrawal.id}
                          className="flex items-center justify-between rounded-2xl bg-black/20 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#f5f7fb]">
                              {formatMoneyFromCents(clampNonNegativeCents(withdrawal.amount_cents))}
                            </p>
                            <p className="text-xs capitalize text-white/40">
                              {withdrawal.status.replace(/_/g, " ")}
                            </p>
                          </div>
                          <span className="text-xs text-white/30">
                            {formatRelativeTimestamp(withdrawal.created_at)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="flex h-[5.5rem] items-center justify-center rounded-2xl bg-black/20 text-sm text-white/30">
                        No transfers yet
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid h-full min-h-0 grid-cols-2 gap-3">
                <MobileSummaryCard
                  href="/orders"
                  icon={Package}
                  label="Latest order"
                  title={latestOrder ? latestOrder.shoe : "No orders yet"}
                  detail={
                    latestOrder
                      ? `${formatMoney(latestOrder.price)} - ${latestOrder.status}`
                      : "Your next sale will show up here."
                  }
                  badge={latestOrder ? formatRelativeTimestamp(latestOrder.date) : undefined}
                  iconToneClass="text-amber-300"
                />
                <MobileSummaryCard
                  href="/messages"
                  icon={MessageSquare}
                  label="Inbox"
                  title={latestMessage ? latestMessage.name : "No new messages"}
                  detail={
                    latestMessage
                      ? latestMessage.lastMessage
                      : "Customer messages and offers will land here."
                  }
                  badge={latestMessage ? formatRelativeTimestamp(latestMessage.time) : undefined}
                  iconToneClass="text-[#8fb1ff]"
                />

                <div className="col-span-2 flex min-h-0 flex-col rounded-[1.6rem] border border-white/[0.06] bg-white/[0.04] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                        Live Pulse
                      </p>
                      <p className="mt-1 text-base font-semibold text-[#f5f7fb]">
                        {latestActivitySummary ? latestActivitySummary.title : "Everything looks calm"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-white/30">
                      {balanceData?.balances.updatedAt
                        ? formatRelativeTimestamp(balanceData.balances.updatedAt)
                        : "Waiting"}
                    </span>
                  </div>

                  <div className="mt-3 grid flex-1 min-h-0 grid-cols-[1.12fr_0.88fr] gap-3">
                    <div className="flex min-h-0 flex-col justify-between rounded-[1.35rem] bg-black/20 px-3.5 py-3">
                      <div>
                        <p className="text-sm leading-6 text-white/70">
                          {latestActivitySummary
                            ? latestActivitySummary.detail
                            : "Orders, payouts, and balance updates will surface here as your store picks up pace."}
                        </p>
                      </div>

                      <div className="mt-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                          Latest transfer
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#f5f7fb]">
                          {latestWithdrawal
                            ? formatMoneyFromCents(clampNonNegativeCents(latestWithdrawal.amount_cents))
                            : stripeConnected
                              ? "None yet"
                              : "Stripe needed"}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="truncate text-xs capitalize text-white/40">
                            {latestWithdrawal
                              ? latestWithdrawal.status.replace(/_/g, " ")
                              : stripeConnected
                                ? "Ready when you are"
                                : "Connect in Settings"}
                          </p>
                          <button
                            onClick={() => void openStripeDashboard()}
                            className="shrink-0 text-xs text-[#8fb1ff]"
                            type="button"
                          >
                            Stripe
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.35rem] bg-black/20 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Trend</p>
                      <div className="mt-3 h-[5.75rem]">
                        {chartData.length > 0 && chartData[0].month !== "No data" ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                              <defs>
                                <linearGradient id="mobileRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#5f8fff" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="#5f8fff" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <Area
                                type="monotone"
                                dataKey="revenue"
                                fill="url(#mobileRevenueGradient)"
                                stroke="#7ca6ff"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-white/22">
                            No trend yet
                          </div>
                        )}
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/35">Conversations</span>
                          <span className="font-medium text-white/75">{metrics.totalConversations}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/35">Avg order</span>
                          <span className="font-medium text-white/75">
                            {formatMoney(metrics.avgOrderValue)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Dashboard (unchanged) */}
      <div className="hidden lg:block space-y-8 pb-12">
        {/* Header */}
        <div className="space-y-6">
          <div>
            <p className="relay-eyebrow text-[#5f8fff] mb-2">SELLER HQ</p>
            <h1 className="text-4xl font-bold text-[#f5f7fb]">Dashboard</h1>
          </div>

          {/* Quick Actions - horizontal scroll on mobile, wrap on desktop */}
          <div className="flex gap-2 sm:gap-3 sm:flex-wrap overflow-x-auto pb-2 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <Link href="/sell" className="flex-shrink-0">
              <button className="relay-button-primary text-sm sm:text-base whitespace-nowrap">Create Listing</button>
            </Link>
            <Link href={`/profile/${currentUser?.username}`} className="flex-shrink-0">
              <button className="relay-button-secondary text-sm sm:text-base whitespace-nowrap">View Profile</button>
            </Link>
            <button
              onClick={() => void openStripeDashboard()}
              className="relay-button-secondary flex items-center gap-2 text-sm sm:text-base whitespace-nowrap flex-shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
              Stripe
            </button>
            <Link href="/inventory/bulk-import" className="flex-shrink-0">
              <button className="relay-button-secondary flex items-center gap-2 text-sm sm:text-base whitespace-nowrap">
                <FileSpreadsheet className="w-4 h-4" />
                Import
              </button>
            </Link>
            <Link href="/tags" className="flex-shrink-0">
              <button className="relay-button-secondary flex items-center gap-2 text-sm sm:text-base whitespace-nowrap">
                <Tag className="w-4 h-4" />
                Tags
              </button>
            </Link>
          </div>
        </div>

        {currentUser?.role === "seller" && (
        <div className="space-y-5">
          {/* Hero Balance Display */}
          <div className="relay-card relative overflow-hidden">
            {/* Subtle gradient background accent */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#5f8fff]/[0.08] via-transparent to-emerald-500/[0.04] pointer-events-none" />
            <div className="absolute top-0 right-0 w-80 h-80 bg-[#5f8fff]/[0.04] rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/[0.03] rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none" />

            <div className="relative p-6 sm:p-8">
              {/* Top row: label + actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-xl bg-[#5f8fff]/15 border border-[#5f8fff]/20">
                    <Wallet className="w-5 h-5 text-[#7ca6ff]" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#7ca6ff] font-semibold">Relay Balance</p>
                  </div>
                  {isFoundingSeller && <FoundingSellerBadge compact />}
                </div>
                <div className="flex items-center gap-3">
                  {balanceData?.profile.stripeConnected ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Stripe connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-400/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Stripe not connected
                    </span>
                  )}
                  <button
                    onClick={() => setWithdrawOpen((open) => !open)}
                    disabled={!balanceData?.profile.stripeConnected || availableForWithdrawalCents <= 0}
                    className="relay-button-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    <Banknote className="w-4 h-4" />
                    Withdraw
                  </button>
                </div>
              </div>

              {/* Large total balance */}
              <div className="mb-6 text-center sm:text-left">
                <p className="text-3xl sm:text-5xl font-bold text-[#f5f7fb] tracking-tight">
                  {balanceLoading ? "..." : formatMoneyFromCents(pendingBalanceCents + availableBalanceCents)}
                </p>
                <p className="text-white/40 text-xs sm:text-sm mt-2">Total balance across all states</p>
              </div>

              {/* Composition bar */}
              {!balanceLoading && (pendingBalanceCents + availableBalanceCents) > 0 && (
                <div className="mb-6">
                  <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-white/[0.04]">
                    {(() => {
                      const total = pendingBalanceCents + availableBalanceCents;
                      const pendingPct = total > 0 ? (pendingBalanceCents / total) * 100 : 0;
                      const availablePct = total > 0 ? (availableBalanceCents / total) * 100 : 0;
                      return (
                        <>
                          {pendingPct >= 0.5 && (
                            <div
                              className="h-full rounded-full bg-[#5f8fff] transition-all"
                              style={{ width: `${Math.max(pendingPct, 4)}%` }}
                              title={`Pending: ${formatMoneyFromCents(pendingBalanceCents)} (${pendingPct.toFixed(1)}%)`}
                            />
                          )}
                          {availablePct >= 0.5 && (
                            <div
                              className="h-full rounded-full bg-emerald-400 transition-all"
                              style={{ width: `${Math.max(availablePct, 4)}%` }}
                              title={`Available: ${formatMoneyFromCents(availableBalanceCents)} (${availablePct.toFixed(1)}%)`}
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-6 mt-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#5f8fff]" />
                      <span className="text-xs text-white/50">Pending</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span className="text-xs text-white/50">Available</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Pending / Available cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] px-5 py-4">
                  <p className="text-white/45 text-xs uppercase tracking-[0.16em] mb-2">
                    Pending
                  </p>
                  <p className="text-2xl font-bold text-[#f5f7fb] tracking-tight">
                    {balanceLoading ? "..." : formatMoneyFromCents(pendingBalanceCents)}
                  </p>
                  <p className="text-white/45 text-xs mt-2">
                    Clears after order completion and settlement
                  </p>
                </div>
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] px-5 py-4">
                  <p className="text-white/45 text-xs uppercase tracking-[0.16em] mb-2">
                    Available
                  </p>
                  <p className="text-2xl font-bold text-emerald-300 tracking-tight">
                    {balanceLoading ? "..." : formatMoneyFromCents(availableBalanceCents)}
                  </p>
                  <p className="text-white/45 text-xs mt-2">
                    Ready to withdraw or use on Relay
                  </p>
                </div>
              </div>

              {/* Info banners */}
              <div className="mt-5 grid grid-cols-1 gap-3">
                {isFoundingSeller && (
                  <div className="rounded-xl bg-amber-500/[0.08] border border-amber-500/20 px-4 py-3">
                    <p className="text-amber-200 text-sm font-medium">Founding Seller Benefits</p>
                    <p className="text-amber-100/70 text-xs mt-2">
                      Free monthly tag shipments, direct support access, API onboarding assistance, early feature access, priority visibility, and Founding Seller badge across Relay.
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-[#5f8fff]/[0.07] border border-[#5f8fff]/15 px-4 py-3">
                  <p className="text-[#dce7ff] text-sm font-medium">{getAdvancedSellerProgramMessage()}</p>
                  <p className="text-[#b8ccff] text-sm mt-1">{getAdvancedSellerProgramDetail()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Error / feedback banners */}
          {balanceError && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
              {balanceError}
            </div>
          )}
          {withdrawFeedback && (
            <div className="rounded-2xl border border-[#5f8fff]/20 bg-[#5f8fff]/10 p-4 text-[#dce7ff]">
              {withdrawFeedback}
            </div>
          )}

          {/* Withdrawal panel + Activity feed */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)] gap-5">
            {/* Withdraw to Stripe */}
            <div className="relay-card p-5 space-y-5">
              <div className="flex items-center gap-2.5">
                <Banknote className="w-5 h-5 text-emerald-300" />
                <h3 className="text-lg font-semibold text-[#f5f7fb]">Withdraw to Stripe</h3>
              </div>

              {!balanceData?.profile.stripeConnected && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-200 text-sm">
                  Connect Stripe in Settings before requesting a withdrawal.
                </div>
              )}

              {/* Fee calculator */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Amount</span>
                  <span className="text-[#f5f7fb] font-medium">{formatMoneyFromCents(withdrawalAmountCents)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Transfer fee</span>
                  <span className="text-white/60">{formatMoneyFromCents(transferFeeCents)}</span>
                </div>
                <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-sm">
                  <span className="text-white/70 font-medium">You receive</span>
                  <span className="text-emerald-300 font-semibold text-base">{formatMoneyFromCents(netTransferAmountCents)}</span>
                </div>
              </div>

              {withdrawOpen ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="withdraw-amount" className="text-sm text-white/60">
                      Withdrawal amount
                    </label>
                    <input
                      id="withdraw-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={withdrawAmount}
                      onChange={(event) => setWithdrawAmount(event.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[#f5f7fb] outline-none transition-colors focus:border-[#5f8fff]"
                    />
                    <p className="text-xs text-white/35">
                      Max {formatMoneyFromCents(availableForWithdrawalCents)}.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => void handleWithdrawalSubmit()}
                      disabled={
                        withdrawSubmitting ||
                        !balanceData?.profile.stripeConnected ||
                        withdrawalAmountCents <= 0 ||
                        withdrawalAmountCents > availableForWithdrawalCents ||
                        netTransferAmountCents <= 0
                      }
                      className="relay-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {withdrawSubmitting ? "Processing..." : "Confirm Withdrawal"}
                    </button>
                    <button
                      onClick={() => setWithdrawOpen(false)}
                      className="relay-button-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setWithdrawOpen(true)}
                  disabled={!balanceData?.profile.stripeConnected || availableForWithdrawalCents <= 0}
                  className="w-full relay-button-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  Start Withdrawal
                </button>
              )}

              {/* Recent withdrawals */}
              {!balanceLoading && (balanceData?.withdrawals || []).length > 0 && (
                <div className="pt-4 border-t border-white/[0.06]">
                  <p className="text-white/45 text-xs uppercase tracking-[0.14em] font-medium mb-3">Recent transfers</p>
                  <div className="space-y-2">
                    {balanceData?.withdrawals.slice(0, 3).map((withdrawal) => {
                      const netAmountCents = Math.max(
                        0,
                        clampNonNegativeCents(withdrawal.amount_cents) -
                          clampNonNegativeCents(withdrawal.stripe_transfer_fee_cents || transferFeeCents)
                      );
                      const statusColor =
                        withdrawal.status === "completed"
                          ? "text-emerald-400"
                          : withdrawal.status === "failed" || withdrawal.status === "canceled"
                            ? "text-red-400"
                            : "text-amber-400";

                      return (
                        <div
                          key={withdrawal.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] px-3.5 py-2.5"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`text-xs font-semibold capitalize ${statusColor}`}>
                              {withdrawal.status.replace(/_/g, " ")}
                            </span>
                            <span className="text-white/25">|</span>
                            <span className="text-[#f5f7fb] text-sm font-medium">
                              {formatMoneyFromCents(clampNonNegativeCents(withdrawal.amount_cents))}
                            </span>
                          </div>
                          <span className="text-white/30 text-xs">
                            {formatRelativeTimestamp(withdrawal.created_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Activity timeline */}
            <div className="relay-card p-5">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h3 className="text-lg font-semibold text-[#f5f7fb]">Activity</h3>
                {balanceData?.balances.updatedAt && (
                  <span className="text-xs text-white/30">
                    {formatRelativeTimestamp(balanceData.balances.updatedAt)}
                  </span>
                )}
              </div>

              {balanceLoading ? (
                <div className="text-white/40 text-sm">Loading...</div>
              ) : (balanceData?.activity || []).length === 0 ? (
                <div className="text-center py-10">
                  <div className="p-3 rounded-2xl bg-white/[0.03] inline-block mb-3">
                    <TrendingUp className="w-6 h-6 text-white/20" />
                  </div>
                  <p className="text-white/35 text-sm">No balance activity yet</p>
                  <p className="text-white/25 text-xs mt-1">Activity will appear here as orders come in</p>
                </div>
              ) : (
                <div className="relative max-h-[400px] overflow-y-auto pr-1">
                  {/* Timeline line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/[0.06]" />

                  <div className="space-y-0.5">
                    {(balanceData?.activity || []).map((entry) => {
                      const summary = getLedgerActivitySummary(entry);
                      const dotColor =
                        summary.tone === "green"
                          ? "bg-emerald-400"
                          : summary.tone === "amber"
                            ? "bg-amber-400"
                            : summary.tone === "red"
                              ? "bg-red-400"
                              : "bg-[#5f8fff]";

                      return (
                        <div
                          key={entry.id}
                          className="relative flex gap-4 py-3 pl-6"
                        >
                          {/* Timeline dot */}
                          <div className={`absolute left-[4px] top-[18px] w-[7px] h-[7px] rounded-full ${dotColor} ring-2 ring-[#06070a]`} />

                          <div className="flex-1 min-w-0 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-[#f5f7fb] text-sm font-medium">{summary.title}</p>
                              <p className="text-white/40 text-xs mt-0.5">{summary.detail}</p>
                            </div>
                            <div className="flex items-center gap-2.5 flex-shrink-0">
                              <span className="text-[#f5f7fb] text-sm font-semibold">{summary.amountLabel}</span>
                              <span className="text-white/25 text-xs">{formatRelativeTimestamp(entry.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Top Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            icon={DollarSign}
            label="Total Revenue"
            value={`$${metrics.totalRevenue.toFixed(0)}`}
            trend={metrics.revenueTrend.direction}
            trendValue={metrics.revenueTrend.value}
          />
          <MetricCard
            icon={Package}
            label="Active Listings"
            value={metrics.activeListings}
            trend={metrics.listingsTrend.direction}
            trendValue={metrics.listingsTrend.value}
          />
          <MetricCard
            icon={ShoppingCart}
            label="Orders This Month"
            value={metrics.ordersThisMonth}
            trend={metrics.ordersTrend.direction}
            trendValue={metrics.ordersTrend.value}
          />
          <MetricCard
            icon={Star}
            label="Seller Rating"
            value={metrics.sellerRating > 0 ? metrics.sellerRating.toFixed(1) : "N/A"}
            trend={metrics.ratingTrend.direction}
            trendValue={metrics.ratingTrend.value}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Revenue Trend">
            {chartData.length > 0 && chartData[0].month !== "No data" ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <defs>
                    <linearGradient
                      id="revenueGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#5f8fff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#5f8fff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="month"
                    stroke="rgba(255,255,255,0.45)"
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.45)"
                    style={{ fontSize: "12px" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(6, 7, 10, 0.8)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#f5f7fb" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#5f8fff"
                    strokeWidth={3}
                    dot={{ fill: "#5f8fff", r: 4 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-relay-subtle">
                No data yet
              </div>
            )}
          </ChartCard>

          <ChartCard title="Orders Volume">
            {chartData.length > 0 && chartData[0].month !== "No data" ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="month"
                    stroke="rgba(255,255,255,0.45)"
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.45)"
                    style={{ fontSize: "12px" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(6, 7, 10, 0.8)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#f5f7fb" }}
                  />
                  <Bar dataKey="orders" fill="#5f8fff" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-relay-subtle">
                No data yet
              </div>
            )}
          </ChartCard>
        </div>

        {/* Recent Orders and Messages */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Recent Orders */}
          <div className="relay-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-semibold text-[#f5f7fb] flex items-center gap-2">
                <ShoppingCart className="w-4 sm:w-5 h-4 sm:h-5 text-[#5f8fff]" />
                Recent Orders
              </h3>
              <Link href="/orders">
                <span className="text-[#5f8fff] hover:text-[#7ca6ff] text-sm font-medium cursor-pointer transition-colors">
                  View All
                </span>
              </Link>
            </div>
            {recentOrdersList.length > 0 ? (
              <div className="space-y-0 divide-y divide-white/5">
                {recentOrdersList.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </div>
            ) : (
              <div className="relay-empty text-center py-8">
                <p>No orders yet</p>
              </div>
            )}
          </div>

          {/* Recent Messages */}
          <div className="relay-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-semibold text-[#f5f7fb] flex items-center gap-2">
                <MessageSquare className="w-4 sm:w-5 h-4 sm:h-5 text-[#5f8fff]" />
                Recent Messages
              </h3>
              <Link href="/messages">
                <span className="text-[#5f8fff] hover:text-[#7ca6ff] text-sm font-medium cursor-pointer transition-colors">
                  View All
                </span>
              </Link>
            </div>
            {recentMessagesList.length > 0 ? (
              <div className="space-y-0 divide-y divide-white/5">
                {recentMessagesList.map((message) => (
                  <MessageRow key={message.id} message={message} />
                ))}
              </div>
            ) : (
              <div className="relay-empty text-center py-8">
                <p>No messages yet</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
