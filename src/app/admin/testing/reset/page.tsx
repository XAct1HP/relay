"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw, ShieldAlert } from "lucide-react";

interface ResetStatusResponse {
  allowed: boolean;
  environment: string;
  confirmationText: string;
}

interface ResetResultResponse {
  success: boolean;
  environment: string;
  deletedAuthUserCount: number;
  deletedProfileCount: number;
  preservedAdminCount: number;
  tableResults: Array<{
    table: string;
    status: "deleted" | "skipped_missing";
  }>;
}

export default function AdminTestingResetPage() {
  const [status, setStatus] = useState<ResetStatusResponse | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResetResultResponse | null>(null);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/testing/reset-marketplace", {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load testing reset status.");
      }

      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load testing reset status.");
    } finally {
      setLoading(false);
    }
  }

  async function runReset() {
    if (!status?.allowed) {
      return;
    }

    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/admin/testing/reset-marketplace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmation,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to reset testing marketplace data.");
      }

      setResult(payload);
      setConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset testing marketplace data.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="relay-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-red-300 mt-0.5 flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-semibold text-[#f5f7fb]">
              Testing Marketplace Reset
            </h1>
            <p className="text-white/55 text-sm mt-1 max-w-3xl">
              This is an admin-only staging and preview cleanup tool. It preserves admin users,
              wipes marketplace and balance data, deletes non-admin profiles, and removes their
              Supabase Auth users.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-white/45 text-sm">Loading reset status...</div>
        ) : status ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">
                Environment
              </p>
              <p className="text-[#f5f7fb] font-semibold">{status.environment}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">
                Reset Allowed
              </p>
              <p className={status.allowed ? "text-emerald-300 font-semibold" : "text-red-300 font-semibold"}>
                {status.allowed ? "Yes" : "No"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">
                Confirm Text
              </p>
              <p className="text-[#f5f7fb] font-semibold">{status.confirmationText}</p>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Danger zone</p>
              <p className="mt-1 text-red-100/90">
                This removes non-admin marketplace users and clears transactional data so you can
                reuse emails and reset Relay Balance state for testing.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm text-white/70">
            Type the confirmation text exactly to enable reset
          </label>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[#f5f7fb] outline-none focus:border-[#5f8fff]/50"
            placeholder={status?.confirmationText || "RESET STAGING"}
          />
          <button
            onClick={() => void runReset()}
            disabled={
              submitting ||
              !status?.allowed ||
              confirmation.trim() !== status?.confirmationText
            }
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className="w-4 h-4" />
            {submitting ? "Resetting..." : "Reset Marketplace Data"}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="relay-card p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#f5f7fb]">Reset Result</h2>
            <p className="text-white/45 text-sm mt-1">
              Marketplace test data was cleared for non-admin users.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">
                Auth Users Deleted
              </p>
              <p className="text-[#f5f7fb] font-semibold">{result.deletedAuthUserCount}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">
                Profiles Deleted
              </p>
              <p className="text-[#f5f7fb] font-semibold">{result.deletedProfileCount}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-1">
                Admins Preserved
              </p>
              <p className="text-[#f5f7fb] font-semibold">{result.preservedAdminCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-white/40 text-xs uppercase tracking-[0.14em] mb-3">
              Tables Cleared
            </p>
            <div className="flex flex-wrap gap-2">
              {result.tableResults.map((entry) => (
                <span
                  key={entry.table}
                  className="rounded-full bg-black/15 px-3 py-1 text-xs text-white/70"
                >
                  {entry.table} · {entry.status}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
