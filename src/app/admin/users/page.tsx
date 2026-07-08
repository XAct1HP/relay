"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";
import {
  Search,
  Lock,
  Unlock,
  AlertTriangle,
  Flag,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Copy,
  CheckCircle2,
  X,
} from "lucide-react";

interface UserProfile {
  id: string;
  display_name: string;
  username: string;
  email: string;
  full_name: string;
  role: "seller" | "buyer" | "admin";
  is_banned: boolean;
  dispute_flags_count: number;
  created_at: string;
}

type FilterTab = "all" | "flagged" | "banned";
type ModalState = "none" | "ban" | "unban";

const PAGE_SIZE = 20;

function UserRow({ user, onActionClick, onMessageClick }: {
  user: any;
  onActionClick: (user: any, action: "ban" | "unban") => void;
  onMessageClick: (user: any) => void;
}) {
  const roleColor =
    user.role === "seller"
      ? "bg-blue-500/20 text-blue-300"
      : user.role === "admin"
        ? "bg-emerald-500/20 text-emerald-300"
        : "bg-purple-500/20 text-purple-300";

  const statusColor = user.is_banned
    ? "bg-red-500/20 text-red-300"
    : "bg-green-500/20 text-green-300";
  const statusLabel = user.is_banned ? "Banned" : "Active";

  const profileHref = user.username ? `/profile/${user.username}` : `/profile/${user.id}`;

  return (
    <div
      className={`py-4 px-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors ${
        user.dispute_flags_count > 0 ? "bg-red-500/[0.03] border-l-2 border-l-red-500/50" : ""
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {/* User info - left side */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5f8fff] to-[#7ca6ff] flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
            {(user.display_name || user.full_name || "U").substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <a href={profileHref} className="text-[#f5f7fb] font-medium truncate hover:text-[#5f8fff] hover:underline transition-colors cursor-pointer">
                {user.display_name || user.full_name || "Unknown"}
              </a>
              <div className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold ${roleColor}`}>
                {user.role === "seller" ? "Seller" : user.role === "admin" ? "Admin" : "Buyer"}
              </div>
              <div className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold ${statusColor}`}>
                {statusLabel}
              </div>
              {user.dispute_flags_count > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-300 text-[11px] rounded-full font-semibold flex-shrink-0">
                  <Flag className="w-3 h-3" />
                  {user.dispute_flags_count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {user.username && <span className="text-white/40 text-sm">@{user.username}</span>}
              {user.username && <span className="text-white/20 text-sm">·</span>}
              <span className="text-white/40 text-sm truncate">{user.email}</span>
            </div>
          </div>
        </div>

        {/* Action buttons - right side on desktop, underneath on mobile */}
        <div className="flex items-center gap-2 flex-shrink-0 pl-[52px] sm:pl-0">
          <button
            onClick={() => onMessageClick(user)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#5f8fff] bg-[#5f8fff]/10 hover:bg-[#5f8fff]/20 border border-[#5f8fff]/20 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Message
          </button>

          {!user.is_banned ? (
            <>
              <button
                onClick={() => onActionClick(user, "ban")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Temp Ban
              </button>
              <button
                onClick={() => onActionClick(user, "ban")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                Perm Ban
              </button>
            </>
          ) : (
            <button
              onClick={() => onActionClick(user, "unban")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-green-300 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 transition-colors"
            >
              <Unlock className="w-3.5 h-3.5" />
              Unban
            </button>
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
          {isBan ? `Ban ${user.display_name || user.full_name}?` : `Unban ${user.display_name || user.full_name}?`}
        </h2>

        {isBan && (
          <>
            <div className="mb-4">
              <label className="block text-white/70 text-sm mb-2">Ban Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setBanType("temp")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                    banType === "temp" ? "bg-[#5f8fff]/20 text-[#5f8fff]" : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  Temporary
                </button>
                <button
                  onClick={() => setBanType("permanent")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                    banType === "permanent" ? "bg-red-500/20 text-red-300" : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  Permanent
                </button>
              </div>
            </div>

            {banType === "temp" && (
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
            This user will regain access to their account and can resume selling/buying.
          </p>
        )}

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 relay-button-secondary">Cancel</button>
          <button
            onClick={() => onConfirm(reason, duration, banType)}
            className={`flex-1 relay-button-secondary ${
              isBan ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            }`}
          >
            {isBan ? "Ban User" : "Unban User"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateFoundingSellerModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    email: string;
    password: string;
    displayName: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | "password" | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setDisplayName("");
      setSubmitting(false);
      setError(null);
      setResult(null);
      setCopiedField(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/create-founding-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to create founding seller.");
      }
      setResult({
        email: data.user.email,
        password: data.password,
        displayName: data.user.displayName,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(field: "email" | "password", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // silently ignore clipboard errors
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relay-card p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-[#f5f7fb]">
              Create founding seller
            </h2>
            <p className="text-white/50 text-sm mt-1">
              Pre-approved seller account that only needs Stripe on first login.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-300 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4" />
              Account created. Send these credentials securely.
            </div>

            <div>
              <label className="block text-white/60 text-xs uppercase tracking-wide mb-1">
                Email
              </label>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <span className="flex-1 text-[#f5f7fb] text-sm break-all">
                  {result.email}
                </span>
                <button
                  onClick={() => copy("email", result.email)}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  {copiedField === "email" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-white/60 text-xs uppercase tracking-wide mb-1">
                Temporary password (shown once)
              </label>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <span className="flex-1 font-mono text-[#f5f7fb] text-sm break-all">
                  {result.password}
                </span>
                <button
                  onClick={() => copy("password", result.password)}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  {copiedField === "password" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-white/40 text-xs mt-2">
                They can change it any time from Settings after logging in.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full relay-button-secondary"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/70 text-sm mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seller@example.com"
                className="relay-input"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">
                Display name (optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Defaults to the email prefix"
                className="relay-input"
              />
            </div>
            {error && (
              <div className="text-red-300 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 relay-button-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="flex-1 relay-button-secondary bg-[#5f8fff]/20 text-[#7ca6ff] hover:bg-[#5f8fff]/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Creating..." : "Create account"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterTab>(
    (searchParams.get("filter") as FilterTab) || "all"
  );
  const [modalState, setModalState] = useState<ModalState>("none");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedAction, setSelectedAction] = useState<"ban" | "unban" | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [startingConversation, setStartingConversation] = useState<string | null>(null);
  const [createSellerOpen, setCreateSellerOpen] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [currentPage, filter]);

  async function loadUsers() {
    const supabase = createClient();
    setLoading(true);

    let query = supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (filter === "flagged") {
      query = query.gt("dispute_flags_count", 0);
    } else if (filter === "banned") {
      query = query.eq("is_banned", true);
    }

    // Pagination
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data, count } = await query;

    setUsers(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Client-side search filter (within current page)
  const filteredUsers = searchQuery
    ? users.filter((user) => {
        const q = searchQuery.toLowerCase();
        return (
          user.display_name?.toLowerCase().includes(q) ||
          user.username?.toLowerCase().includes(q) ||
          user.email?.toLowerCase().includes(q) ||
          user.full_name?.toLowerCase().includes(q)
        );
      })
    : users;

  const flaggedCount = users.filter((u) => (u.dispute_flags_count || 0) > 0).length;
  const bannedCount = users.filter((u) => u.is_banned).length;

  const handleActionClick = (user: any, action: "ban" | "unban") => {
    setSelectedUser(user);
    setSelectedAction(action);
    setModalState(action);
  };

  const handleMessageClick = async (user: UserProfile) => {
    if (!currentUser?.id || user.id === currentUser.id) return;

    setStartingConversation(user.id);
    const supabase = createClient();

    // Check if a conversation already exists between admin and this user
    const { data: existingConvos } = await supabase
      .from("conversations")
      .select("id, participant_ids")
      .contains("participant_ids", [currentUser.id, user.id]);

    // Find the direct conversation (exactly these two participants)
    const existing = existingConvos?.find(
      (c) =>
        c.participant_ids.length === 2 &&
        c.participant_ids.includes(currentUser.id) &&
        c.participant_ids.includes(user.id)
    );

    if (existing) {
      // Navigate to existing conversation
      router.push(`/messages?conversation=${existing.id}`);
    } else {
      // Create a new conversation
      const { data: newConvo, error } = await supabase
        .from("conversations")
        .insert({
          participant_ids: [currentUser.id, user.id],
          last_message: null,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (newConvo && !error) {
        router.push(`/messages?conversation=${newConvo.id}`);
      }
    }

    setStartingConversation(null);
  };

  const handleConfirmAction = async (reason: string, duration: string, banType: string) => {
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

      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, is_banned: true } : u))
      );
    } else if (selectedAction === "unban") {
      await supabase
        .from("profiles")
        .update({ is_banned: false, ban_reason: null })
        .eq("id", selectedUser.id);

      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, is_banned: false } : u))
      );
    }

    setModalState("none");
    setSelectedUser(null);
    setSelectedAction(null);
  };

  const handleFilterChange = (newFilter: FilterTab) => {
    setFilter(newFilter);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">All Users</h1>
          <p className="text-white/50 text-sm">{totalCount} total users on the platform</p>
        </div>
        <button
          onClick={() => setCreateSellerOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#7ca6ff] bg-[#5f8fff]/15 hover:bg-[#5f8fff]/25 border border-[#5f8fff]/30 transition-colors self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          Create founding seller
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleFilterChange("all")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === "all"
              ? "bg-[#5f8fff] text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
          }`}
        >
          All
        </button>
        <button
          onClick={() => handleFilterChange("flagged")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === "flagged"
              ? "bg-red-500 text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5" />
            Flagged
          </span>
        </button>
        <button
          onClick={() => handleFilterChange("banned")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === "banned"
              ? "bg-[#5f8fff] text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
          }`}
        >
          Banned
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
          <p className="text-white/40">Loading users...</p>
        </div>
      ) : (
        <div className="relay-card overflow-hidden p-0">
          <div className="divide-y divide-white/5">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  onActionClick={handleActionClick}
                  onMessageClick={handleMessageClick}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-white/40 text-sm">
            <span className="hidden sm:inline">Showing </span>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)}<span className="hidden sm:inline"> of {totalCount}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-white/60 text-sm px-3">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Conversation Starting Indicator */}
      {startingConversation && (
        <div className="fixed bottom-24 right-6 bg-[#5f8fff]/20 border border-[#5f8fff]/30 text-[#7ca6ff] px-4 py-2 rounded-lg text-sm">
          Opening conversation...
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

      <CreateFoundingSellerModal
        isOpen={createSellerOpen}
        onClose={() => setCreateSellerOpen(false)}
        onCreated={() => {
          setCurrentPage(1);
          loadUsers();
        }}
      />
    </div>
  );
}
