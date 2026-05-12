"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { CheckCircle, Clock, XCircle, ExternalLink } from "lucide-react";
import Link from "next/link";

type FilterTab = "all" | "pending" | "approved" | "rejected";

interface Application {
  id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  profiles: {
    full_name: string;
    display_name: string;
    username: string;
    email: string;
  };
}

function ApplicationRow({ app }: any) {
  const statusConfig = {
    pending: { icon: Clock, color: "bg-amber-500/20 text-amber-300", label: "Pending" },
    approved: { icon: CheckCircle, color: "bg-green-500/20 text-green-300", label: "Approved" },
    rejected: { icon: XCircle, color: "bg-red-500/20 text-red-300", label: "Rejected" },
  };

  const StatusIcon = statusConfig[app.status as keyof typeof statusConfig].icon;
  const statusColor = statusConfig[app.status as keyof typeof statusConfig].color;
  const statusLabel = statusConfig[app.status as keyof typeof statusConfig].label;

  return (
    <Link href={`/admin/applications/${app.id}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between py-4 px-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer group gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[#f5f7fb] font-medium truncate">{app.name}</p>
          <p className="text-white/40 text-sm truncate">{app.email}</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-white/40 text-sm">{app.date}</span>
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

export default function ApplicationsPage() {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadApplications() {
      const supabase = createClient();
      const { data } = await supabase
        .from("seller_applications")
        .select("*, profiles(*)")
        .order("created_at", { ascending: false });

      setApplications(data || []);
      setLoading(false);
    }

    loadApplications();
  }, []);

  const filteredApps =
    filter === "all"
      ? applications
      : applications.filter((app) => app.status === filter);

  const pendingCount = applications.filter((a) => a.status === "pending").length;
  const approvedCount = applications.filter((a) => a.status === "approved").length;
  const rejectedCount = applications.filter((a) => a.status === "rejected").length;

  return (
    <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Seller Applications</h1>
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
            All ({applications.length})
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "pending"
                ? "bg-[#5f8fff] text-white"
                : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilter("approved")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "approved"
                ? "bg-[#5f8fff] text-white"
                : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setFilter("rejected")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "rejected"
                ? "bg-[#5f8fff] text-white"
                : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
            }`}
          >
            Rejected ({rejectedCount})
          </button>
        </div>

        {/* Applications List */}
        {loading ? (
          <div className="relay-card p-12 text-center">
            <p className="text-white/40">Loading...</p>
          </div>
        ) : (
          <div className="relay-card overflow-hidden p-0">
            <div className="divide-y divide-white/5">
              {filteredApps.length > 0 ? (
                filteredApps.map((app) => (
                  <ApplicationRow
                    key={app.id}
                    app={{
                      id: app.id,
                      name: app.profiles?.full_name || app.profiles?.display_name || app.profiles?.username || 'Unknown',
                      email: app.profiles?.email || 'N/A',
                      date: new Date(app.created_at).toLocaleDateString(),
                      status: app.status,
                    }}
                  />
                ))
              ) : (
                <div className="py-12 text-center">
                  <p className="text-white/40">No applications found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  );
}
