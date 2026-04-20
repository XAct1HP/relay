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
} from "lucide-react";

interface User {
  id: string;
  display_name: string;
  username: string;
  email: string;
  role: "seller" | "buyer";
  is_banned: boolean;
  created_at: string;
}
type ModalState = "none" | "ban" | "unban";
type SelectedUser = null | User;

function UserRow({ user, onActionClick }: any) {
  const roleColor =
    user.role === "seller"
      ? "bg-blue-500/20 text-blue-300"
      : "bg-purple-500/20 text-purple-300";

  const statusConfig = {
    active: { color: "bg-green-500/20 text-green-300", label: "Active" },
    banned: { color: "bg-red-500/20 text-red-300", label: "Banned" },
    temp_ban: { color: "bg-orange-500/20 text-orange-300", label: "Temp Ban" },
  };

  const statusColor = statusConfig[user.status as keyof typeof statusConfig].color;
  const statusLabel = statusConfig[user.status as keyof typeof statusConfig].label;

  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="flex items-center justify-between py-4 px-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
      <div className="flex items-center gap-4 flex-1">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5f8fff] to-[#7ca6ff] flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
          {user.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#f5f7fb] font-medium">{user.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white/40 text-sm">@{user.username}</span>
            <span className="text-white/40 text-sm">·</span>
            <span className="text-white/40 text-sm">{user.email}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${roleColor}`}>
          {user.role === "seller" ? "Seller" : "Buyer"}
        </div>

        <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${statusColor}`}>
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
  const [duration, setDuration] = useState("7"); // days

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
              <label className="block text-white/70 text-sm mb-2">Ban Type</label>
              <div className="flex gap-2">
                <button className="flex-1 px-3 py-2 bg-[#5f8fff]/20 text-[#5f8fff] rounded-lg text-sm font-medium">
                  Temporary
                </button>
                <button className="flex-1 px-3 py-2 bg-white/5 text-white/60 rounded-lg text-sm font-medium hover:bg-white/10">
                  Permanent
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-white/70 text-sm mb-2">Duration (Days)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                min="1"
                className="relay-input"
              />
            </div>

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
            This user will regain access to their account and can resume selling/buying.
          </p>
        )}

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 relay-button-secondary">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason, duration)}
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
  const [modalState, setModalState] = useState<ModalState>("none");
  const [selectedUser, setSelectedUser] = useState<SelectedUser>(null);
  const [selectedAction, setSelectedAction] = useState<"ban" | "unban" | null>(null);
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

  const filteredUsers = users.filter(
    (user) =>
      user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleActionClick = (user: any, action: "ban" | "unban") => {
    setSelectedUser(user);
    setSelectedAction(action);
    setModalState(action);
  };

  const handleConfirmAction = (reason: string, duration: string) => {
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
                      name: user.display_name || 'Unknown',
                      username: user.username || '',
                      email: user.email || '',
                      avatar: (user.display_name || 'U').substring(0, 2).toUpperCase(),
                      role: user.role || 'buyer',
                      status: user.is_banned ? 'banned' : 'active',
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
