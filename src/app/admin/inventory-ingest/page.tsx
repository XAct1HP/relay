"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  FileSpreadsheet,
  ListChecks,
  PackageSearch,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  commitAdminInventoryIngestAction,
  listAdminInventorySellersAction,
} from "@/app/admin/inventory-ingest/actions";
import type {
  AdminInventoryCommitReport,
  AdminInventoryPreviewReport,
  AdminInventoryPricingMode,
  AdminInventorySellerOption,
} from "@/lib/admin-inventory-ingest";
import { useAuth } from "@/hooks/useAuth";

const EMPTY_PREVIEW: AdminInventoryPreviewReport | null = null;

type IngestTab = "rows" | "review" | "pricing" | "missing" | "result";
type RowFilter = "all" | "ready" | "review" | "blocked" | "manual";

export default function AdminInventoryIngestPage() {
  const { currentUser, isLoading } = useAuth();
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [sellers, setSellers] = useState<AdminInventorySellerOption[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pricingMode, setPricingMode] = useState<AdminInventoryPricingMode>("balanced");
  const [reconcileMissing, setReconcileMissing] = useState(false);
  const [preview, setPreview] = useState<AdminInventoryPreviewReport | null>(EMPTY_PREVIEW);
  const [commitReport, setCommitReport] = useState<AdminInventoryCommitReport | null>(null);
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, "approve" | "reject">>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingSellers, setLoadingSellers] = useState(true);
  const [isPending, startTransition] = useTransition();

  // UI-only state for the tabbed workbench (no functional behavior change).
  const [activeTab, setActiveTab] = useState<IngestTab>("rows");
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [rowSearch, setRowSearch] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSellers() {
      setLoadingSellers(true);
      const result = await listAdminInventorySellersAction();
      if (!active) {
        return;
      }

      if (!result.success) {
        setPageError(result.error || "Failed to load sellers.");
        setLoadingSellers(false);
        return;
      }

      setSellers(result.sellers);
      setLoadingSellers(false);
      if (result.sellers.length > 0) {
        setSelectedSellerId((current) => current || result.sellers[0].id);
      }
    }

    loadSellers();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preview) {
      return;
    }

    setManualPrices((current) => {
      const next: Record<string, string> = {};
      for (const row of preview.preview_rows) {
        if (row.final_price === null) {
          next[row.key] = current[row.key] || "";
        }
      }
      return next;
    });
  }, [preview]);

  useEffect(() => {
    if (!preview) {
      return;
    }

    setReviewDecisions((current) => {
      const next = {} as Record<string, "approve" | "reject">;
      for (const row of preview.preview_rows) {
        if (row.requires_review_approval && current[row.key]) {
          next[row.key] = current[row.key];
        }
      }
      return next;
    });
  }, [preview]);

  useEffect(() => {
    if (!preview?.job_id) {
      return;
    }

    if (
      preview.processing_status === "complete" ||
      preview.processing_status === "failed"
    ) {
      return;
    }

    let cancelled = false;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/admin/inventory-ingest/preview/${preview.job_id}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const payload = await response.json();
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setPageError(payload.error || "Failed to refresh preview progress.");
          window.clearInterval(interval);
          return;
        }

        setPreview(payload);
      } catch {
        if (!cancelled) {
          setPageError("Failed to refresh preview progress.");
        }
        window.clearInterval(interval);
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [preview?.job_id, preview?.processing_status]);

  // Auto-jump to Result tab when a commit finishes.
  useEffect(() => {
    if (commitReport) {
      setActiveTab("result");
    }
  }, [commitReport]);

  const pendingManualRows = useMemo(
    () => (preview?.preview_rows || []).filter((row) => row.final_price === null),
    [preview]
  );

  const reviewApprovalRows = useMemo(
    () => (preview?.preview_rows || []).filter((row) => row.requires_review_approval),
    [preview]
  );

  const committableRowCount = useMemo(
    () =>
      (preview?.preview_rows || []).filter((row) =>
        isPreviewRowCommittable(row, manualPrices[row.key], reviewDecisions[row.key])
      ).length,
    [manualPrices, preview, reviewDecisions]
  );

  const canCommit = useMemo(() => {
    if (!preview || isPending) {
      return false;
    }

    if (preview.processing_status !== "complete") {
      return false;
    }

    if (preview.preview_rows.length === 0) {
      return false;
    }

    return committableRowCount > 0;
  }, [committableRowCount, isPending, preview]);

  const filteredPreviewRows = useMemo(() => {
    if (!preview) {
      return [];
    }
    const query = rowSearch.trim().toLowerCase();
    return preview.preview_rows.filter((row) => {
      if (query) {
        const haystack = [
          row.matched_product,
          row.source_name,
          row.source_sku,
          row.normalized_sku,
          row.matched_brand,
          row.matched_model,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      switch (rowFilter) {
        case "ready":
          return isPreviewRowCommittable(row, manualPrices[row.key], reviewDecisions[row.key]);
        case "review":
          return row.requires_review_approval;
        case "blocked":
          return row.action === "blocked" || row.match_confidence === "unmatched";
        case "manual":
          return row.final_price === null;
        default:
          return true;
      }
    });
  }, [preview, rowSearch, rowFilter, manualPrices, reviewDecisions]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setPreview(null);
    setCommitReport(null);
    setPageError(null);
    setManualPrices({});
    setReviewDecisions({});
  };

  const runPreview = () => {
    if (!selectedSellerId) {
      setPageError("Choose a seller before previewing the upload.");
      return;
    }

    if (!selectedFile) {
      setPageError("Choose a spreadsheet before previewing the upload.");
      return;
    }

    setPageError(null);
    setCommitReport(null);
    setReviewDecisions({});

    startTransition(async () => {
      const formData = new FormData();
      formData.set("seller_id", selectedSellerId);
      formData.set("pricing_mode", pricingMode);
      formData.set("reconcile_missing", reconcileMissing ? "true" : "false");
      formData.set("file", selectedFile);
      const response = await fetch("/api/admin/inventory-ingest/preview", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        setPageError(payload.error || "Failed to start preview.");
        return;
      }
      setPreview(payload);
      setActiveTab("rows");
    });
  };

  const runCommit = () => {
    if (!preview || !canCommit) {
      setPageError("Finish the preview and make sure at least one row is ready to commit.");
      return;
    }

    setPageError(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("seller_id", selectedSellerId);
      formData.set("pricing_mode", pricingMode);
      formData.set("reconcile_missing", reconcileMissing ? "true" : "false");
      formData.set("manual_price_by_key", JSON.stringify(manualPrices));
      formData.set("review_decision_by_key", JSON.stringify(reviewDecisions));
      formData.set("preview_report", JSON.stringify(preview));
      if (selectedFile) {
        formData.set("file", selectedFile);
      }
      const report = await commitAdminInventoryIngestAction(formData);
      setCommitReport(report);
    });
  };

  if (isLoading || loadingSellers) {
    return <div className="relay-card p-8 text-center text-white/60">Loading admin inventory ingest...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="relay-card p-8 max-w-2xl">
        <h1 className="relay-title mb-3">Admin Inventory Ingest</h1>
        <p className="text-white/60">Only admins can access this workflow.</p>
      </div>
    );
  }

  const selectedSeller = sellers.find((seller) => seller.id === selectedSellerId);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Inventory Ingest</h1>
          <p className="max-w-3xl text-sm text-white/60">
            Upload messy seller spreadsheets, review product matches, control pricing as an admin,
            and optionally reconcile missing inventory without touching the seller bulk import flow.
          </p>
        </div>
        <Link href="/admin" className="relay-button-secondary inline-flex items-center justify-center">
          Back to Admin
        </Link>
      </div>

      {/* Setup ribbon: everything needed to start an ingest in a single strip */}
      <div className="relay-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/5 bg-white/[0.02] px-5 py-3">
          <div className="rounded-lg bg-[#5f8fff]/15 p-2 text-[#7ca6ff]">
            <Shield className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#f5f7fb]">Ingest Setup</p>
            <p className="text-xs text-white/45">
              Sellers do not configure or run this workflow.
            </p>
          </div>
          {selectedSeller && (
            <span className="hidden max-w-[240px] truncate rounded-full bg-white/5 px-3 py-1 text-xs text-white/60 md:inline">
              {formatSellerLabel(selectedSeller)}
            </span>
          )}
          <StatusPill preview={preview} />
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(200px,1fr)_minmax(220px,1.2fr)_auto]">
          <label className="space-y-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Seller</span>
            <select
              value={selectedSellerId}
              onChange={(event) => {
                setSelectedSellerId(event.target.value);
                setPreview(null);
                setCommitReport(null);
                setReviewDecisions({});
              }}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-[#f5f7fb] outline-none focus:border-[#5f8fff]"
            >
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id} className="bg-[#111319]">
                  {formatSellerLabel(seller)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Pricing policy</span>
            <select
              value={pricingMode}
              onChange={(event) => {
                setPricingMode(event.target.value as AdminInventoryPricingMode);
                setPreview(null);
                setCommitReport(null);
                setReviewDecisions({});
              }}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-[#f5f7fb] outline-none focus:border-[#5f8fff]"
            >
              <option value="aggressive" className="bg-[#111319]">
                Aggressive: lowest ask - $1
              </option>
              <option value="balanced" className="bg-[#111319]">
                Balanced: lowest ask
              </option>
              <option value="manual" className="bg-[#111319]">
                Manual: require admin pricing
              </option>
            </select>
          </label>

          <div className="space-y-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Spreadsheet</span>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
              <Upload className="h-4 w-4 flex-shrink-0 text-white/50" />
              <span className="min-w-0 flex-1 truncate">
                {selectedFile ? selectedFile.name : "No file chosen"}
              </span>
              <label
                htmlFor="admin-ingest-file"
                className="flex-shrink-0 cursor-pointer rounded-md bg-[#5f8fff] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#709cff]"
              >
                Browse
              </label>
              <input
                id="admin-ingest-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={runPreview}
              disabled={!selectedFile || !selectedSellerId || isPending}
              className="relay-button-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Preview
            </button>
            <button
              onClick={runCommit}
              disabled={!canCommit}
              className="relay-button-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
              title={canCommit ? "Commit ready inventory" : "Nothing ready to commit yet"}
            >
              <CheckCircle2 className="h-4 w-4" />
              Commit
            </button>
          </div>
        </div>

        <div className="border-t border-white/5 bg-white/[0.015] px-5 py-3">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={reconcileMissing}
              onChange={(event) => {
                setReconcileMissing(event.target.checked);
                setPreview(null);
                setCommitReport(null);
                setReviewDecisions({});
              }}
              className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#5f8fff] focus:ring-[#5f8fff]"
            />
            <span className="text-sm text-white/70">
              Reconcile missing inventory
              <span className="ml-2 text-xs text-white/40">
                Active variants missing from the sheet will be deactivated on commit.
              </span>
            </span>
          </label>
        </div>

        {(pageError || preview?.message || commitReport?.message) && (
          <div className="space-y-2 border-t border-white/5 px-5 py-3">
            {pageError && (
              <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {pageError}
              </div>
            )}
            {preview && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/65">
                {preview.message}
              </div>
            )}
            {commitReport && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {commitReport.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main workbench: sticky status rail + tabbed content pane */}
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="relay-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#7ca6ff]" />
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Live Status</h2>
            </div>

            <ProgressPanel preview={preview} />

            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Rows" value={preview?.rows_read || 0} />
              <MiniStat label="Considered" value={preview?.source_rows_considered || 0} />
              <MiniStat label="Ready" value={preview?.ready_rows || 0} tone="success" />
              <MiniStat label="Review" value={preview?.review_rows || 0} tone="warning" />
              <MiniStat label="Blocked" value={preview?.blocked_rows || 0} tone="danger" />
              <MiniStat label="Commit" value={committableRowCount} tone="success" />
              <MiniStat
                label="Missing Variants"
                value={preview?.missing_variants.length || 0}
                className="col-span-2"
              />
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="relay-card overflow-hidden">
            <div className="flex flex-wrap gap-1 border-b border-white/5 bg-white/[0.02] p-2">
              <TabButton
                active={activeTab === "rows"}
                onClick={() => setActiveTab("rows")}
                icon={<ListChecks className="h-4 w-4" />}
                label="All Rows"
                count={preview?.preview_rows.length || 0}
              />
              <TabButton
                active={activeTab === "review"}
                onClick={() => setActiveTab("review")}
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Review"
                count={reviewApprovalRows.length}
                tone="warning"
              />
              <TabButton
                active={activeTab === "pricing"}
                onClick={() => setActiveTab("pricing")}
                icon={<DollarSign className="h-4 w-4" />}
                label="Pricing"
                count={pendingManualRows.length}
                tone="warning"
              />
              <TabButton
                active={activeTab === "missing"}
                onClick={() => setActiveTab("missing")}
                icon={<PackageSearch className="h-4 w-4" />}
                label="Missing"
                count={preview?.missing_variants.length || 0}
              />
              <TabButton
                active={activeTab === "result"}
                onClick={() => setActiveTab("result")}
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Result"
                count={commitReport?.committed_skus || 0}
                tone="success"
              />
            </div>

            {activeTab === "rows" && preview && (
              <div className="flex flex-col gap-3 border-b border-white/5 px-4 py-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input
                    value={rowSearch}
                    onChange={(event) => setRowSearch(event.target.value)}
                    placeholder="Search product, brand, or SKU"
                    className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-[#f5f7fb] outline-none focus:border-[#5f8fff]"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip
                    label={`All ${preview.preview_rows.length}`}
                    active={rowFilter === "all"}
                    onClick={() => setRowFilter("all")}
                  />
                  <FilterChip
                    label={`Ready ${preview.ready_rows}`}
                    active={rowFilter === "ready"}
                    onClick={() => setRowFilter("ready")}
                    tone="success"
                  />
                  <FilterChip
                    label={`Review ${reviewApprovalRows.length}`}
                    active={rowFilter === "review"}
                    onClick={() => setRowFilter("review")}
                    tone="warning"
                  />
                  <FilterChip
                    label={`Manual ${pendingManualRows.length}`}
                    active={rowFilter === "manual"}
                    onClick={() => setRowFilter("manual")}
                    tone="warning"
                  />
                  <FilterChip
                    label={`Blocked ${preview.blocked_rows}`}
                    active={rowFilter === "blocked"}
                    onClick={() => setRowFilter("blocked")}
                    tone="danger"
                  />
                </div>
              </div>
            )}

            <div className="p-4">
              {!preview && activeTab !== "result" && (
                <EmptyState
                  icon={<FileSpreadsheet className="h-6 w-6" />}
                  title="No preview yet"
                  hint="Choose a seller, upload a CSV, and run Preview to populate this workbench."
                />
              )}

              {preview && activeTab === "rows" && (
                <PreviewRowsTable
                  rows={filteredPreviewRows}
                  totalCount={preview.preview_rows.length}
                  reviewDecisions={reviewDecisions}
                />
              )}

              {preview && activeTab === "review" && (
                <ReviewList
                  rows={reviewApprovalRows}
                  reviewDecisions={reviewDecisions}
                  setReviewDecisions={setReviewDecisions}
                />
              )}

              {preview && activeTab === "pricing" && (
                <PricingList
                  rows={pendingManualRows}
                  manualPrices={manualPrices}
                  setManualPrices={setManualPrices}
                />
              )}

              {preview && activeTab === "missing" && (
                <MissingList
                  variants={preview.missing_variants}
                  reconcileMissing={reconcileMissing}
                />
              )}

              {activeTab === "result" && <ResultView commitReport={commitReport} />}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusPill({ preview }: { preview: AdminInventoryPreviewReport | null }) {
  if (!preview) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/50">
        <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
        Idle
      </span>
    );
  }
  const status = preview.processing_status || "complete";
  const tone =
    status === "complete"
      ? "bg-emerald-500/15 text-emerald-200"
      : status === "failed"
      ? "bg-red-500/15 text-red-200"
      : "bg-[#5f8fff]/15 text-[#a2c0ff]";
  const dot =
    status === "complete"
      ? "bg-emerald-400"
      : status === "failed"
      ? "bg-red-400"
      : "bg-[#7ca6ff] animate-pulse";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

function ProgressPanel({ preview }: { preview: AdminInventoryPreviewReport | null }) {
  if (!preview) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-center text-xs text-white/45">
        Idle. Run Preview to watch KicksDB matches load in real time.
      </div>
    );
  }
  const total = preview.live_lookup_total || 0;
  const done = preview.live_lookup_completed || 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
  const status = preview.processing_status || "complete";
  const barGradient =
    status === "failed"
      ? "from-red-500 to-red-400"
      : status === "complete"
      ? "from-emerald-500 to-emerald-400"
      : "from-[#5f8fff] to-[#7ca6ff]";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/55">
        <span>KicksDB lookup</span>
        <span className="tabular-nums text-white/75">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-white/40">
        <span className="tabular-nums">
          {done} / {total}
        </span>
        {preview.waiting_until && (
          <span>until {new Date(preview.waiting_until).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
  className = "",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
  className?: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-100"
      : tone === "warning"
      ? "border-amber-500/20 bg-amber-500/8 text-amber-100"
      : tone === "danger"
      ? "border-red-500/20 bg-red-500/8 text-red-100"
      : "border-white/10 bg-white/[0.03] text-[#f5f7fb]";
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClass} ${className}`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const activeClass = active
    ? "bg-[#5f8fff]/15 text-[#f5f7fb] ring-1 ring-[#5f8fff]/30 shadow-[0_0_20px_-8px_rgba(95,143,255,0.5)]"
    : "text-white/60 hover:bg-white/5 hover:text-white/90";
  const badgeTone = active
    ? tone === "success"
      ? "bg-emerald-500/25 text-emerald-100"
      : tone === "warning"
      ? "bg-amber-500/25 text-amber-100"
      : tone === "danger"
      ? "bg-red-500/25 text-red-100"
      : "bg-white/15 text-white/90"
    : "bg-white/8 text-white/55";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${activeClass}`}
    >
      {icon}
      <span>{label}</span>
      {count > 0 && (
        <span
          className={`inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${badgeTone}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  tone = "default",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = active
    ? tone === "success"
      ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
      : tone === "warning"
      ? "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/30"
      : tone === "danger"
      ? "bg-red-500/20 text-red-100 ring-1 ring-red-400/30"
      : "bg-white/12 text-white ring-1 ring-white/20"
    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/85";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${toneClass}`}
    >
      {label}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 rounded-full bg-white/5 p-3 text-white/60">{icon}</div>
      )}
      <p className="text-sm font-medium text-white/80">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-white/45">{hint}</p>
    </div>
  );
}

function PreviewRowsTable({
  rows,
  totalCount,
  reviewDecisions,
}: {
  rows: AdminInventoryPreviewReport["preview_rows"];
  totalCount: number;
  reviewDecisions: Record<string, "approve" | "reject">;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Search className="h-6 w-6" />}
        title="No rows match your filters"
        hint={`${totalCount} rows exist in this preview. Try clearing the search or filter chips above.`}
      />
    );
  }
  return (
    <div className="max-h-[640px] overflow-auto rounded-xl border border-white/5">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[#0a0c12]/95 text-white/40 backdrop-blur">
          <tr className="border-b border-white/10">
            <th className="px-3 py-2.5 font-medium">Action</th>
            <th className="px-3 py-2.5 font-medium">Product</th>
            <th className="px-3 py-2.5 font-medium">SKU</th>
            <th className="px-3 py-2.5 font-medium">Size</th>
            <th className="px-3 py-2.5 font-medium">Qty</th>
            <th className="px-3 py-2.5 font-medium">Price</th>
            <th className="px-3 py-2.5 font-medium">Current</th>
            <th className="px-3 py-2.5 font-medium">Match</th>
            <th className="px-3 py-2.5 font-medium">Live</th>
            <th className="px-3 py-2.5 font-medium">Warnings</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-white/5 align-top text-white/75 transition hover:bg-white/[0.02]"
            >
              <td className="px-3 py-2.5">
                <ActionBadge action={row.action} />
              </td>
              <td className="px-3 py-2.5">
                <div className="max-w-[260px]">
                  <p className="font-medium text-[#f5f7fb]">
                    {row.matched_product || row.source_name || "Unknown product"}
                  </p>
                  <p className="text-xs text-white/45">
                    {row.matched_brand || "Unknown brand"}
                    {row.matched_model ? ` | ${row.matched_model}` : ""}
                  </p>
                  <p className="text-xs text-white/40">Rows {row.row_numbers.join(", ")}</p>
                </div>
              </td>
              <td className="px-3 py-2.5 font-mono text-xs text-white/70">
                {row.source_sku || row.normalized_sku || "Missing"}
              </td>
              <td className="px-3 py-2.5 tabular-nums">{row.size}</td>
              <td className="px-3 py-2.5 tabular-nums">{row.quantity}</td>
              <td className="px-3 py-2.5 tabular-nums">
                {row.final_price !== null ? `$${row.final_price.toFixed(2)}` : (
                  <span className="text-amber-300/85">Manual</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-xs text-white/60">
                {row.existing_quantity !== null
                  ? `${row.existing_quantity} @ $${(row.existing_price || 0).toFixed(2)}`
                  : "None"}
              </td>
              <td className="px-3 py-2.5">
                <div className="space-y-1">
                  <MatchBadge confidence={row.match_confidence} />
                  <p className="text-[11px] text-white/45">
                    {row.match_source === "name_fallback"
                      ? "Name fallback"
                      : row.match_source === "catalog"
                      ? "Catalog"
                      : row.match_source === "sku"
                      ? "SKU"
                      : "None"}
                  </p>
                </div>
              </td>
              <td className="px-3 py-2.5">
                <LiveLookupBadge status={row.live_lookup_status} />
              </td>
              <td className="px-3 py-2.5">
                <div className="max-w-[280px] space-y-1">
                  {row.action_reason && (
                    <p className="text-xs text-amber-200">{row.action_reason}</p>
                  )}
                  {row.requires_review_approval && (
                    <p className="text-xs text-white/55">
                      Review:{" "}
                      {reviewDecisions[row.key] === "approve"
                        ? "approved"
                        : reviewDecisions[row.key] === "reject"
                        ? "rejected"
                        : "pending"}
                    </p>
                  )}
                  {row.live_lookup_message && (
                    <p className="text-xs text-white/45">{row.live_lookup_message}</p>
                  )}
                  {row.warnings.length > 0 ? (
                    row.warnings.slice(0, 3).map((warning) => (
                      <p key={warning} className="text-xs text-white/45">
                        {warning}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-white/35">None</p>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewList({
  rows,
  reviewDecisions,
  setReviewDecisions,
}: {
  rows: AdminInventoryPreviewReport["preview_rows"];
  reviewDecisions: Record<string, "approve" | "reject">;
  setReviewDecisions: React.Dispatch<React.SetStateAction<Record<string, "approve" | "reject">>>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-6 w-6" />}
        title="Nothing to review"
        hint="Rows matched by name fallback will appear here for your approval."
      />
    );
  }
  return (
    <div className="max-h-[640px] space-y-3 overflow-auto pr-1">
      {rows.map((row) => {
        const decision = reviewDecisions[row.key];
        return (
          <div
            key={row.key}
            className={`rounded-xl border p-4 transition ${
              decision === "approve"
                ? "border-emerald-400/30 bg-emerald-500/5"
                : decision === "reject"
                ? "border-red-400/30 bg-red-500/5"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#0f1218]">
                {row.matched_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.matched_image_url}
                    alt={row.matched_product || row.source_name || "Matched product"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-white/35">
                    No image
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <p className="font-medium text-[#f5f7fb]">
                    {row.matched_product || "Matched product"}
                  </p>
                  <p className="text-sm text-white/50">
                    Source: {row.source_name || row.source_sku || "Unnamed row"}
                  </p>
                </div>
                <div className="grid gap-1.5 text-xs text-white/60 sm:grid-cols-2">
                  <p>Matched SKU: <span className="font-mono text-white/75">{row.matched_sku || "Missing"}</span></p>
                  <p>Source SKU: <span className="font-mono text-white/75">{row.source_sku || "Missing"}</span></p>
                  <p>Brand: {row.matched_brand || "Unknown"}</p>
                  <p>Model: {row.matched_model || "Unknown"}</p>
                  <p>Nickname: {row.matched_nickname || "None"}</p>
                  <p>Size {row.size} | Qty {row.quantity}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setReviewDecisions((current) => ({
                        ...current,
                        [row.key]: "approve",
                      }))
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      decision === "approve"
                        ? "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/40"
                        : "bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    Yes, commit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReviewDecisions((current) => ({
                        ...current,
                        [row.key]: "reject",
                      }))
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      decision === "reject"
                        ? "bg-red-500/25 text-red-100 ring-1 ring-red-400/40"
                        : "bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    No, skip
                  </button>
                  <span className="text-[11px] text-white/45">
                    {decision === "approve"
                      ? "Approved for commit"
                      : decision === "reject"
                      ? "Will be skipped"
                      : "Waiting for review"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PricingList({
  rows,
  manualPrices,
  setManualPrices,
}: {
  rows: AdminInventoryPreviewReport["preview_rows"];
  manualPrices: Record<string, string>;
  setManualPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<DollarSign className="h-6 w-6" />}
        title="No manual pricing needed"
        hint="Rows without an auto-detected price will show up here for you to set."
      />
    );
  }
  const priced = rows.filter((row) => {
    const parsed = Number.parseFloat(manualPrices[row.key] || "");
    return Number.isFinite(parsed) && parsed > 0;
  }).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-white/55">
        <span>Only add prices for rows you want to commit now. Empty rows stay skipped.</span>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70 tabular-nums">
          {priced} / {rows.length} priced
        </span>
      </div>
      <div className="max-h-[600px] space-y-2 overflow-auto pr-1">
        {rows.map((row) => (
          <div
            key={row.key}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium text-[#f5f7fb]">
                  {row.matched_product || row.source_name || row.source_sku}
                </p>
                <p className="text-xs text-white/50">
                  Size {row.size} | <span className="font-mono">{row.source_sku || row.normalized_sku}</span>
                </p>
              </div>
              <div className="relative w-full lg:w-44">
                <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={manualPrices[row.key] || ""}
                  onChange={(event) =>
                    setManualPrices((current) => ({
                      ...current,
                      [row.key]: event.target.value,
                    }))
                  }
                  placeholder="Price"
                  className="w-full rounded-lg border border-white/10 bg-[#0f1218] py-2 pl-8 pr-3 text-sm text-[#f5f7fb] outline-none focus:border-[#5f8fff]"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MissingList({
  variants,
  reconcileMissing,
}: {
  variants: AdminInventoryPreviewReport["missing_variants"];
  reconcileMissing: boolean;
}) {
  if (variants.length === 0) {
    return (
      <EmptyState
        icon={<PackageSearch className="h-6 w-6" />}
        title="Every active variant is in the sheet"
        hint="Nothing needs to be reconciled for this upload."
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-white/55">
        <span>Active variants not present in this preview.</span>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70 tabular-nums">
          {variants.length} variants
        </span>
      </div>
      <div className="max-h-[600px] overflow-auto rounded-xl border border-white/5">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#0a0c12]/95 text-white/40 backdrop-blur">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2.5 font-medium">Listing</th>
              <th className="px-3 py-2.5 font-medium">SKU</th>
              <th className="px-3 py-2.5 font-medium">Size</th>
              <th className="px-3 py-2.5 font-medium">Qty</th>
              <th className="px-3 py-2.5 font-medium">Price</th>
              <th className="px-3 py-2.5 font-medium">Resolution</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => (
              <tr key={variant.key} className="border-b border-white/5 text-white/70 hover:bg-white/[0.02]">
                <td className="px-3 py-2.5 text-[#f5f7fb]">{variant.listing_title}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-white/70">{variant.normalized_sku}</td>
                <td className="px-3 py-2.5 tabular-nums">{variant.size}</td>
                <td className="px-3 py-2.5 tabular-nums">{variant.quantity}</td>
                <td className="px-3 py-2.5 tabular-nums">${variant.price.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-xs text-white/60">
                  {variant.resolution === "replaced_by_uploaded_sku"
                    ? "Will deactivate when that SKU is replaced"
                    : reconcileMissing
                    ? "Will deactivate on commit"
                    : "Only deactivates if reconciliation is enabled"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultView({ commitReport }: { commitReport: AdminInventoryCommitReport | null }) {
  if (!commitReport) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-6 w-6" />}
        title="No commit yet"
        hint="Commit ready inventory to see the summary and any row errors here."
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <SummaryTile label="Committed SKUs" value={commitReport.committed_skus} tone="success" />
        <SummaryTile label="Created SKUs" value={commitReport.created_skus} />
        <SummaryTile label="Updated SKUs" value={commitReport.updated_skus} />
        <SummaryTile label="Skipped SKUs" value={commitReport.skipped_skus} tone="warning" />
        <SummaryTile label="Deactivated Variants" value={commitReport.deactivated_variants} />
        <SummaryTile
          label="Row Errors"
          value={commitReport.row_errors.length}
          tone={commitReport.row_errors.length ? "danger" : "default"}
        />
      </div>
      {commitReport.row_errors.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-red-100">Row errors</p>
          <ul className="mt-2 max-h-[240px] space-y-1.5 overflow-auto pr-1 text-xs text-red-100/85">
            {commitReport.row_errors.map((error) => (
              <li key={error.key} className="flex gap-2">
                <span className="font-mono text-red-200/70">{error.key}</span>
                <span>{error.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
      : tone === "warning"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-100"
      : tone === "danger"
      ? "border-red-500/20 bg-red-500/10 text-red-100"
      : "border-white/10 bg-white/[0.03] text-[#f5f7fb]";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ActionBadge({ action }: { action: AdminInventoryPreviewReport["preview_rows"][number]["action"] }) {
  const style =
    action === "create"
      ? "bg-emerald-500/15 text-emerald-300"
      : action === "update"
      ? "bg-blue-500/15 text-blue-300"
      : action === "no_change"
      ? "bg-white/10 text-white/65"
      : action === "manual_review"
      ? "bg-amber-500/15 text-amber-300"
      : "bg-red-500/15 text-red-300";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${style}`}>
      {action.replace("_", " ")}
    </span>
  );
}

function MatchBadge({
  confidence,
}: {
  confidence: AdminInventoryPreviewReport["preview_rows"][number]["match_confidence"];
}) {
  const style =
    confidence === "high"
      ? "bg-emerald-500/15 text-emerald-300"
      : confidence === "medium"
      ? "bg-blue-500/15 text-blue-300"
      : confidence === "low"
      ? "bg-amber-500/15 text-amber-300"
      : "bg-red-500/15 text-red-300";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${style}`}>
      {confidence}
    </span>
  );
}

function LiveLookupBadge({
  status,
}: {
  status: AdminInventoryPreviewReport["preview_rows"][number]["live_lookup_status"];
}) {
  const style =
    status === "complete"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "pending"
      ? "bg-blue-500/15 text-blue-300"
      : "bg-red-500/15 text-red-300";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${style}`}>
      {status}
    </span>
  );
}

function isPreviewRowCommittable(
  row: AdminInventoryPreviewReport["preview_rows"][number],
  manualPrice: string | undefined,
  reviewDecision: "approve" | "reject" | undefined
) {
  if (!row.normalized_sku || row.quantity <= 0) {
    return false;
  }

  if (row.live_lookup_status === "pending") {
    return false;
  }

  if (row.live_lookup_status === "failed" && row.match_confidence === "unmatched") {
    return false;
  }

  if (row.requires_review_approval && reviewDecision !== "approve") {
    return false;
  }

  if (row.match_confidence === "low" || row.match_confidence === "unmatched") {
    return false;
  }

  if (row.action === "blocked") {
    return false;
  }

  if (row.final_price !== null) {
    return true;
  }

  const parsedManualPrice = Number.parseFloat(manualPrice || "");
  return Number.isFinite(parsedManualPrice) && parsedManualPrice > 0;
}

function formatSellerLabel(seller: AdminInventorySellerOption) {
  return seller.display_name || seller.full_name || seller.username || seller.email;
}
