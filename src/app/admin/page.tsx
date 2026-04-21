"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import {
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Users,
  Package,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  ExternalLink,
  ShoppingCart,
  Flag,
  Lock,
  Shield,
  List,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import Link from "next/link";

interface MetricsData {
  gmvData: Array<{ month: string; gmv: number }>;
  ordersData: Array<{ month: string; orders: number }>;
  totalGMV: number;
  activeSellers: number;
  activeBuyers: number;
  activeListings: number;
  pendingApplications: Array<any>;
  activeDisputes: Array<any>;
  pendingReturns: number;
  flaggedSellers: number;
  bannedUsers: number;
}

function MetricCard({ icon: Icon, label, value, trend, trendValue }: any) {
  const isPositive = trend === "up";

  return (
    <div className="relay-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-white/5 rounded-lg">
              <Icon className="w-5 h-5 text-[#5f8fff]" />
            </div>
          </div>
          <p className="text-white/60 text-sm mb-1">{label}</p>
          <p className="text-2xl font-semibold text-[#f5f7fb]">{value}</p>
        </div>
        <div className="flex flex-col items-end">
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
              isPositive ? "bg-green-500/20" : "bg-red-500/20"
            }`}
          >
            {isPositive ? (
              <ArrowUpRight className="w-4 h-4 text-green-400" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-red-400" />
            )}
            <span
              className={`text-xs font-semibold ${
                isPositive ? "text-green-400" : "text-red-400"
              }`}
            >
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
      <div className="h-80">{children}</div>
    </div>
  );
}

function ActionCard({ title, count, children, viewAllLink }: any) {
  return (
    <div className="relay-card p-6 flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-[#f5f7fb]">{title}</h3>
        <span className="px-2.5 py-1 bg-[#5f8fff]/20 text-[#7ca6ff] text-xs font-bold rounded-lg">
          {count}
        </span>
      </div>
      <div className="flex-1 space-y-3 mb-6">
        {children}
      </div>
      <Link href={viewAllLink}>
        <button className="w-full text-center py-2 text-[#5f8fff] hover:text-[#7ca6ff] text-sm font-medium transition-colors border-t border-white/5 mt-auto pt-4">
          View All
        </button>
      </Link>
    </div>
  );
}

function ApplicationRow({ app }: any) {
  return (
    <div className="flex items-center justify-between py-3 px-0 border-b border-white/5 last:border-b-0">
      <div className="flex-1">
        <p className="text-[#f5f7fb] text-sm font-medium">{app.name}</p>
        <p className="text-white/40 text-xs">{app.email}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-white/40 text-xs flex-shrink-0">{app.date}</span>
        <Link href={`/admin/applications/${app.id}`}>
          <button className="relay-button-secondary text-xs px-2 py-1">
            Review
          </button>
        </Link>
      </div>
    </div>
  );
}

function DisputeRow({ dispute }: any) {
  return (
    <div className="flex items-center justify-between py-3 px-0 border-b border-white/5 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[#f5f7fb] text-sm font-medium">{dispute.orderId}</p>
          <span className="px-2 py-0.5 bg-red-500/20 text-red-300 text-xs rounded">
            {dispute.reason}
          </span>
        </div>
        <p className="text-white/40 text-xs">
          {dispute.buyer} vs {dispute.seller}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-white/40 text-xs">{dispute.date}</span>
        <Link href={`/admin/disputes/${dispute.id}`}>
          <button className="relay-button-secondary text-xs px-2 py-1">
            Review
          </button>
        </Link>
      </div>
    </div>
  );
}

function ShippingIssueRow({ issue }: any) {
  const severityColor = {
    high: "bg-orange-500/20 text-orange-300",
    critical: "bg-red-500/20 text-red-300",
  };

  return (
    <div className="flex items-center justify-between py-3 px-0 border-b border-white/5 last:border-b-0">
      <div className="flex-1">
        <p className="text-[#f5f7fb] text-sm font-medium">{issue.type}</p>
        <p className="text-white/40 text-xs">{issue.seller}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 text-xs rounded ${severityColor[issue.severity as keyof typeof severityColor]}`}>
          {issue.severity}
        </span>
      </div>
    </div>
  );
}

function FlaggedListingRow({ listing }: any) {
  return (
    <div className="flex items-center justify-between py-3 px-0 border-b border-white/5 last:border-b-0">
      <div className="flex-1">
        <p className="text-[#f5f7fb] text-sm font-medium">{listing.title}</p>
        <p className="text-white/40 text-xs">{listing.seller}</p>
      </div>
      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-xs rounded flex-shrink-0">
        {listing.reason}
      </span>
    </div>
  );
}

function ActivityItem({ activity }: any) {
  const Icon = activity.icon;
  const typeColors: any = {
    seller_approved: "text-green-400",
    order_completed: "text-blue-400",
    dispute_resolved: "text-green-400",
    listing_removed: "text-red-400",
    seller_banned: "text-orange-400",
  };

  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/5">
          <Icon className={`w-4 h-4 ${typeColors[activity.type] || "text-white/60"}`} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#f5f7fb] text-sm font-medium">{activity.description}</p>
        <p className="text-white/40 text-xs mt-1">{activity.timestamp}</p>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricsData>({
    gmvData: [],
    ordersData: [],
    totalGMV: 0,
    activeSellers: 0,
    activeBuyers: 0,
    activeListings: 0,
    pendingApplications: [],
    activeDisputes: [],
    pendingReturns: 0,
    flaggedSellers: 0,
    bannedUsers: 0,
  });

  useEffect(() => {
    async function loadMetrics() {
      const supabase = createClient();

      // Get counts
      const [{ count: sellers }, { count: buyers }, { count: listings }, { data: ordersData }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact" }).eq("role", "seller"),
        supabase.from("profiles").select("*", { count: "exact" }).eq("role", "buyer"),
        supabase.from("listings").select("*", { count: "exact" }).eq("status", "active"),
        supabase.from("orders").select("price").eq("status", "completed"),
      ]);

      // Calculate GMV
      const totalGMV = ordersData?.reduce((sum: number, order: any) => sum + (order.price || 0), 0) || 0;

      // Get pending applications
      const { data: apps } = await supabase
        .from("seller_applications")
        .select("*, profiles(*)")
        .eq("status", "pending")
        .limit(3);

      // Get active disputes
      const { data: disputes } = await supabase
        .from("orders")
        .select("*, listings(*), buyer:profiles!orders_buyer_id_fkey(*), seller:profiles!orders_seller_id_fkey(*)")
        .eq("status", "disputed")
        .limit(3);

      // Get pending returns count
      const { count: returnsCount } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .in("status", ["return_pending", "return_shipped"]);

      // Get flagged sellers (dispute_flags_count > 0)
      const { count: flaggedCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gt("dispute_flags_count", 0);

      // Get banned users
      const { count: bannedCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_banned", true);

      setMetrics({
        gmvData: [], // Chart data would require more complex aggregation
        ordersData: [],
        totalGMV,
        activeSellers: sellers || 0,
        activeBuyers: buyers || 0,
        activeListings: listings || 0,
        pendingApplications: apps || [],
        activeDisputes: disputes || [],
        pendingReturns: returnsCount || 0,
        flaggedSellers: flaggedCount || 0,
        bannedUsers: bannedCount || 0,
      });

      setLoading(false);
    }

    loadMetrics();
  }, []);

  if (loading) {
    return (
      <div className="text-center text-white/40 py-12">Loading metrics...</div>
    );
  }

  return (
      <div className="space-y-8 pb-12">
        {/* Header */}
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Platform Overview</h1>
        </div>

        {/* Top Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            icon={DollarSign}
            label="Total GMV"
            value={`$${(metrics.totalGMV / 1000000).toFixed(1)}M`}
            trend="up"
            trendValue="+8.2%"
          />
          <MetricCard
            icon={Users}
            label="Active Sellers"
            value={metrics.activeSellers}
            trend="up"
            trendValue="+12"
          />
          <MetricCard
            icon={Users}
            label="Active Buyers"
            value={metrics.activeBuyers}
            trend="up"
            trendValue="+156"
          />
          <MetricCard
            icon={Package}
            label="Active Listings"
            value={metrics.activeListings}
            trend="up"
            trendValue="+342"
          />
          <MetricCard
            icon={AlertCircle}
            label="Pending Applications"
            value={metrics.pendingApplications.length}
            trend="down"
            trendValue="-2"
          />
        </div>

        {/* Charts Row - Placeholder for real data */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="GMV Over Time">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[]}>
                <defs>
                  <linearGradient id="gmvGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5f8fff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#5f8fff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="rgba(255,255,255,0.45)" style={{ fontSize: "12px" }} />
                <YAxis stroke="rgba(255,255,255,0.45)" style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(6, 7, 10, 0.8)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#f5f7fb" }}
                  formatter={(value) => `$${value.toLocaleString()}`}
                />
                <Area
                  type="monotone"
                  dataKey="gmv"
                  stroke="#5f8fff"
                  strokeWidth={2}
                  fill="url(#gmvGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Orders Per Month">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="rgba(255,255,255,0.45)" style={{ fontSize: "12px" }} />
                <YAxis stroke="rgba(255,255,255,0.45)" style={{ fontSize: "12px" }} />
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
          </ChartCard>
        </div>

        {/* Action Items Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ActionCard
            title="Pending Seller Applications"
            count={metrics.pendingApplications.length}
            viewAllLink="/admin/applications"
          >
            {metrics.pendingApplications.map((app) => (
              <ApplicationRow
                key={app.id}
                app={{
                  id: app.id,
                  name: app.profiles?.full_name || app.profiles?.display_name || 'Unknown',
                  email: app.profiles?.email || 'N/A',
                  date: new Date(app.created_at).toLocaleDateString(),
                }}
              />
            ))}
          </ActionCard>

          <ActionCard
            title="Active Disputes"
            count={metrics.activeDisputes.length}
            viewAllLink="/admin/disputes"
          >
            {metrics.activeDisputes.map((dispute) => (
                <DisputeRow
                  key={dispute.id}
                  dispute={{
                    id: dispute.id,
                    orderId: dispute.id.slice(0, 8) + '...',
                    reason: dispute.dispute_reason || 'Disputed',
                    buyer: dispute.buyer?.full_name || dispute.buyer?.display_name || 'Unknown',
                    seller: dispute.seller?.full_name || dispute.seller?.display_name || 'Unknown',
                    date: new Date(dispute.created_at).toLocaleDateString(),
                  }}
                />
              ))}
          </ActionCard>

          <ActionCard
            title="Pending Returns"
            count={metrics.pendingReturns}
            viewAllLink="/admin/returns"
          >
            {metrics.pendingReturns > 0 ? (
              <div className="text-white/60 text-sm py-2">
                {metrics.pendingReturns} return{metrics.pendingReturns > 1 ? 's' : ''} awaiting processing
              </div>
            ) : (
              <div className="text-white/40 text-sm py-2">No pending returns</div>
            )}
          </ActionCard>
        </div>

        {/* Moderation Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-[#f5f7fb]">Moderation</h2>

          {/* Flagged Sellers Alert */}
          {metrics.flaggedSellers > 0 && (
            <Link href="/admin/users?filter=flagged">
              <div className="relay-card p-4 border border-red-500/30 bg-red-500/5 cursor-pointer hover:bg-red-500/10 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <Flag className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-red-300 font-semibold">
                      {metrics.flaggedSellers} seller{metrics.flaggedSellers > 1 ? 's' : ''} flagged for dispute losses
                    </p>
                    <p className="text-white/40 text-sm">Click to review and take action</p>
                  </div>
                </div>
              </div>
            </Link>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* User Moderation */}
            <Link href="/admin/users">
              <div className="relay-card p-5 hover:bg-white/[0.04] transition-colors cursor-pointer group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-[#5f8fff]/20 rounded-lg">
                    <Shield className="w-5 h-5 text-[#5f8fff]" />
                  </div>
                  <h3 className="text-[#f5f7fb] font-semibold group-hover:text-[#7ca6ff] transition-colors">User Management</h3>
                </div>
                <p className="text-white/40 text-sm mb-3">Manage users, review flagged sellers, ban/unban accounts</p>
                <div className="flex items-center gap-3 text-xs">
                  {metrics.flaggedSellers > 0 && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-300 rounded-full font-semibold">
                      <Flag className="w-3 h-3" />
                      {metrics.flaggedSellers} flagged
                    </span>
                  )}
                  {metrics.bannedUsers > 0 && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-orange-500/20 text-orange-300 rounded-full font-semibold">
                      <Lock className="w-3 h-3" />
                      {metrics.bannedUsers} banned
                    </span>
                  )}
                </div>
              </div>
            </Link>

            {/* Listing Moderation */}
            <Link href="/admin/listings">
              <div className="relay-card p-5 hover:bg-white/[0.04] transition-colors cursor-pointer group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-[#5f8fff]/20 rounded-lg">
                    <List className="w-5 h-5 text-[#5f8fff]" />
                  </div>
                  <h3 className="text-[#f5f7fb] font-semibold group-hover:text-[#7ca6ff] transition-colors">Listing Moderation</h3>
                </div>
                <p className="text-white/40 text-sm mb-3">Review, search, and remove listings from the marketplace</p>
                <span className="text-xs px-2 py-1 bg-[#5f8fff]/20 text-[#7ca6ff] rounded-full font-semibold">
                  {metrics.activeListings} active listings
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="relay-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <Clock className="w-5 h-5 text-[#5f8fff]" />
            <h3 className="text-lg font-semibold text-[#f5f7fb]">Recent Platform Activity</h3>
          </div>
          <div className="text-white/40 text-sm">Activity feed data would be populated from real database events</div>
        </div>
      </div>
  );
}
