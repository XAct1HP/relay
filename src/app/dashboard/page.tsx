"use client";

import { useState, useEffect } from "react";
import { ArrowDownRight, ArrowUpRight, DollarSign, MessageSquare, Package, ShoppingCart, Star, TrendingUp, ExternalLink, FileSpreadsheet, Tag, Wallet, Banknote } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";
import type { RelayBalanceLedgerEntry, SellerTier, WithdrawalRequest } from "@/types";

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
}

interface SellerBalanceResponse {
  profile: {
    id: string;
    stripeAccountId: string | null;
    stripeConnected: boolean;
    sellerTier: SellerTier;
    displayName: string;
  };
  balances: {
    relayBalanceCents: number;
    pendingBalanceCents: number;
    availableBalanceCents: number;
    currentExposureCents: number;
    withdrawableBalanceCents: number;
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

function getTierAvailabilityMessage(sellerTier: SellerTier) {
  if (sellerTier === "tier_2") {
    return "Funds become available on delivery. Recent delivered orders may temporarily reduce your withdrawable balance during the buyer review window.";
  }

  if (sellerTier === "tier_3") {
    return "50% becomes available when the carrier accepts the package. The remaining 50% becomes available on delivery.";
  }

  return "Funds become available after buyer confirmation or after the 48-hour review window.";
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
        detail: `${listingLabel} is pending until order requirements clear.`,
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
    case "withdrawal_requested":
      return {
        title: "Withdrawal requested",
        detail: "Amount moved out of withdrawable balance while the transfer is processed.",
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
        title: "Exposure updated",
        detail: `${listingLabel} is still inside the buyer review window.`,
        amountLabel: formatMoneyFromCents(absoluteAmountCents),
        tone: "amber" as const,
      };
    case "exposure_hold_released":
      return {
        title: "Exposure released",
        detail: `${listingLabel} is no longer reducing your withdrawable balance.`,
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
    <div className="relay-card p-6">
      <h3 className="text-lg font-semibold text-[#f5f7fb] mb-6">{title}</h3>
      <div className="h-80">
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
                <span className="text-white/40 text-xs">{order.date}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          <span className={`hidden sm:inline-flex px-3 py-1 rounded-full text-xs font-semibold ${order.statusColor}`}>
            {order.status}
          </span>
          <span className="text-[#f5f7fb] font-semibold text-sm sm:text-base">{"$"}{order.price.toFixed(0)}</span>
          <span className="hidden sm:inline text-white/40 text-sm w-20 text-right">{order.date}</span>
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
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5f8fff] to-[#7ca6ff] flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
          {message.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[#f5f7fb] font-medium">{message.name}</p>
            <span className="text-white/40 text-xs flex-shrink-0">{message.time}</span>
          </div>
          <p className="text-white/60 text-sm truncate">{message.lastMessage}</p>
        </div>
        <ExternalLink className="w-4 h-4 text-white/30 group-hover:text-[#5f8fff] transition-colors flex-shrink-0" />
      </div>
    </Link>
  );
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
  const relayBalanceCents = clampNonNegativeCents(
    balanceData?.balances.relayBalanceCents
  );
  const pendingBalanceCents = clampNonNegativeCents(
    balanceData?.balances.pendingBalanceCents
  );
  const availableBalanceCents = clampNonNegativeCents(
    balanceData?.balances.availableBalanceCents
  );
  const currentExposureCents = clampNonNegativeCents(
    balanceData?.balances.currentExposureCents
  );
  const withdrawableBalanceCents = clampNonNegativeCents(
    balanceData?.balances.withdrawableBalanceCents
  );
  const sellerTier =
    balanceData?.profile.sellerTier || currentUser?.seller_tier || "tier_1";

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
    if (!currentUser?.id) {
      setLoading(false);
      return;
    }

    const userId = currentUser!.id;
    async function fetchDashboardData() {
      const supabase = createClient();

      try {
        // Fetch all orders for this seller
        const { data: orders } = await supabase
          .from("orders")
          .select("*, listing:listings(brand, model), buyer:profiles(full_name)")
          .eq("seller_id", userId)
          .order("created_at", { ascending: false });

        // Fetch active listings count
        const { data: listings } = await supabase
          .from("listings")
          .select("id")
          .eq("seller_id", userId)
          .eq("status", "active");

        // Fetch recent conversations
        const { data: conversations } = await supabase
          .from("conversations")
          .select("*, messages(*, sender:profiles(full_name))")
          .contains("participant_ids", [userId])
          .order("last_message_at", { ascending: false })
          .limit(5);

        // Fetch seller's average rating from reviews
        const { data: reviews } = await supabase
          .from("reviews")
          .select("rating")
          .eq("seller_id", userId);

        const avgRating = reviews && reviews.length > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

        // Process orders for metrics
        if (orders && orders.length > 0) {
          const completed = orders.filter((o) => o.status === "completed");
          const now = new Date();
          const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

          const thisMonth = orders.filter((o) => new Date(o.created_at) >= thisMonthStart);
          const lastMonth = orders.filter((o) => {
            const d = new Date(o.created_at);
            return d >= lastMonthStart && d <= lastMonthEnd;
          });

          const totalRev = completed.reduce(
            (sum, o) => sum + (o.seller_earnings || 0),
            0
          );
          const avgVal =
            completed.length > 0 ? totalRev / completed.length : 0;

          // Revenue trend (this month earnings vs last month)
          const thisMonthRev = completed
            .filter((o) => new Date(o.created_at) >= thisMonthStart)
            .reduce((sum, o) => sum + (o.seller_earnings || 0), 0);
          const lastMonthRev = completed
            .filter((o) => { const d = new Date(o.created_at); return d >= lastMonthStart && d <= lastMonthEnd; })
            .reduce((sum, o) => sum + (o.seller_earnings || 0), 0);
          const revPct = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev * 100).toFixed(1) : "0";

          // Orders trend
          const ordersPct = lastMonth.length > 0
            ? ((thisMonth.length - lastMonth.length) / lastMonth.length * 100).toFixed(0)
            : "0";

          // Listings trend: new listings this month
          const { count: newListingsThisMonth } = await supabase
            .from("listings")
            .select("*", { count: "exact", head: true })
            .eq("seller_id", userId)
            .eq("status", "active")
            .gte("created_at", thisMonthStart.toISOString());

          setMetrics({
            totalRevenue: totalRev,
            activeListings: listings?.length || 0,
            ordersThisMonth: thisMonth.length,
            sellerRating: Math.round(avgRating * 10) / 10,
            totalSales: completed.length,
            avgOrderValue: avgVal,
            revenueTrend: {
              direction: Number(revPct) >= 0 ? "up" : "down",
              value: `${Number(revPct) >= 0 ? "+" : ""}${revPct}%`,
            },
            listingsTrend: {
              direction: "up",
              value: `+${newListingsThisMonth || 0}`,
            },
            ordersTrend: {
              direction: Number(ordersPct) >= 0 ? "up" : "down",
              value: `${Number(ordersPct) >= 0 ? "+" : ""}${ordersPct}%`,
            },
            ratingTrend: {
              direction: "up",
              value: reviews?.length ? `${reviews.length} reviews` : "No reviews",
            },
            totalConversations: conversations?.length || 0,
          });

          // Process recent orders
          const formatted: RecentOrder[] = orders
            .slice(0, 5)
            .map((order) => ({
              id: order.id,
              shoe: order.listing
                ? `${order.listing.brand} ${order.listing.model}`
                : "Unknown Shoe",
              price: order.price,
              buyer: order.buyer?.full_name || "Unknown",
              date: new Date(order.created_at).toLocaleDateString(),
              status: order.status.replace(/_/g, " "),
              statusColor:
                order.status === "delivered" || order.status === "completed"
                  ? "bg-green-500/20 text-green-300"
                  : order.status === "shipped"
                  ? "bg-blue-500/20 text-blue-300"
                  : "bg-yellow-500/20 text-yellow-300",
            }));

          setRecentOrders(formatted);
        }

        // Process conversations/messages
        if (conversations && conversations.length > 0) {
          const formatted: RecentMessage[] = conversations
            .map((conv) => ({
              id: conv.id,
              name: "Buyer",
              lastMessage: conv.last_message || "No messages",
              time: new Date(conv.last_message_at).toLocaleDateString(),
              avatar: "B",
            }))
            .slice(0, 5);

          setRecentMessages(formatted);
        }

        // Build chart data from orders (grouped by month)
        const monthlyData: { [key: string]: { revenue: number; orders: number } } = {};
        orders?.forEach((order) => {
          if (order.status === "completed") {
            const date = new Date(order.created_at);
            const key = date.toLocaleDateString("en-US", {
              month: "short",
            });
            if (!monthlyData[key]) {
              monthlyData[key] = { revenue: 0, orders: 0 };
            }
            monthlyData[key].revenue += order.seller_earnings || 0;
            monthlyData[key].orders += 1;
          }
        });

        const chartPoints: ChartDataPoint[] = Object.entries(monthlyData).map(
          ([month, data]) => ({
            month,
            revenue: data.revenue,
            orders: data.orders,
          })
        );

        setChartData(
          chartPoints.length > 0
            ? chartPoints
            : [{ month: "No data", revenue: 0, orders: 0 }]
        );
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id || currentUser.role !== "seller") {
      setBalanceLoading(false);
      setBalanceData(null);
      return;
    }

    void loadBalanceData();
  }, [currentUser?.id, currentUser?.role]);

  async function handleWithdrawalSubmit() {
    if (!balanceData) {
      return;
    }

    setWithdrawSubmitting(true);
    setWithdrawFeedback("");

    try {
      if (withdrawalAmountCents <= 0) {
        throw new Error("Enter a withdrawal amount greater than zero.");
      }

      if (withdrawalAmountCents > withdrawableBalanceCents) {
        throw new Error("Withdrawal amount exceeds your withdrawable balance.");
      }

      if (netTransferAmountCents <= 0) {
        throw new Error("Withdrawal amount must exceed the Stripe transfer fee.");
      }

      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `withdrawal-${Date.now()}`;
      const response = await fetch("/api/seller/withdrawals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountCents: withdrawalAmountCents,
          idempotencyKey,
        }),
      });
      const payload = await response.json();

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
    }
  }

  if (loading) {
    return (
      <div className="relay-empty text-center">Loading...</div>
    );
  }

  return (
      <div className="space-y-8 pb-12">
        {/* Header */}
        <div className="space-y-6">
          <div>
            <p className="relay-eyebrow text-[#5f8fff] mb-2">SELLER HQ</p>
            <h1 className="text-4xl font-bold text-[#f5f7fb]">Dashboard</h1>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3">
            <Link href={`/profile/${currentUser?.username}`}>
              <button className="relay-button-primary">View Profile</button>
            </Link>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/stripe/dashboard', { method: 'POST' })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data.error || 'Failed to open Stripe dashboard')
                  if (data.url) window.open(data.url, '_blank')
                } catch (err: any) {
                  alert(err.message || 'Failed to open Stripe dashboard')
                }
              }}
              className="relay-button-secondary flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Stripe Dashboard
            </button>
            <Link href="/sell">
              <button className="relay-button-primary">Create Listing</button>
            </Link>
            <Link href="/inventory/bulk-import">
              <button className="relay-button-secondary flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Bulk Import
              </button>
            </Link>
            <Link href="/tags">
              <button className="relay-button-secondary flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Relay Tags
              </button>
            </Link>
          </div>
        </div>

        {currentUser?.role === "seller" && (
        <div className="space-y-5">
          {/* Hero Balance Display */}
          <div className="relay-card relative overflow-hidden">
            {/* Subtle gradient background accent */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#5f8fff]/[0.06] via-transparent to-emerald-500/[0.04] pointer-events-none" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#5f8fff]/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

            <div className="relative p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                {/* Left: Main balance display */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="p-2 rounded-xl bg-[#5f8fff]/15">
                      <Wallet className="w-5 h-5 text-[#7ca6ff]" />
                    </div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#7ca6ff] font-semibold">Relay Balance</p>
                  </div>
                  <p className="text-white/50 text-sm">Total funds in Relay</p>
                  <p className="text-4xl sm:text-5xl font-bold text-[#f5f7fb] tracking-tight">
                    {balanceLoading ? "..." : formatMoneyFromCents(relayBalanceCents)}
                  </p>
                </div>

                {/* Right: Withdrawable highlight + CTA */}
                <div className="flex flex-col items-start lg:items-end gap-4">
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.14em] text-emerald-400/80 font-medium mb-1">Ready to withdraw</p>
                    <p className="text-3xl sm:text-4xl font-bold text-emerald-300 tracking-tight">
                      {balanceLoading ? "..." : formatMoneyFromCents(withdrawableBalanceCents)}
                    </p>
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
                      disabled={!balanceData?.profile.stripeConnected || withdrawableBalanceCents <= 0}
                      className="relay-button-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                      <Banknote className="w-4 h-4" />
                      Withdraw
                    </button>
                  </div>
                </div>
              </div>

              {/* Fund flow visualization */}
              {!balanceLoading && (
                <div className="mt-8">
                  {/* Composition bar */}
                  {relayBalanceCents > 0 && (
                    <div className="mb-5">
                      <div className="flex rounded-full h-3 overflow-hidden bg-white/[0.06]">
                        {pendingBalanceCents > 0 && (
                          <div
                            className="bg-amber-400/70 transition-all duration-700"
                            style={{ width: `${Math.max(3, (pendingBalanceCents / relayBalanceCents) * 100)}%` }}
                            title={`Pending: ${formatMoneyFromCents(pendingBalanceCents)}`}
                          />
                        )}
                        {availableBalanceCents > 0 && (
                          <div
                            className="bg-emerald-400/70 transition-all duration-700"
                            style={{ width: `${Math.max(3, (availableBalanceCents / relayBalanceCents) * 100)}%` }}
                            title={`Available: ${formatMoneyFromCents(availableBalanceCents)}`}
                          />
                        )}
                        {currentExposureCents > 0 && (
                          <div
                            className="bg-[#5f8fff]/60 transition-all duration-700"
                            style={{ width: `${Math.max(3, (currentExposureCents / relayBalanceCents) * 100)}%` }}
                            title={`Exposure: ${formatMoneyFromCents(currentExposureCents)}`}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Fund stages */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] px-4 py-3.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-white/45 text-xs">Pending</p>
                        <p className="text-lg font-semibold text-[#f5f7fb]">{formatMoneyFromCents(pendingBalanceCents)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] px-4 py-3.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/70 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-white/45 text-xs">Available</p>
                        <p className="text-lg font-semibold text-[#f5f7fb]">{formatMoneyFromCents(availableBalanceCents)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] px-4 py-3.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#5f8fff]/60 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-white/45 text-xs">Exposure hold</p>
                        <p className="text-lg font-semibold text-[#f5f7fb]">{formatMoneyFromCents(currentExposureCents)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tier info */}
              <div className="mt-5 rounded-xl bg-[#5f8fff]/[0.07] border border-[#5f8fff]/15 px-4 py-3">
                <p className="text-[#b8ccff] text-sm">{getTierAvailabilityMessage(sellerTier)}</p>
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
                      Max {formatMoneyFromCents(withdrawableBalanceCents)}. Pending, exposure, and disputed amounts excluded.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => void handleWithdrawalSubmit()}
                      disabled={
                        withdrawSubmitting ||
                        !balanceData?.profile.stripeConnected ||
                        withdrawalAmountCents <= 0 ||
                        withdrawalAmountCents > withdrawableBalanceCents ||
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
                  disabled={!balanceData?.profile.stripeConnected || withdrawableBalanceCents <= 0}
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
                <div className="relative">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <div className="relay-card p-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-[#f5f7fb] flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-[#5f8fff]" />
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
          <div className="relay-card p-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-[#f5f7fb] flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#5f8fff]" />
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

        {/* Quick Stats Bottom */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="relay-card p-4 sm:p-5 text-center">
            <TrendingUp className="w-5 sm:w-6 h-5 sm:h-6 text-[#5f8fff] mx-auto mb-2 sm:mb-3" />
            <p className="text-white/60 text-xs sm:text-sm mb-1 sm:mb-2">Total Sales</p>
            <p className="text-2xl sm:text-3xl font-bold text-[#f5f7fb]">
              {metrics.totalSales}
            </p>
            <p className="text-white/40 text-[10px] sm:text-xs mt-1 sm:mt-2">lifetime orders</p>
          </div>

          <div className="relay-card p-4 sm:p-5 text-center">
            <DollarSign className="w-5 sm:w-6 h-5 sm:h-6 text-[#5f8fff] mx-auto mb-2 sm:mb-3" />
            <p className="text-white/60 text-xs sm:text-sm mb-1 sm:mb-2">Avg Order</p>
            <p className="text-2xl sm:text-3xl font-bold text-[#f5f7fb]">
              {"$"}{metrics.avgOrderValue.toFixed(0)}
            </p>
            <p className="text-white/40 text-[10px] sm:text-xs mt-1 sm:mt-2">per transaction</p>
          </div>

          <div className="relay-card p-4 sm:p-5 text-center">
            <MessageSquare className="w-5 sm:w-6 h-5 sm:h-6 text-[#5f8fff] mx-auto mb-2 sm:mb-3" />
            <p className="text-white/60 text-xs sm:text-sm mb-1 sm:mb-2">Conversations</p>
            <p className="text-2xl sm:text-3xl font-bold text-[#f5f7fb]">{metrics.totalConversations}</p>
            <p className="text-white/40 text-[10px] sm:text-xs mt-1 sm:mt-2">active threads</p>
          </div>

          <div className="relay-card p-4 sm:p-5 text-center">
            <Star className="w-5 sm:w-6 h-5 sm:h-6 text-[#5f8fff] mx-auto mb-2 sm:mb-3" />
            <p className="text-white/60 text-xs sm:text-sm mb-1 sm:mb-2">Rating</p>
            <p className="text-2xl sm:text-3xl font-bold text-[#f5f7fb]">
              {metrics.sellerRating > 0 ? metrics.sellerRating.toFixed(1) : "N/A"}
            </p>
            <p className="text-white/40 text-[10px] sm:text-xs mt-1 sm:mt-2">{metrics.ratingTrend.value}</p>
          </div>
        </div>
      </div>
  );
}
