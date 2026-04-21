"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import {
  Search,
  MoreVertical,
  Shield,
  Lock,
  Unlock,
  AlertTriangle,
  Flag,
} from "lucide-react";

interface User {
  id: string;
  display_name: string;
  username: string;
  email: string;
  role: "seller" | "buyer" | "admin";
  is_banned: boolean;
  dispute_flags_count: number;
  created_at: string;
}

type FilterTab = "all" | "flagged" | "banned";
type ModalState = "none" | "ban" | "unban";
type SelectedUser = null | User;

function UserRow({ user, onActionClick }: any) {
  const roleColor =
    user.role === "seller"
      ? "bg-blue-500/20 text-blue-300"
      : user.role === "admin"
        ? "bg-emerald-500/20 text-emerald-300"
        : "bg-purple-500/20 text-purple-300";

  const statusConfig = {
    active: { color: "bg-green-500/20 text-green-300", label: "Active" },
    banned: { color: "bg-red-500/20 text-red-300", label: "Banned" },
    temp_ban: { color: "bg-orange-500/20 text-orange-300", label: "Temp Ban" },
  };

  const statusColor =
    statusConfig[user.status as keyof typeof statusConfig]?.color ||
    "bg-gray-500/20 text-gray-300";
  const statusLabel =
    statusConfig[user.status as keyof typeof statusConfig]?.label || user.status;

  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={`flex items-center justify-between py-4 px-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors group ${
        user.flagCount > 0 ? "bg-red-500/[0.03] border-l-2 border-l-red-500/50" : ""
      }`}
    >
      <div className="flex items-center gap-4 flex-1">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5f8fff] to-[#7ca6ff] flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
          {user.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[#f5f7fb] font-medium">{user.name}</p>
            {user.flagCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-300 text-xs rounded-full font-semibold">
                <Flag className="w-3 h-3" />
                {user.flagCount} dispute{user.flagCount > 1 ? "s" : ""} lost
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white/40 text-sm">@{user.username}</span>
            <span className="text-white/40 text-sm">·</span>
            <span className="text-white/40 text-sm">{user.email}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${roleColor}`}
        >
          {user.role === "seller"
            ? "Seller"
            : user.role === "admin"
              ? "Admin"
              : "Buyer"}
        </div>

        <div
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${statusColor}`}
        >
          {statusLabel}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="relay-button-secondary px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 relay-card p-0 rounded-lg border border-white/10 shadow-xl z-10 py-1">
              <button className="w-full text-left px-4 py-2 text-white/60 hover:text-[#f5f7fb] hover:bg-white/5 transition-colors text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                View Profile
              </button>

              {user.status === "active" && (
                <>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onActionClick(user, "ban");
                    }}
                    className="w-full text-left px-4 py-2 text-orange-300 hover:bg-orange-500/10 transition-colors text-sm flex items-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Temp Ban
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onActionClick(user, "ban");
                    }}
                    className="w-full text-left px-4 py-2 text-red-300 hover:bg-red-500/10 transition-colors text-sm flex items-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    Permanent Ban
                  </button>
                </>
              )}

              {(user.status === "banned" || user.status === "temp_ban") && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onActionClick(user, "unban");
                  }}
                  className="w-full text-left px-4 py-2 text-green-300 hover:bg-green-500/10 transition-colors text-sm flex items-center gap-2"
                >
                  <Unlock className="w-4 h-4" />
                  Unban
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionModal({ isOpen, user, action, onConfirm, onCancel }: any) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("7");
  const [banType, setBanType] = useState<"temp" | "permanent">("permanent");

  if (!isOpen || !user || !action) return null;

  const isBan = action === "ban";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relay-card p-5 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-[#f5f7fb] mb-4">
          {isBan ? `Ban ${user.name}?` : `Unban ${user.name}?`}
        </h2>

        {isBan && (
          <>
            <div className="mb-4">
              <label className="block text-white/70 text-sm mb-2">
                Ban Type
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setBanType("temp")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                    banType === "temp"
                      ? "bg-[#5f8fff]/20 text-[#5f8fff]"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  Temporary
                </button>
                <button
                  onClick={() => setBanType("permanent")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                    banType === "permanent"
                      ? "bg-red-500/20 text-red-300"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  Permanent
                </button>
              </div>
            </div>

            {banType === "temp" && (
              <div className="mb-4">
                <label className="block text-white/70 text-sm mb-2">
                  Duration (Days)
                </label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  min="1"
                  className="relay-input"
                />
              </div>
            )}

            <div className="mb-6">
              <label className="block text-white/70 text-sm mb-2">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this user being banned?"
                className="relay-textarea"
                rows={3}
              />
            </div>
          </>
        )}

        {!isBan && (
          <p className="text-white/60 mb-6">
            This user will regain access to their account and can resume
            selling/buying.
          </p>
        )}

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 relay-button-secondary">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason, duration, banType)}
            className={`flex-1 relay-button-secondary ${
              isBan
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            }`}
          >
            {isBan ? "Ban User" : "Unban User"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [modalState, setModalState] = useState<ModalState>("none");
  const [selectedUser, setSelectedUser] = useState<SelectedUser>(null);
  const [selectedAction, setSelectedAction] = useState<"ban" | "unban" | null>(
    null
  );
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUsers() {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      setUsers(data || []);
      setLoading(false);
    }

    loadUsers();
  }, []);

  const flaggedCount = users.filter(
    (u) => (u.dispute_flags_count || 0) > 0
  ).length;
  const bannedCount = users.filter((u) => u.is_banned).length;

  const filteredUsers = users
    .filter((user) => {
      // Tab filter
      if (filter === "flagged" && !(user.dispute_flags_count > 0)) return false;
      if (filter === "banned" && !user.is_banned) return false;

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          user.display_name?.toLowerCase().includes(q) ||
          user.username?.toLowerCase().includes(q) ||
          user.email?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    // Sort flagged sellers to top
    .sort((a, b) => (b.dispute_flags_count || 0) - (a.dispute_flags_count || 0));

  const handleActionClick = (user: any, action: "ban" | "unban") => {
    setSelectedUser(user);
    setSelectedAction(action);
    setModalState(action);
  };

  const handleConfirmAction = async (
    reason: string,
    duration: string,
    banType: string
  ) => {
    if (!selectedUser) return;

    const supabase = createClient();

    if (selectedAction === "ban") {
      await supabase
        .from("profiles")
        .update({
          is_banned: true,
          ban_reason: reason || "Violation of platform policies",
        })
        .eq("id", selectedUser.id);

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id ? { ...u, is_banned: true } : u
        )
      );
    } else if (selectedAction === "unban") {
      await supabase
        .from("profiles")
        .update({ is_banned: false, ban_reason: null })
        .eq("id", selectedUser.id);

      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id ? { ...u, is_banned: false } : u
        )
      );
    }

    setModalState("none");
    setSelectedUser(null);
    setSelectedAction(null);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="space-y-2">
        <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
        <h1 className="relay-title">User Management</h1>
      </div>

      {/* Flagged Alert Banner */}
      {flaggedCount > 0 && filter !== "flagged" && (
        <div
          onClick={() => setFilter("flagged")}
          className="relay-card p-4 border border-red-500/30 bg-red-500/5 cursor-pointer hover:bg-red-500/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Flag className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-red-300 font-semibold">
                {flaggedCount} seller{flaggedCount > 1 ? "s" : ""} flagged for
                dispute losses
              </p>
              <p className="text-white/40 text-sm">
                Click to review and take action
              </p>
            </div>
          </div>
        </div>
      )}

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
          All ({users.length})
        </button>
        <button
          onClick={() => setFilter("flagged")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === "flagged"
              ? "bg-red-500 text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5" />
            Flagged ({flaggedCount})
          </span>
        </button>
        <button
          onClick={() => setFilter("banned")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === "banned"
              ? "bg-[#5f8fff] text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
          }`}
        >
          Banned ({bannedCount})
        </button>
      </div>

      {/* Search Bar */}
      <div className="relay-card p-5">
        <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg border border-white/10">
          <Search className="w-5 h-5 text-white/40" />
          <input
            type="text"
            placeholder="Search by name, username, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-white placeholder-white/40 outline-none text-sm"
          />
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="relay-card p-12 text-center">
          <p className="text-white/40">Loading...</p>
        </div>
      ) : (
        <div className="relay-card overflow-hidden p-0">
          <div className="divide-y divide-white/5">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <UserRow
                  key={user.id}
                  user={{
                    id: user.id,
                    name: user.display_name || "Unknown",
                    username: user.username || "",
                    email: user.email || "",
                    avatar: (user.display_name || "U")
                      .substring(0, 2)
                      .toUpperCase(),
                    role: user.role || "buyer",
                    status: user.is_banned ? "banned" : "active",
                    flagCount: user.dispute_flags_count || 0,
                    joinedDate: new Date(user.created_at).toLocaleDateString(),
                  }}
                  onActionClick={handleActionClick}
                />
              ))
            ) : (
              <div className="py-12 text-center">
                <p className="text-white/40">No users found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      <ActionModal
        isOpen={modalState !== "none"}
        user={selectedUser}
        action={selectedAction}
        onConfirm={handleConfirmAction}
        onCancel={() => setModalState("none")}
      />
    </div>
  );
}
